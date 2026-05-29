// ============================================================
// src/modules/observability/runtime-divergence.detector.ts
// Passive engine consuming normalized telemetry states to detect runtime anomalies.
// CRITICAL: MUST NEVER MUTATE RUNTIME STATE.
// ============================================================

import { RuntimeSnapshot, RuntimeEventTelemetry, TelemetryEventType } from './telemetry.types';
import { TelemetryBroadcaster } from './telemetry.broadcaster';

interface DetectorState {
  lastWatermark: number;
  lastReplayStart: number;
  lastReplayTime: number;
  lastProjectionRebuild: number;
}

export class RuntimeDivergenceDetector {
  // Detector Cooldown Windows to prevent emission storms
  // max identical detector emission once every 30s per tenant/domain pair
  private static cooldowns: Map<string, number> = new Map();
  private static COOLDOWN_MS = 30_000;

  // Track state for temporal divergence detection (per tenant/domain)
  private static states: Map<string, DetectorState> = new Map();

  /**
   * Run the divergence detection suite on the normalized state.
   */
  public static evaluateSnapshot(
    tenantId: string, 
    domain: string,
    snapshot: RuntimeSnapshot, 
    recentEvents: RuntimeEventTelemetry[]
  ): void {
    const domainHealth = snapshot.domains[domain];
    if (!domainHealth) return;

    const stateKey = `${tenantId}:${domain}`;
    if (!this.states.has(stateKey)) {
      this.states.set(stateKey, { 
        lastWatermark: domainHealth.watermark, 
        lastReplayStart: 0, 
        lastReplayTime: Date.now(),
        lastProjectionRebuild: Date.now() 
      });
    }
    const state = this.states.get(stateKey)!;

    // 1. Watermark Rollback Detector
    if (domainHealth.watermark < state.lastWatermark) {
      this.emit(tenantId, domain, snapshot, 'WATERMARK_ROLLBACK_DETECTED', {
        previous: state.lastWatermark,
        current: domainHealth.watermark
      });
    }
    state.lastWatermark = Math.max(state.lastWatermark, domainHealth.watermark);

    // 2. Replay Loop Detector
    // Detect repeated replay cycles by counting REPLAY_STARTED within the recent events window
    const replayStarts = recentEvents.filter(e => e.domain === domain && e.event_type === 'REPLAY_STARTED').length;
    if (replayStarts > 3) {
      this.emit(tenantId, domain, snapshot, 'REPLAY_LOOP_DETECTED', {
        starts_in_window: replayStarts
      });
    }

    // 3. Projection Drift Detector
    // Detect stale projections lagging replay watermarks or rebuild starvation
    if (domainHealth.gapCount > 10 || domainHealth.cancelledCount > 5) {
      this.emit(tenantId, domain, snapshot, 'PROJECTION_DRIFT_DETECTED', {
        gaps: domainHealth.gapCount,
        cancelled: domainHealth.cancelledCount
      });
    }

    // 4. Duplicate Replay Storm Detector
    const dropped = snapshot.droppedEvents;
    if (dropped > 50) {
      this.emit(tenantId, domain, snapshot, 'DUPLICATE_REPLAY_STORM_DETECTED', {
        dropped_events: dropped,
        buffer_size: snapshot.bufferSize
      });
    }

    // 5. Transport Divergence Detector
    if (snapshot.reconnectFailures > 5 || snapshot.reconnectAttempts > 10 || snapshot.isDegraded) {
      this.emit(tenantId, domain, snapshot, 'TRANSPORT_DIVERGENCE_DETECTED', {
        failures: snapshot.reconnectFailures,
        attempts: snapshot.reconnectAttempts,
        degraded: snapshot.isDegraded
      });
    }

    // --- NEW CHRONIC DRIFT DETECTORS ---

    const now = Date.now();

    // 6. Projection Freshness Decay
    const rebuilds = recentEvents.filter(e => e.domain === domain && e.event_type === 'PROJECTION_REBUILD_COMPLETED');
    if (rebuilds.length > 0) {
      state.lastProjectionRebuild = now;
    } else if (now - state.lastProjectionRebuild > 60000) { // No rebuilds in 60s
      this.emit(tenantId, domain, snapshot, 'PROJECTION_DRIFT_DETECTED', {
        decay_ms: now - state.lastProjectionRebuild
      });
    }

    // 7. Gradual Replay Lag
    const replays = recentEvents.filter(e => e.domain === domain && e.event_type.startsWith('REPLAY_'));
    if (replays.length > 0) {
      state.lastReplayTime = now;
    } else if (now - state.lastReplayTime > 120000 && snapshot.sequenceGaps > 0) {
      this.emit(tenantId, domain, snapshot, 'REPLAY_LAG_DETECTED', {
        lag_ms: now - state.lastReplayTime,
        unresolved_gaps: snapshot.sequenceGaps
      });
    }

    // 8. Queue Starvation & Mutation Propagation Slowdown
    // If queued > acked + stalled by a significant margin for long periods
    const inflight = snapshot.mutationSubmitted - snapshot.mutationAcknowledged - snapshot.staleRejected - snapshot.mutationStalled;
    if (inflight > 5) {
      this.emit(tenantId, domain, snapshot, 'QUEUE_STARVATION_DETECTED', {
        inflight_count: inflight
      });
    }
  }

  /**
   * Safely emit divergence telemetry using cooldown suppression.
   */
  private static emit(tenantId: string, domain: string, snapshot: RuntimeSnapshot, type: TelemetryEventType, metadata: any): void {
    const cooldownKey = `${tenantId}:${domain}:${type}`;
    const now = Date.now();
    
    if (this.cooldowns.has(cooldownKey)) {
      if (now - this.cooldowns.get(cooldownKey)! < this.COOLDOWN_MS) {
        // Just increment count in snapshot if it already exists
        const existing = snapshot.activeAlerts.find(a => a.event_type === type && a.domain === domain);
        if (existing) existing.count++;
        return; // Suppress duplicate emission
      }
    }

    this.cooldowns.set(cooldownKey, now);
    const incident_id = `inc_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const acuteTypes = ['WATERMARK_ROLLBACK_DETECTED', 'DUPLICATE_REPLAY_STORM_DETECTED', 'REPLAY_LOOP_DETECTED', 'TRANSPORT_DIVERGENCE_DETECTED'];
    const driftClass = acuteTypes.includes(type) ? 'ACUTE' : 'CHRONIC';

    snapshot.activeAlerts.push({
      incident_id,
      event_type: type,
      severity: 'CRITICAL',
      domain: domain,
      runtime_surface: 'BACKEND_ENGINE',
      timestamp: new Date().toISOString(),
      count: 1,
      metadata: { ...metadata, drift_classification: driftClass }
    });

    // Keep activeAlerts bounded (max 50)
    if (snapshot.activeAlerts.length > 50) {
      snapshot.activeAlerts.shift();
    }

    TelemetryBroadcaster.enqueue({
      tenant_id: tenantId,
      runtime_surface: 'BACKEND_ENGINE',
      domain: domain as any,
      event_type: type,
      severity: 'CRITICAL',
      incident_id: incident_id,
      metadata: metadata
    });
  }
}
