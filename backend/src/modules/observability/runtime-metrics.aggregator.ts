// ============================================================
// src/modules/observability/runtime-metrics.aggregator.ts
// In-memory deterministic runtime snapshot aggregation layer.
// ============================================================

import { RuntimeSnapshot, RuntimeEventTelemetry, RuntimeDomainHealth } from './telemetry.types';
import { RuntimeDivergenceDetector } from './runtime-divergence.detector';
import { TimeBucketTracker } from './time-bucket.aggregator';
import { CorrelationGraphIndexer } from './correlation-graph.indexer';

export class RuntimeMetricsAggregator {
  // Tenant-isolated states
  private static snapshots: Map<string, RuntimeSnapshot> = new Map();
  // Bounded event buffer per tenant (max 1000)
  private static eventBuffers: Map<string, RuntimeEventTelemetry[]> = new Map();
  private static readonly MAX_BUFFER_SIZE = 1000;

  // Trackers for time-windowed metrics (e.g. 5s buckets)
  private static reconnectTrackers: Map<string, TimeBucketTracker> = new Map();
  private static mutationStallTrackers: Map<string, TimeBucketTracker> = new Map();
  private static projectionDropTrackers: Map<string, TimeBucketTracker> = new Map();

  private static getTracker(map: Map<string, TimeBucketTracker>, key: string): TimeBucketTracker {
    if (!map.has(key)) {
      map.set(key, new TimeBucketTracker(5000)); // 5s buckets
    }
    return map.get(key)!;
  }

  private static getInitialSnapshot(tenantId: string): RuntimeSnapshot {
    return {
      tenantId,
      transportState: 'LIVE', // Defaulting to LIVE for backend, but this reflects overall mesh health in a real setup
      isDegraded: false,
      isRecovering: false,
      isRealtimeConnected: true,
      degradedPollingActive: false,
      reconnectAttempts: 0,
      reconnectFailures: 0,

      staleRejected: 0,
      debounceCollapses: 0,
      invalidationsEmitted: 0,
      sequenceGaps: 0,
      malformedEvents: 0,

      mutationSubmitted: 0,
      mutationAcknowledged: 0,
      mutationConfirmed: 0,
      mutationStalled: 0,
      mutationFailed: 0,
      mutationRejected: 0,

      bufferSize: 0,
      droppedEvents: 0,
      bufferOverflows: 0,

      domains: {
        orders: this.getInitialDomainHealth(),
        tables: this.getInitialDomainHealth(),
        kds: this.getInitialDomainHealth(),
        analytics: this.getInitialDomainHealth(),
        system: this.getInitialDomainHealth(),
      },
      activeAlerts: [],
      instability: {
        reconnectScore: 0,
        mutationScore: 0,
        projectionScore: 0,
        transportScore: 0,
        duplicateScore: 0,
        overallHealth: 'HEALTHY'
      },
      convergence: {
        surfaces: {},
        crossSurface: {
          watermarkParity: true,
          maxWatermarkDrift: 0,
          highestWatermark: 0,
          divergenceIncidentCount: 0,
          convergenceStabilityScore: 100
        }
      }
    };
  }

  private static getInitialDomainHealth(): RuntimeDomainHealth {
    return {
      watermark: 0,
      rebuildCount: 0,
      cancelledCount: 0,
      staleCount: 0,
      gapCount: 0,
      avgDurationMs: 0,
    };
  }

  public static getSnapshot(tenantId: string): RuntimeSnapshot {
    if (!this.snapshots.has(tenantId)) {
      this.snapshots.set(tenantId, this.getInitialSnapshot(tenantId));
    }
    const snapshot = this.snapshots.get(tenantId)!;
    // dynamically update bufferSize
    snapshot.bufferSize = this.eventBuffers.get(tenantId)?.length || 0;
    
    const mem = process.memoryUsage();
    snapshot.heapMetrics = {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external
    };

    return snapshot;
  }

  public static getEvents(tenantId: string): RuntimeEventTelemetry[] {
    return this.eventBuffers.get(tenantId) || [];
  }

  public static getEventsInWindow(tenantId: string, timeWindowMs: number): RuntimeEventTelemetry[] {
    const allEvents = this.getEvents(tenantId);
    const cutoff = Date.now() - timeWindowMs;
    return allEvents.filter(e => new Date(e.event_timestamp).getTime() >= cutoff);
  }

  public static ingestEvent(event: RuntimeEventTelemetry): void {
    const tenantId = event.tenant_id;
    const snapshot = this.getSnapshot(tenantId);

    // Buffer management
    if (!this.eventBuffers.has(tenantId)) {
      this.eventBuffers.set(tenantId, []);
    }
    const buffer = this.eventBuffers.get(tenantId)!;
    buffer.push(event);
    if (buffer.length > this.MAX_BUFFER_SIZE) {
      buffer.shift();
      snapshot.droppedEvents++;
    }

    CorrelationGraphIndexer.indexEvent(event);
    
    // Aggregation Logic based on event type
    switch (event.event_type) {
      case 'TRANSPORT_DEGRADED':
        snapshot.isDegraded = true;
        snapshot.transportState = 'DEGRADED';
        break;
      case 'TRANSPORT_RECONNECT_STARTED':
        snapshot.reconnectAttempts++;
        snapshot.transportState = 'RECONNECTING';
        this.getTracker(this.reconnectTrackers, tenantId).increment(1, new Date(event.event_timestamp).getTime());
        break;
      case 'TRANSPORT_DISCONNECTED':
        snapshot.transportState = 'DISCONNECTED';
        break;
      case 'TRANSPORT_CONNECTED':
      case 'TRANSPORT_RECONNECT_COMPLETED':
        snapshot.transportState = 'CONNECTED';
        break;

      case 'PROJECTION_REBUILD_STARTED':
        if (event.domain && snapshot.domains[event.domain]) {
          snapshot.domains[event.domain].rebuildCount++;
        }
        break;
      case 'PROJECTION_REBUILD_FAILED':
        if (event.domain && snapshot.domains[event.domain]) {
          snapshot.domains[event.domain].cancelledCount++;
        }
        break;
      case 'PROJECTION_REBUILD_COMPLETED':
        if (event.domain && snapshot.domains[event.domain]) {
          const d = snapshot.domains[event.domain];
          // update average duration
          const duration = event.metadata.duration_ms || 0;
          if (d.rebuildCount === 1) {
            d.avgDurationMs = duration;
          } else {
            d.avgDurationMs = (d.avgDurationMs * (d.rebuildCount - 1) + duration) / d.rebuildCount;
          }
          if (event.sequence && event.sequence > d.watermark) {
            d.watermark = event.sequence;
          }
        }
        break;

      case 'REPLAY_GAP_DETECTED':
        snapshot.sequenceGaps++;
        if (event.domain && snapshot.domains[event.domain]) {
          snapshot.domains[event.domain].gapCount++;
        }
        break;

      case 'STALE_PAYLOAD_REJECTED':
        snapshot.staleRejected++;
        if (event.domain && snapshot.domains[event.domain]) {
          snapshot.domains[event.domain].staleCount++;
        }
        this.getTracker(this.projectionDropTrackers, tenantId).increment(1, new Date(event.event_timestamp).getTime());
        break;

      // Mutation Tracking
      case 'MUTATION_QUEUED':
        snapshot.mutationSubmitted++;
        break;
      case 'MUTATION_ACKNOWLEDGED':
        snapshot.mutationAcknowledged++;
        break;
      case 'MUTATION_REPLAY_CONFIRMED':
        snapshot.mutationConfirmed++;
        break;
      case 'MUTATION_OCC_CONFLICT':
        snapshot.mutationStalled++;
        this.getTracker(this.mutationStallTrackers, tenantId).increment(1, new Date(event.event_timestamp).getTime());
        break;
      case 'MUTATION_FAILED':
        snapshot.mutationFailed++;
        break;
    }

    // Update convergence matrix
    if (event.runtime_surface) {
      if (!snapshot.convergence.surfaces[event.runtime_surface]) {
        snapshot.convergence.surfaces[event.runtime_surface] = {
          surface: event.runtime_surface as any,
          currentWatermark: 0,
          replayWatermark: 0,
          replayLag: 0,
          mutationQueueDepth: 0,
          duplicateSuppressionCount: 0,
          staleRejectionCount: 0,
          projectionFreshnessAgeMs: 0,
          rebuildQueuePressure: 0,
          isStale: false,
          transportDegradationState: 'HEALTHY',
          lastSeenTimestamp: event.event_timestamp,
          reconnectAttempts: 0
        };
      }
      const surfaceState = snapshot.convergence.surfaces[event.runtime_surface];
      surfaceState.lastSeenTimestamp = event.event_timestamp;
      
      if (event.sequence && event.sequence > surfaceState.currentWatermark) {
        surfaceState.currentWatermark = event.sequence;
      }
      
      if (event.event_type === 'TRANSPORT_RECONNECT_STARTED') {
        surfaceState.reconnectAttempts++;
      } else if (event.event_type === 'TRANSPORT_CONNECTED') {
        surfaceState.reconnectAttempts = 0;
        surfaceState.transportDegradationState = 'HEALTHY';
      } else if (event.event_type === 'TRANSPORT_DEGRADED') {
        surfaceState.transportDegradationState = 'DEGRADED';
      } else if (event.event_type === 'TRANSPORT_DISCONNECTED') {
        surfaceState.transportDegradationState = 'DISCONNECTED';
      }

      if (event.event_type === 'STALE_PAYLOAD_REJECTED') {
        surfaceState.isStale = true;
        surfaceState.staleRejectionCount++;
      } else if (event.event_type === 'PROJECTION_REBUILD_COMPLETED') {
        surfaceState.isStale = false;
      } else if (event.event_type === 'DUPLICATE_REPLAY_STORM_DETECTED') {
        surfaceState.duplicateSuppressionCount++;
      }
    }

    // Run passive divergence detection (telemetry-only, no mutation)
    if (event.domain) {
      const recentEvents = this.getEventsInWindow(tenantId, 60000); // 60s rolling window
      RuntimeDivergenceDetector.evaluateSnapshot(tenantId, event.domain, snapshot, recentEvents);
    }
    
    // Update instability scores
    this.evaluateInstability(tenantId, snapshot);
    this.evaluateCrossSurfaceParity(snapshot);
  }

  private static evaluateCrossSurfaceParity(snapshot: RuntimeSnapshot) {
    let highestWatermark = 0;
    let lowestWatermark = Infinity;
    
    for (const surface of Object.values(snapshot.convergence.surfaces)) {
      if (surface.currentWatermark > highestWatermark) highestWatermark = surface.currentWatermark;
      if (surface.currentWatermark < lowestWatermark) lowestWatermark = surface.currentWatermark;
    }
    
    if (lowestWatermark === Infinity) lowestWatermark = 0;

    const maxDrift = highestWatermark - lowestWatermark;
    const parity = maxDrift <= 5; // Allow a small threshold

    snapshot.convergence.crossSurface.highestWatermark = highestWatermark;
    snapshot.convergence.crossSurface.maxWatermarkDrift = maxDrift;
    snapshot.convergence.crossSurface.watermarkParity = parity;
    snapshot.convergence.crossSurface.divergenceIncidentCount = snapshot.activeAlerts.length;
    snapshot.convergence.crossSurface.convergenceStabilityScore = parity ? 100 : Math.max(0, 100 - maxDrift);
  }

  private static evaluateInstability(tenantId: string, snapshot: RuntimeSnapshot): void {
    const now = Date.now();
    // Rolling metrics over the last 5 minutes (300,000 ms)
    const rollingReconnects = this.getTracker(this.reconnectTrackers, tenantId).getSumInWindow(300000, now);
    const rollingStalls = this.getTracker(this.mutationStallTrackers, tenantId).getSumInWindow(300000, now);
    const rollingDrops = this.getTracker(this.projectionDropTrackers, tenantId).getSumInWindow(300000, now);

    // Score based on rolling windows instead of unbounded counters
    const reconnectScore = Math.min(100, rollingReconnects * 10);
    const mutationScore = Math.min(100, rollingStalls * 10);
    const projectionScore = Math.min(100, rollingDrops * 10);
    
    const transportScore = snapshot.isDegraded ? 80 : (snapshot.transportState === 'DISCONNECTED' ? 100 : 0);
    const duplicateScore = Math.min(100, snapshot.staleRejected * 2 + snapshot.droppedEvents * 5); // Kept global for simplicity in demo

    snapshot.instability.reconnectScore = reconnectScore;
    snapshot.instability.mutationScore = mutationScore;
    snapshot.instability.projectionScore = projectionScore;
    snapshot.instability.transportScore = transportScore;
    snapshot.instability.duplicateScore = duplicateScore;

    const maxScore = Math.max(reconnectScore, mutationScore, projectionScore, transportScore, duplicateScore);
    
    if (maxScore > 80 || snapshot.transportState === 'DISCONNECTED') {
      snapshot.instability.overallHealth = 'CRITICAL';
    } else if (maxScore > 50) {
      snapshot.instability.overallHealth = 'UNSTABLE';
    } else if (maxScore > 20 || snapshot.isDegraded) {
      snapshot.instability.overallHealth = 'DEGRADED';
    } else {
      snapshot.instability.overallHealth = 'HEALTHY';
    }
  }

  /**
   * Cleans up idle tenants that haven't received events in a while.
   * In a real deployment, this would be tied to a TTL scheduler.
   */
  public static clearTenant(tenantId: string): void {
    this.snapshots.delete(tenantId);
    this.eventBuffers.delete(tenantId);
    this.reconnectTrackers.delete(tenantId);
    this.mutationStallTrackers.delete(tenantId);
    this.projectionDropTrackers.delete(tenantId);
  }
}
