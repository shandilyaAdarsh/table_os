import { RuntimeObservabilityLayer } from '../observability/RuntimeObservabilityLayer';
import { resolveApiBaseUrl } from '../../lib/resolveApiBaseUrl';
import { RuntimeTransportManager } from '../transport/RuntimeTransportManager';

export interface MutationRequest {
  mutation_id: string;
  payload: Record<string, any>;
  idempotency_key?: string; 
  expected_cart_revision?: number;
}

export type MutationStatus = 'PENDING' | 'STALLED' | 'RECOVERING' | 'ACKNOWLEDGED' | 'CONFIRMED' | 'FAILED' | 'REPLAYING' | 'REJECTED';

export interface MutationIdentity {
  surface_id: string; // e.g. "pos_terminal_1" or "qr_table_T03"
  session_id: string; // The session-bound identity
  mutation_sequence: number; // Monotonic counter resetting per session
  idempotency_key: string; 
  request_id: string; // Trace ID for observability
  status: MutationStatus;
}

export class MutationGateway {
  private observability: RuntimeObservabilityLayer;
  private transportManager: RuntimeTransportManager;
  private currentSessionId: string | null = null;
  private sequenceCounter: number = 0;
  
  // Internal mutation state ledger
  private mutationLedger: Map<string, MutationIdentity> = new Map();
  private stuckTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // E.g., API_BASE_URL
  private apiBaseUrl: string = resolveApiBaseUrl();

  constructor(
    observability: RuntimeObservabilityLayer,
    transportManager: RuntimeTransportManager
  ) {
    this.observability = observability;
    this.transportManager = transportManager;
  }

  /**
   * Must be called when the Runtime authenticates or starts a new session.
   * This resets the monotonic mutation sequence to prevent stale session collisions.
   */
  public initializeSession(sessionId: string, surfaceId: string): void {
    this.currentSessionId = sessionId;
    this.sequenceCounter = 0;
    console.info(`[MutationGateway] Initialized session bounds for surface: ${surfaceId}, session: ${sessionId}`);
  }

  /**
   * The sole entry point for all operational mutations across the platform.
   */
  public async submitMutation(endpoint: string, request: MutationRequest, surfaceId: string = 'unknown_surface'): Promise<Response> {
    if (!this.currentSessionId) {
      console.warn(`[MutationGateway] Submitting mutation without an initialized session. This breaks strict replay isolation.`);
      // For fallback/dev, but in strict production this should throw.
    }

    // 1. Generate core mutation identity bounds
    this.sequenceCounter++;
    const requestId = this.observability.generateRequestId();
    const idempotencyKey = request.idempotency_key || crypto.randomUUID();

    const qrToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('qr_session_token') : null;
    const identity: MutationIdentity = {
      surface_id: surfaceId,
      session_id: this.currentSessionId || qrToken || 'anonymous_session',
      mutation_sequence: this.sequenceCounter,
      idempotency_key: idempotencyKey,
      request_id: requestId,
      status: 'PENDING'
    };

    // Track internally
    this.mutationLedger.set(idempotencyKey, identity);

    const envelope = {
      mutation_id: request.mutation_id,
      ...identity,
      runtime_version: 2, // Signifying formal runtime struct
      client_timestamp: new Date().toISOString(),
      expected_cart_revision: request.expected_cart_revision,
      payload: request.payload,
    };

    // 2. Trace and begin timeout escalation
    this.observability.recordMutationStart(identity);
    this.startMutationTimeoutEscalation(idempotencyKey);

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set('X-Request-Id', requestId);
    headers.set('X-Idempotency-Key', idempotencyKey);

    // Optional: add runtime token here
    const token = localStorage.getItem('supabase.auth.token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (qrToken) {
      headers.set('x-qr-session-token', qrToken);
    }

    try {
      console.debug(`[MutationGateway] Submitting mutation ${request.mutation_id} (Seq: ${this.sequenceCounter})`);
      
      const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(envelope),
      });

      if (!response.ok) {
        identity.status = response.status >= 400 && response.status < 500 ? 'REJECTED' : 'FAILED';
        // We log, but we do NOT attempt to mutate state locally. 
        // We throw so UI can render error, and projection stays intact.
        this.observability.recordMutationError(identity, response.status);
        throw new Error(`Mutation failed with status ${response.status}`);
      }

      identity.status = 'ACKNOWLEDGED'; // Waiting for confirmation via projection sync
      this.observability.recordMutationSuccess(identity);
      
      // Notify Transport Manager of successful heartbeat/api contact
      this.transportManager.recordApiSuccess();

      return response;
    } catch (error) {
      identity.status = 'FAILED';
      this.observability.recordMutationError(identity, 500, error as Error);
      this.transportManager.recordApiFailure();
      throw error; // Let UI handle retry or error message, no local data rollback required because we never mutated it.
    } finally {
      // Clear timeout escalation
      if (this.stuckTimers.has(idempotencyKey)) {
        clearTimeout(this.stuckTimers.get(idempotencyKey));
        this.stuckTimers.delete(idempotencyKey);
      }
    }
  }

  /**
   * Called internally to start the timeout escalation path
   */
  private startMutationTimeoutEscalation(idempotencyKey: string) {
    // Escalate to STALLED after 30s (increased for slow local environments)
    const timer = setTimeout(() => {
      const identity = this.mutationLedger.get(idempotencyKey);
      if (identity && identity.status === 'PENDING') {
        identity.status = 'STALLED';
        console.warn(`[MutationGateway] Mutation ${idempotencyKey} STALLED. Transitioning to RECOVERING.`);
        
        // After stalled, try recovering
        setTimeout(() => {
          if (identity.status === 'STALLED') {
            identity.status = 'RECOVERING';
            console.info(`[MutationGateway] Mutation ${idempotencyKey} RECOVERING. Attempting background re-flight...`);
            
            // In a real system, you'd re-flight the payload here, or check transport state.
            // If it still fails, escalate to FAILED.
            setTimeout(() => {
              if (identity.status === 'RECOVERING') {
                identity.status = 'FAILED';
                console.error(`[MutationGateway] Mutation ${idempotencyKey} FAILED after timeout escalation.`);
              }
            }, 15000);
          }
        }, 2000);
      }
    }, 30000);

    this.stuckTimers.set(idempotencyKey, timer);
  }

  /**
   * Called by ProjectionCoordinator when a rebuild is completed that includes this mutation.
   */
  public confirmMutation(idempotencyKey: string): void {
    const identity = this.mutationLedger.get(idempotencyKey);
    if (identity) {
      identity.status = 'CONFIRMED';
      console.debug(`[MutationGateway] Mutation ${idempotencyKey} confirmed via projection convergence.`);
    }
  }
}
