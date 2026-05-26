import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface ProjectionAuditLogInput {
  projection_id: string;
  projection_type: string;
  branch_id?: string;
  tenant_id?: string;
  event_type: 'UPDATE_BROADCAST' | 'INVALIDATION_BROADCAST' | 'REBUILD_REQUEST';
  projection_revision?: number;
  source_revision?: number;
  source_mutation_id?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export async function logProjectionAudit(data: ProjectionAuditLogInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('projection_audit_logs')
      .insert({
        projection_id: data.projection_id,
        projection_type: data.projection_type,
        branch_id: data.branch_id,
        tenant_id: data.tenant_id,
        event_type: data.event_type,
        projection_revision: data.projection_revision,
        source_revision: data.source_revision,
        source_mutation_id: data.source_mutation_id,
        reason: data.reason,
        metadata: data.metadata,
      });

    if (error) {
      logger.error({ error, data }, '[ProjectionAudit] Failed to log event');
    }
  } catch (err) {
    logger.error({ err, data }, '[ProjectionAudit] Exception logging event');
  }
}
