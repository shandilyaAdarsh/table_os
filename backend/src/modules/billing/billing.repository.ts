// ============================================================
// src/modules/billing/billing.repository.ts
// Repository exposing core db types and basic database fetch
// operations for the production-grade billing runtime.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { BillDTO } from './billing-runtime.types';

export type PaymentMethod = 'cash' | 'card' | 'qr_pay' | 'wallet' | 'split' | 'other';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

/**
 * Retrieves a bill by its primary key.
 */
export async function getBillById(tenantId: string, id: string): Promise<BillDTO | null> {
  const { data, error } = await supabaseAdmin
    .from('bills')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AppError(`Failed to fetch bill by ID: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as BillDTO | null;
}
