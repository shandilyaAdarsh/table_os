import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface MutationAuditLogInput {
  mutation_id: string;
  mutation_sequence: number;
  idempotency_key: string;
  session_id?: string;
  tenant_id: string;
  branch_id: string;
  mutation_type: string;
  payload_hash: string | null;
  status: 'PENDING' | 'IN_FLIGHT' | 'ACKNOWLEDGED' | 'FAILED_RETRYABLE' | 'FAILED_FATAL' | 'ROLLED_BACK';
  failure_reason?: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

export async function logMutationAudit(data: MutationAuditLogInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('mutation_audit_logs')
      .insert({
        mutation_id: data.mutation_id,
        mutation_sequence: data.mutation_sequence,
        idempotency_key: data.idempotency_key,
        session_id: data.session_id,
        tenant_id: data.tenant_id,
        branch_id: data.branch_id,
        mutation_type: data.mutation_type,
        payload_hash: data.payload_hash,
        status: data.status,
        failure_reason: data.failure_reason,
        acknowledged_at: data.acknowledged_at,
        resolved_at: data.resolved_at,
      });

    if (error) {
      logger.error({ error, data }, '[MutationAudit] Failed to log mutation');
    }
  } catch (err) {
    logger.error({ err, data }, '[MutationAudit] Exception logging mutation');
  }
}

export async function updateMutationAuditStatus(
  mutationId: string,
  status: MutationAuditLogInput['status'],
  failureReason?: string,
  resolvedAt?: string
): Promise<void> {
  try {
    const updatePayload: any = { status };
    if (failureReason) updatePayload.failure_reason = failureReason;
    if (resolvedAt) updatePayload.resolved_at = resolvedAt;
    if (status === 'ACKNOWLEDGED') updatePayload.acknowledged_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('mutation_audit_logs')
      .update(updatePayload)
      .eq('mutation_id', mutationId);

    if (error) {
      logger.error({ error, mutationId }, '[MutationAudit] Failed to update mutation status');
    }
  } catch (err) {
    logger.error({ err, mutationId }, '[MutationAudit] Exception updating mutation status');
  }
}
