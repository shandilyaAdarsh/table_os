// ============================================================
// src/modules/orders/sequence-allocator.service.ts
// Scalable, contention-free branch-scoped sequence allocator.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

export type SequenceType = 'orders' | 'invoices' | 'kitchen_orders' | 'qr_sessions' | 'tables';

/**
 * Atomically allocates the next sequential index for a branch.
 * Employs row-level locking with daily reset options for gapless sequences.
 */
export async function allocateSequenceNumber(params: {
  tenantId: string;
  branchId: string;
  sequenceType: SequenceType;
  prefix: string;
  dailyReset?: boolean;
}): Promise<string> {
  const { tenantId, branchId, sequenceType, prefix, dailyReset = true } = params;

  const { data, error } = await supabaseAdmin.rpc('allocate_next_sequence', {
    p_tenant_id: tenantId,
    p_branch_id: branchId,
    p_sequence_type: sequenceType,
    p_daily_reset: dailyReset
  });

  if (error) {
    throw new AppError(
      `Failed to allocate atomic sequence for ${sequenceType}: ${error.message}`,
      500,
      ErrorCode.INTERNAL_SERVER_ERROR
    );
  }

  const allocatedVal = Number(data);
  return `${prefix}-${String(allocatedVal).padStart(4, '0')}`;
}
