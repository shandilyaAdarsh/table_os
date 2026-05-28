import { MutationIdentity } from '../mutation/MutationGateway';
import { RuntimeDomain } from '../realtime/RealtimeEventRouter';
import { RuntimeState } from '../transport/RuntimeTransportManager';

// ─── Telemetry Event Types ──────────────────────────────────────────────────

export type TelemetryEventType =
  // Transport
  | 'TRANSPORT_CONNECTED'
  | 'TRANSPORT_DISCONNECTED'
  | 'TRANSPORT_RECONNECT_STARTED'
  | 'TRANSPORT_RECONNECT_SUCCEEDED'
  | 'TRANSPORT_RECONNECT_FAILED'
  | 'TRANSPORT_DEGRADED_POLLING_ENABLED'
  | 'TRANSPORT_DEGRADED_POLLING_DISABLED'
  | 'TRANSPORT_STATE_TRANSITION'
  // Projection
  | 'PROJECTION_REBUILD_STARTED'
  | 'PROJECTION_REBUILD_DEDUPLICATED'
  | 'PROJECTION_REBUILD_CANCELLED'
  | 'PROJECTION_REBUILD_APPLIED'
  | 'PROJECTION_REBUILD_REJECTED'
  | 'PROJECTION_REBUILD_STALE_IGNORED'
  | 'PROJECTION_REBUILD_FAILED'
  // Mutation
  | 'MUTATION_SUBMITTED'
  | 'MUTATION_ACKNOWLEDGED'
  | 'MUTATION_CONFIRMED'
  | 'MUTATION_STALLED'
  | 'MUTATION_RECOVERING'
  | 'MUTATION_REPLAYING'
  | 'MUTATION_FAILED'
  | 'MUTATION_REJECTED'
  // Replay
  | 'REPLAY_GAP_DETECTED'
  | 'REPLAY_RECOVERY_STARTED'
  | 'REPLAY_RECOVERY_COMPLETED'
  | 'REPLAY_RECOVERY_FAILED'
  // Realtime
  | 'REALTIME_STALE_REJECTED'
  | 'REALTIME_DUPLICATE_COLLAPSED'
  | 'REALTIME_INVALIDATION_EMITTED'
  | 'REALTIME_DEBOUNCE_COLLAPSE'
  | 'REALTIME_MALFORMED_EVENT'
  | 'REALTIME_SEQUENCE_GAP'
  | 'REALTIME_WATERMARK_UPDATED'
  // Buffer
  | 'BUFFER_OVERFLOW';

export interface TelemetryEvent {
  timestamp: string;
  event_type: TelemetryEventType;
  surface?: string;
  [key: string]: any;
}

// ─── Runtime Snapshot (derived from buffer — no direct runtime access) ───────

export interface DomainStats {
  rebuildCount: number;
  cancelledCount: number;
  staleCount: number;
  failedCount: number;
  avgDurationMs: number;
  lastRebuildMs: number;
  watermark: number;
  gapCount: number;
  recoveryCount: number;
}

export interface RuntimeSnapshot {
  // Transport
  transportState: string;
  isRealtimeConnected: boolean;
  isDegraded: boolean;
  isRecovering: boolean;
  reconnectAttempts: number;
  reconnectFailures: number;
  degradedPollingActive: boolean;
  lastConnectionId: string;
  // Mutation
  mutationSubmitted: number;
  mutationAcknowledged: number;
  mutationConfirmed: number;
  mutationStalled: number;
  mutationFailed: number;
  mutationRejected: number;
  // Domains
  domains: Record<string, DomainStats>;
  watermarks: Record<string, number>;
  // Realtime
  staleRejected: number;
  debounceCollapses: number;
  invalidationsEmitted: number;
  malformedEvents: number;
  sequenceGaps: number;
  // Buffer health
  bufferSize: number;
  droppedEvents: number;
  bufferOverflows: number;
}

// ─── Ring buffer constants ───────────────────────────────────────────────────

const MAX_BUFFER_SIZE = 500;

// ─── RuntimeObservabilityLayer ──────────────────────────────────────────────

export class RuntimeObservabilityLayer {
  private eventBuffer: TelemetryEvent[] = [];
  private currentSurface: string = 'unknown';
  private currentConnectionId: string = crypto.randomUUID();

  // Buffer overflow tracking
  private droppedEvents: number = 0;
  private bufferOverflows: number = 0;

  // Watermark cache (updated via telemetry — panel never reads router directly)
  private watermarkCache: Record<string, number> = {};

  public setSurface(surfaceId: string): void {
    this.currentSurface = surfaceId;
  }

  public generateRequestId(): string {
    return crypto.randomUUID();
  }

  /**
   * Core structured telemetry emitter.
   * ALL runtime observable events flow through here.
   */
  private emit(
    level: 'info' | 'warn' | 'error' | 'debug',
    eventType: TelemetryEventType,
    fields: Record<string, any>
  ): void {
    const event: TelemetryEvent = {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      surface: this.currentSurface,
      ...fields,
    };

    // Ring buffer overflow: evict oldest, track drop count
    if (this.eventBuffer.length >= MAX_BUFFER_SIZE) {
      this.eventBuffer.shift();
      this.droppedEvents++;
      this.bufferOverflows++;

      // Emit a single overflow marker (don't recurse — push directly)
      if (this.bufferOverflows % 50 === 1) {
        this.eventBuffer.push({
          timestamp: new Date().toISOString(),
          event_type: 'BUFFER_OVERFLOW',
          surface: this.currentSurface,
          dropped_total: this.droppedEvents,
          overflow_count: this.bufferOverflows,
        });
      }
    }

    this.eventBuffer.push(event);

    const line = JSON.stringify(event);
    switch (level) {
      case 'info':  console.info(`[OBS] ${line}`); break;
      case 'warn':  console.warn(`[OBS] ${line}`); break;
      case 'error': console.error(`[OBS] ${line}`); break;
      case 'debug': console.debug(`[OBS] ${line}`); break;
    }
  }

  // ─── Buffer Query API ─────────────────────────────────────────────────────

  public getEventBuffer(): TelemetryEvent[] {
    return [...this.eventBuffer];
  }

  public getEventsByType(type: TelemetryEventType): TelemetryEvent[] {
    return this.eventBuffer.filter(e => e.event_type === type);
  }

  public getEventsByDomain(domain: RuntimeDomain): TelemetryEvent[] {
    return this.eventBuffer.filter(e => e.domain === domain);
  }

  public getDroppedEventCount(): number {
    return this.droppedEvents;
  }

  public clearBuffer(): void {
    this.eventBuffer = [];
    this.droppedEvents = 0;
    this.bufferOverflows = 0;
  }

  /**
   * Derives a full runtime snapshot from the telemetry buffer.
   * Panel consumes ONLY this — zero direct runtime access.
   */
  public getRuntimeSnapshot(): RuntimeSnapshot {
    const buf = this.eventBuffer;

    // ── Transport state ─────────────────────────────────────────────────────
    const stateEvents = buf.filter(e => e.event_type === 'TRANSPORT_STATE_TRANSITION');
    const lastState = stateEvents.at(-1);
    const transportState = lastState?.to_state ?? 'BOOTSTRAPPING';
    const isDegraded = transportState === 'DEGRADED';
    const isRecovering = transportState === 'RECOVERING';
    const isRealtimeConnected = transportState === 'LIVE';

    const reconnectStarts = buf.filter(e => e.event_type === 'TRANSPORT_RECONNECT_STARTED');
    const reconnectFails = buf.filter(e => e.event_type === 'TRANSPORT_RECONNECT_FAILED');
    const reconnectAttempts = reconnectStarts.length;
    const reconnectFailures = reconnectFails.length;

    const pollingEnables = buf.filter(e => e.event_type === 'TRANSPORT_DEGRADED_POLLING_ENABLED');
    const pollingDisables = buf.filter(e => e.event_type === 'TRANSPORT_DEGRADED_POLLING_DISABLED');
    const degradedPollingActive = pollingEnables.length > pollingDisables.length;

    const lastConn = buf.filter(e => e.event_type === 'TRANSPORT_CONNECTED').at(-1);
    const lastConnectionId = lastConn?.connection_id ?? this.currentConnectionId;

    // ── Mutation counters ────────────────────────────────────────────────────
    const mutationSubmitted    = buf.filter(e => e.event_type === 'MUTATION_SUBMITTED').length;
    const mutationAcknowledged = buf.filter(e => e.event_type === 'MUTATION_ACKNOWLEDGED').length;
    const mutationConfirmed    = buf.filter(e => e.event_type === 'MUTATION_CONFIRMED').length;
    const mutationStalled      = buf.filter(e => e.event_type === 'MUTATION_STALLED').length;
    const mutationFailed       = buf.filter(e => e.event_type === 'MUTATION_FAILED').length;
    const mutationRejected     = buf.filter(e => e.event_type === 'MUTATION_REJECTED').length;

    // ── Domain stats ─────────────────────────────────────────────────────────
    const ALL_DOMAINS = ['orders', 'tables', 'kds', 'analytics', 'system'];
    const domains: Record<string, DomainStats> = {};

    for (const domain of ALL_DOMAINS) {
      const domainBuf = buf.filter(e => e.domain === domain);

      const rebuildsStarted  = domainBuf.filter(e => e.event_type === 'PROJECTION_REBUILD_STARTED');
      const rebuildsApplied  = domainBuf.filter(e => e.event_type === 'PROJECTION_REBUILD_APPLIED');
      const rebuildsCancelled = domainBuf.filter(e => e.event_type === 'PROJECTION_REBUILD_CANCELLED');
      const rebuildsStale    = domainBuf.filter(e => e.event_type === 'PROJECTION_REBUILD_STALE_IGNORED');
      const rebuildsFailed   = domainBuf.filter(e => e.event_type === 'PROJECTION_REBUILD_FAILED');

      const durations = rebuildsApplied.map(e => e.rebuild_duration_ms ?? 0).filter(Boolean);
      const avgDurationMs = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
      const lastRebuildMs = rebuildsApplied.at(-1)?.rebuild_duration_ms ?? 0;

      const watermarkEvents = domainBuf.filter(e => e.event_type === 'REALTIME_WATERMARK_UPDATED');
      const watermark = watermarkEvents.at(-1)?.watermark ?? this.watermarkCache[domain] ?? 0;

      const gapCount = domainBuf.filter(e => e.event_type === 'REPLAY_GAP_DETECTED').length;
      const recoveryCount = domainBuf.filter(e => e.event_type === 'REPLAY_RECOVERY_COMPLETED').length;

      domains[domain] = {
        rebuildCount: rebuildsStarted.length,
        cancelledCount: rebuildsCancelled.length,
        staleCount: rebuildsStale.length,
        failedCount: rebuildsFailed.length,
        avgDurationMs,
        lastRebuildMs,
        watermark,
        gapCount,
        recoveryCount,
      };
    }

    // ── Watermarks ────────────────────────────────────────────────────────────
    const watermarks: Record<string, number> = {};
    for (const domain of ALL_DOMAINS) {
      watermarks[domain] = domains[domain].watermark;
    }

    // ── Realtime ─────────────────────────────────────────────────────────────
    const staleRejected       = buf.filter(e => e.event_type === 'REALTIME_STALE_REJECTED').length;
    const debounceCollapses   = buf.filter(e => e.event_type === 'REALTIME_DEBOUNCE_COLLAPSE').length;
    const invalidationsEmitted = buf.filter(e => e.event_type === 'REALTIME_INVALIDATION_EMITTED').length;
    const malformedEvents     = buf.filter(e => e.event_type === 'REALTIME_MALFORMED_EVENT').length;
    const sequenceGaps        = buf.filter(e => e.event_type === 'REALTIME_SEQUENCE_GAP').length;

    return {
      transportState,
      isRealtimeConnected,
      isDegraded,
      isRecovering,
      reconnectAttempts,
      reconnectFailures,
      degradedPollingActive,
      lastConnectionId,
      mutationSubmitted,
      mutationAcknowledged,
      mutationConfirmed,
      mutationStalled,
      mutationFailed,
      mutationRejected,
      domains,
      watermarks,
      staleRejected,
      debounceCollapses,
      invalidationsEmitted,
      malformedEvents,
      sequenceGaps,
      bufferSize: this.eventBuffer.length,
      droppedEvents: this.droppedEvents,
      bufferOverflows: this.bufferOverflows,
    };
  }

  // ─── Transport Events ─────────────────────────────────────────────────────

  public recordTransportConnected(latencyMs?: number): void {
    this.currentConnectionId = crypto.randomUUID();
    this.emit('info', 'TRANSPORT_CONNECTED', {
      connection_id: this.currentConnectionId,
      latency_ms: latencyMs,
    });
  }

  public recordTransportDisconnected(): void {
    this.emit('warn', 'TRANSPORT_DISCONNECTED', {
      connection_id: this.currentConnectionId,
    });
  }

  public recordReconnectStarted(attempt: number): void {
    this.emit('info', 'TRANSPORT_RECONNECT_STARTED', {
      connection_id: this.currentConnectionId,
      attempt,
    });
  }

  public recordReconnectSucceeded(attempt: number, latencyMs: number): void {
    this.emit('info', 'TRANSPORT_RECONNECT_SUCCEEDED', {
      connection_id: this.currentConnectionId,
      attempt,
      latency_ms: latencyMs,
    });
  }

  public recordReconnectFailed(attempt: number, reason?: string): void {
    this.emit('error', 'TRANSPORT_RECONNECT_FAILED', {
      connection_id: this.currentConnectionId,
      attempt,
      reason,
    });
  }

  public recordDegradedPollingEnabled(): void {
    this.emit('warn', 'TRANSPORT_DEGRADED_POLLING_ENABLED', {
      connection_id: this.currentConnectionId,
    });
  }

  public recordDegradedPollingDisabled(): void {
    this.emit('info', 'TRANSPORT_DEGRADED_POLLING_DISABLED', {
      connection_id: this.currentConnectionId,
    });
  }

  public recordStateTransition(from: RuntimeState, to: RuntimeState): void {
    this.emit('info', 'TRANSPORT_STATE_TRANSITION', {
      from_state: from,
      to_state: to,
      connection_id: this.currentConnectionId,
    });
  }

  // ─── Projection Events ────────────────────────────────────────────────────

  public recordProjectionRebuildStarted(domain: RuntimeDomain, epoch: number, watermark: number, source: string): void {
    this.emit('info', 'PROJECTION_REBUILD_STARTED', {
      domain, epoch, watermark, source,
    });
  }

  public recordProjectionRebuildDeduplicated(domain: RuntimeDomain, epoch: number): void {
    this.emit('debug', 'PROJECTION_REBUILD_DEDUPLICATED', {
      domain, epoch,
    });
  }

  public recordProjectionRebuildCancelled(domain: RuntimeDomain, epoch: number, reason: string): void {
    this.emit('debug', 'PROJECTION_REBUILD_CANCELLED', {
      domain, epoch, reason,
    });
  }

  public recordProjectionRebuildApplied(domain: RuntimeDomain, epoch: number, watermark: number, durationMs: number): void {
    this.emit('info', 'PROJECTION_REBUILD_APPLIED', {
      domain, epoch, watermark, rebuild_duration_ms: durationMs,
    });
  }

  public recordProjectionRebuildRejected(domain: RuntimeDomain, epoch: number, reason: string): void {
    this.emit('warn', 'PROJECTION_REBUILD_REJECTED', {
      domain, epoch, reason,
    });
  }

  public recordProjectionStaleIgnored(domain: RuntimeDomain, incomingVersion: number, localWatermark: number): void {
    this.emit('warn', 'PROJECTION_REBUILD_STALE_IGNORED', {
      domain,
      incoming_version: incomingVersion,
      local_watermark: localWatermark,
    });
  }

  /** @deprecated Use granular methods above. Kept for backward compat. */
  public recordProjectionRebuild(domain: RuntimeDomain, durationMs: number, success: boolean, meta?: Record<string, any>): void {
    if (success) {
      this.recordProjectionRebuildApplied(domain, meta?.epoch ?? 0, meta?.newWatermark ?? 0, durationMs);
    } else {
      const reason = meta?.reason || meta?.error || 'UNKNOWN';
      if (reason === 'CANCELLED_BY_NEW_INVALIDATION') {
        this.recordProjectionRebuildCancelled(domain, meta?.epoch ?? 0, reason);
      } else {
        this.emit('error', 'PROJECTION_REBUILD_FAILED', { domain, rebuild_duration_ms: durationMs, reason, ...meta });
      }
    }
  }

  // ─── Mutation Events ──────────────────────────────────────────────────────

  public recordMutationStart(identity: MutationIdentity): void {
    this.emit('info', 'MUTATION_SUBMITTED', {
      mutation_id: identity.request_id,
      mutation_sequence: identity.mutation_sequence,
      idempotency_key: identity.idempotency_key,
      request_id: identity.request_id,
    });
  }

  public recordMutationSuccess(identity: MutationIdentity): void {
    this.emit('info', 'MUTATION_ACKNOWLEDGED', {
      mutation_id: identity.request_id,
      mutation_sequence: identity.mutation_sequence,
      idempotency_key: identity.idempotency_key,
      request_id: identity.request_id,
    });
  }

  public recordMutationConfirmed(idempotencyKey: string, mutationSequence: number): void {
    this.emit('info', 'MUTATION_CONFIRMED', {
      idempotency_key: idempotencyKey,
      mutation_sequence: mutationSequence,
    });
  }

  public recordMutationStalled(idempotencyKey: string, mutationSequence: number): void {
    this.emit('warn', 'MUTATION_STALLED', {
      idempotency_key: idempotencyKey,
      mutation_sequence: mutationSequence,
    });
  }

  public recordMutationRecovering(idempotencyKey: string): void {
    this.emit('warn', 'MUTATION_RECOVERING', {
      idempotency_key: idempotencyKey,
    });
  }

  public recordMutationError(identity: MutationIdentity, statusCode: number, error?: Error): void {
    const eventType: TelemetryEventType = statusCode >= 400 && statusCode < 500
      ? 'MUTATION_REJECTED'
      : 'MUTATION_FAILED';

    this.emit('error', eventType, {
      mutation_id: identity.request_id,
      mutation_sequence: identity.mutation_sequence,
      idempotency_key: identity.idempotency_key,
      request_id: identity.request_id,
      status_code: statusCode,
      error_message: error?.message,
    });
  }

  // ─── Replay Events ────────────────────────────────────────────────────────

  public recordGapDetected(domain: RuntimeDomain, expectedWatermark: number, receivedWatermark: number): void {
    this.emit('warn', 'REPLAY_GAP_DETECTED', {
      domain,
      expected_watermark: expectedWatermark,
      received_watermark: receivedWatermark,
    });
  }

  public recordRecoveryStart(domain: RuntimeDomain, expectedWatermark: number, receivedWatermark: number): void {
    this.emit('info', 'REPLAY_RECOVERY_STARTED', {
      domain,
      expected_watermark: expectedWatermark,
      received_watermark: receivedWatermark,
    });
  }

  public recordRecoverySuccess(domain: RuntimeDomain, durationMs?: number): void {
    this.emit('info', 'REPLAY_RECOVERY_COMPLETED', {
      domain,
      recovery_duration_ms: durationMs,
    });
  }

  public recordRecoveryError(domain: RuntimeDomain, error: Error, durationMs?: number): void {
    this.emit('error', 'REPLAY_RECOVERY_FAILED', {
      domain,
      error_message: error.message,
      recovery_duration_ms: durationMs,
    });
  }

  // ─── Realtime Events ─────────────────────────────────────────────────────

  public recordMalformedEvent(event: any): void {
    this.emit('warn', 'REALTIME_MALFORMED_EVENT', { raw_event: JSON.stringify(event) });
  }

  public recordStaleEventRejection(domain: RuntimeDomain, incomingVersion: number, localWatermark: number): void {
    this.emit('debug', 'REALTIME_STALE_REJECTED', {
      domain,
      incoming_version: incomingVersion,
      local_watermark: localWatermark,
    });
  }

  public recordSequenceGap(domain: RuntimeDomain, localWatermark: number, incomingVersion: number): void {
    this.emit('warn', 'REALTIME_SEQUENCE_GAP', {
      domain,
      local_watermark: localWatermark,
      incoming_version: incomingVersion,
    });
  }

  public recordWatermarkUpdated(domain: RuntimeDomain, watermark: number): void {
    this.watermarkCache[domain] = watermark;
    this.emit('debug', 'REALTIME_WATERMARK_UPDATED', {
      domain,
      watermark,
    });
  }

  public recordInvalidationEmitted(domain: RuntimeDomain, watermark: number, collapseSize: number): void {
    this.emit('debug', 'REALTIME_INVALIDATION_EMITTED', {
      domain,
      watermark,
      collapse_size: collapseSize,
    });
  }

  public recordDebounceCollapse(domain: RuntimeDomain, collapseCount: number): void {
    this.emit('debug', 'REALTIME_DEBOUNCE_COLLAPSE', {
      domain,
      collapse_size: collapseCount,
    });
  }
}
