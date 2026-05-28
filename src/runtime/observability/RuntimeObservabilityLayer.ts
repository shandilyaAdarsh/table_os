import { MutationIdentity } from '../mutation/MutationGateway';
import { RuntimeDomain } from '../realtime/RealtimeEventRouter';
import { RuntimeState } from '../transport/RuntimeTransportManager';

export class RuntimeObservabilityLayer {
  
  public generateRequestId(): string {
    return crypto.randomUUID();
  }

  // --- Structured Logging ---
  private emitStructuredLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    eventType: string,
    payload: Record<string, any>
  ): void {
    const log = {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      ...payload
    };

    const formattedLog = JSON.stringify(log);
    
    switch (level) {
      case 'info': console.info(formattedLog); break;
      case 'warn': console.warn(formattedLog); break;
      case 'error': console.error(formattedLog); break;
      case 'debug': console.debug(formattedLog); break;
    }
  }

  // --- Mutation Tracing ---
  public recordMutationStart(identity: MutationIdentity): void {
    this.emitStructuredLog('info', 'MUTATION_STARTED', {
      mutation_sequence: identity.mutation_sequence,
      idempotency_key: identity.idempotency_key,
      surface: identity.surface_id,
      request_id: identity.request_id
    });
  }

  public recordMutationSuccess(identity: MutationIdentity): void {
    this.emitStructuredLog('info', 'MUTATION_ACKNOWLEDGED', {
      mutation_sequence: identity.mutation_sequence,
      idempotency_key: identity.idempotency_key,
      surface: identity.surface_id,
      request_id: identity.request_id
    });
  }

  public recordMutationError(identity: MutationIdentity, statusCode: number, error?: Error): void {
    this.emitStructuredLog('error', 'MUTATION_FAILED', {
      mutation_sequence: identity.mutation_sequence,
      idempotency_key: identity.idempotency_key,
      surface: identity.surface_id,
      request_id: identity.request_id,
      status_code: statusCode,
      error: error?.message
    });
  }

  // --- Realtime / Divergence Telemetry ---
  public recordMalformedEvent(event: any): void {
    this.emitStructuredLog('warn', 'MALFORMED_EVENT_RECEIVED', { event });
  }

  public recordStaleEventRejection(domain: RuntimeDomain, incomingVersion: number, currentWatermark: number): void {
    this.emitStructuredLog('debug', 'STALE_EVENT_REJECTED', {
      domain,
      watermark: currentWatermark,
      incoming_version: incomingVersion
    });
  }

  public recordSequenceGap(domain: RuntimeDomain, expected: number, actual: number): void {
    this.emitStructuredLog('warn', 'SEQUENCE_GAP_DETECTED', {
      domain,
      expected,
      actual
    });
  }

  // --- Recovery Telemetry ---
  public recordRecoveryStart(domain: RuntimeDomain, expected: number, actual: number): void {
    this.emitStructuredLog('info', 'RECOVERY_STARTED', { domain, expected, actual });
  }

  public recordRecoverySuccess(domain: RuntimeDomain): void {
    this.emitStructuredLog('info', 'RECOVERY_SUCCEEDED', { domain });
  }

  public recordRecoveryError(domain: RuntimeDomain, error: Error): void {
    this.emitStructuredLog('error', 'RECOVERY_FAILED', { domain, error: error.message });
  }

  // --- Projection Telemetry ---
  public recordProjectionRebuild(domain: RuntimeDomain, durationMs: number, success: boolean): void {
    this.emitStructuredLog(success ? 'info' : 'error', 'PROJECTION_REBUILD', {
      domain,
      duration_ms: durationMs,
      success
    });
  }

  // --- Transport Telemetry ---
  public recordStateTransition(from: RuntimeState, to: RuntimeState): void {
    this.emitStructuredLog('info', 'TRANSPORT_STATE_TRANSITION', {
      from_state: from,
      to_state: to
    });
  }
}
