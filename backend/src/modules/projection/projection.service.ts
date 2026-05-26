import crypto from 'crypto';
import { WebSocketManager } from '../transport/websocket.manager';
import { logProjectionAudit } from './projection-audit.repository';
import type { ProjectionEnvelope, ProjectionInvalidationSignal } from './projection.contracts';

// ============================================================
// Projection Governance Service
// ============================================================

export class ProjectionService {
  
  /**
   * Deterministically calculates a checksum for a projection payload.
   * This is critical for convergence diagnostics and stale rebuild detection.
   */
  private static calculateChecksum(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Dispatches a pure projection update.
   * Wraps the state inside the explicit ProjectionEnvelope contract and pushes it 
   * over the transport boundary.
   */
  public static async dispatchProjectionUpdate(params: {
    projection_id: string;
    projection_type: string;
    branch_id: string;
    tenant_id: string;
    projection_revision: number;
    source_revision: number;
    source_mutation_id?: string;
    payload: any;
    eventSource: 'SYSTEM' | 'ORDERING' | 'KDS' | 'ADMIN' | 'SYNC_ENGINE';
  }): Promise<void> {
    const checksum = this.calculateChecksum(params.payload);

    const envelope: ProjectionEnvelope = {
      projection_id: params.projection_id,
      projection_type: params.projection_type,
      branch_id: params.branch_id,
      tenant_id: params.tenant_id,
      projection_revision: params.projection_revision,
      source_revision: params.source_revision,
      source_mutation_id: params.source_mutation_id,
      projection_checksum: checksum,
      occurred_at: new Date().toISOString(),
      payload: params.payload,
    };

    // 1. Log Observability
    void logProjectionAudit({
      projection_id: params.projection_id,
      projection_type: params.projection_type,
      branch_id: params.branch_id,
      tenant_id: params.tenant_id,
      event_type: 'UPDATE_BROADCAST',
      projection_revision: params.projection_revision,
      source_revision: params.source_revision,
      source_mutation_id: params.source_mutation_id,
      metadata: { checksum },
    });

    // 2. Broadcast via Transport (Transport layer assigns event_sequence automatically)
    WebSocketManager.getInstance().broadcastToBranch(
      params.branch_id,
      params.eventSource,
      'PROJECTION_STREAM', // standard transport stream type for derived projections
      'PROJECTION_UPDATE',
      envelope
    );
  }

  /**
   * Dispatches a strict invalidation signal.
   * Forces clients to wipe their derived state and fall back to a full REST rebuild.
   */
  public static async dispatchInvalidation(params: {
    projection_id: string;
    projection_type: string;
    branch_id: string;
    tenant_id: string;
    reason: ProjectionInvalidationSignal['reason'];
    eventSource: 'SYSTEM' | 'ORDERING' | 'KDS' | 'ADMIN' | 'SYNC_ENGINE';
  }): Promise<void> {
    const signal: ProjectionInvalidationSignal = {
      type: 'INVALIDATE',
      projection_id: params.projection_id,
      projection_type: params.projection_type,
      reason: params.reason,
    };

    // 1. Log Observability
    void logProjectionAudit({
      projection_id: params.projection_id,
      projection_type: params.projection_type,
      branch_id: params.branch_id,
      tenant_id: params.tenant_id,
      event_type: 'INVALIDATION_BROADCAST',
      reason: params.reason,
    });

    // 2. Broadcast via Transport
    WebSocketManager.getInstance().broadcastToBranch(
      params.branch_id,
      params.eventSource,
      'PROJECTION_STREAM',
      'PROJECTION_INVALIDATE',
      signal
    );
  }
}
