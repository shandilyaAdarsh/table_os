import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface PaymentInput {
  tenant_id: string;
  branch_id: string;
  order_id: string;
  payment_provider: string;
  payment_reference: string;
  payment_amount_minor: number;
  currency_code: string;
  idempotency_key: string;
  replay_generation: number;
}

export class PaymentReconciliationService {
  /**
   * Checks or registers an idempotency key.
   * If key already exists, returns the cached response, otherwise locks key.
   */
  static async executeIdempotent<T>(
    idempotencyKey: string,
    tenantId: string,
    action: () => Promise<T>,
    expirySeconds = 3600
  ): Promise<T> {
    try {
      // 1. Check idempotency registry
      const { data: existing, error: checkErr } = await supabaseAdmin
        .from('idempotency_registry')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (checkErr) throw checkErr;

      if (existing) {
        logger.info({ idempotencyKey }, '[Idempotency] Recovered cached execution payload');
        return existing.response_payload as T;
      }

      // 2. Perform target action
      const result = await action();

      // 3. Register key
      const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();
      const { error: regErr } = await supabaseAdmin
        .from('idempotency_registry')
        .insert({
          idempotency_key: idempotencyKey,
          tenant_id: tenantId,
          response_payload: result as any,
          expires_at: expiresAt,
        });

      if (regErr) {
        // In case of concurrent insert race, fallback to selecting the first inserted payload
        const { data: raceCheck } = await supabaseAdmin
          .from('idempotency_registry')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .single();
        if (raceCheck) return raceCheck.response_payload as T;
        throw regErr;
      }

      return result;
    } catch (err: any) {
      logger.error({ err, idempotencyKey }, 'Error executing idempotent transaction action');
      throw new Error(`[PaymentReconciliationService] executeIdempotent: ${err.message}`);
    }
  }

  /**
   * Commits a payment transaction securely into the immutable payment ledger.
   */
  static async recordPayment(input: PaymentInput): Promise<any> {
    return this.executeIdempotent(input.idempotency_key, input.tenant_id, async () => {
      try {
        const { data, error } = await supabaseAdmin
          .from('payment_ledger')
          .insert({
            tenant_id: input.tenant_id,
            branch_id: input.branch_id,
            order_id: input.order_id,
            payment_provider: input.payment_provider,
            payment_reference: input.payment_reference,
            payment_status: 'PAID',
            payment_amount_minor: input.payment_amount_minor,
            currency_code: input.currency_code,
            idempotency_key: input.idempotency_key,
            replay_generation: input.replay_generation,
            finalized_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        logger.info({ paymentId: data.id, reference: input.payment_reference }, '[PaymentLedger] Appended payment record to immutable ledger');
        return data;
      } catch (err: any) {
        logger.error({ err, input }, 'Failed to record payment in ledger');
        throw err;
      }
    });
  }

  /**
   * Runs reconciliation to flag orphan or stale payments.
   */
  static async reconcileStalePayments(tenantId: string, branchId: string): Promise<{
    reconciled_count: number;
    stale_count: number;
  }> {
    try {
      // Find payments matching branch and tenant that are not finalized within 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabaseAdmin
        .from('payment_ledger')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('payment_status', 'INITIATED')
        .lt('initiated_at', oneHourAgo);

      if (error) throw error;

      return {
        reconciled_count: 0,
        stale_count: data?.length || 0,
      };
    } catch (err: any) {
      logger.error({ err, tenantId, branchId }, 'Reconciliation failed');
      return { reconciled_count: 0, stale_count: 0 };
    }
  }
}
