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
  | 'REALTIME_SEQUENCE_GAP';

export interface TelemetryEvent {
  timestamp: string;
  event_type: TelemetryEventType;
  [key: string]: any;
}

// ─── Telemetry Ring Buffer ──────────────────────────────────────────────────

const MAX_BUFFER_SIZE = 500;

// ─── RuntimeObservabilityLayer ──────────────────────────────────────────────

export class RuntimeObservabilityLayer {
  private eventBuffer: TelemetryEvent[] = [];
  private currentSurface: string = 'unknown';
  private currentConnectionId: string = crypto.randomUUID();

  public setSurface(surfaceId: string): void {
    this.currentSurface = surfaceId;
  }

  public generateRequestId(): string {
    return crypto.randomUUID();
  }

  /**
   * Core structured telemetry emitter. ALL runtime events flow through here.
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

    // Ring buffer — evict oldest when full
    if (this.eventBuffer.length >= MAX_BUFFER_SIZE) {
      this.eventBuffer.shift();
    }
    this.eventBuffer.push(event);

    // Structured console output
    const line = JSON.stringify(event);
    switch (level) {
      case 'info':  console.info(`[OBS] ${line}`); break;
      case 'warn':  console.warn(`[OBS] ${line}`); break;
      case 'error': console.error(`[OBS] ${line}`); break;
      case 'debug': console.debug(`[OBS] ${line}`); break;
    }
  }

  // ─── Telemetry Query API (for test harness + observability UI) ────────────

  public getEventBuffer(): TelemetryEvent[] {
    return [...this.eventBuffer];
  }

  public getEventsByType(type: TelemetryEventType): TelemetryEvent[] {
    return this.eventBuffer.filter(e => e.event_type === type);
  }

  public getEventsByDomain(domain: RuntimeDomain): TelemetryEvent[] {
    return this.eventBuffer.filter(e => e.domain === domain);
  }

  public clearBuffer(): void {
    this.eventBuffer = [];
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

  /** @deprecated Use granular methods above. Kept for backward compat during migration. */
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
      domain: 'unknown', // populated by caller context
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
