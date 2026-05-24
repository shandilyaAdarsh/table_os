// ============================================================
// src/modules/billing/refund.service.ts
// Service managing append-only refunds recording, status updates,
// and bounds validation under strict OCC controls.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { BillDTO, BillStatus, RefundDTO } from './billing-runtime.types';

export class RefundService {
  /**
   * Executes a refund for a bill.
   * Validates refund bounds, records append-only logs, updates bill via OCC,
   * and registers outbox financial events.
   */
  public static async executeRefund(params: {
    tenantId: string;
    billId: string;
    paymentTransactionId?: string | null;
    refundAmountMinor: number;
    reason: string;
    idempotencyKey?: string | null;
    gatewayRef?: string | null;
    issuedBy?: string | null;
  }): Promise<{ refund: RefundDTO; bill: BillDTO }> {
    const {
      tenantId,
      billId,
      paymentTransactionId,
      refundAmountMinor,
      reason,
      idempotencyKey,
      gatewayRef,
      issuedBy,
    } = params;

    if (refundAmountMinor <= 0) {
      throw new AppError('Refund amount must be greater than zero.', 400, ErrorCode.VALIDATION_ERROR);
    }

    try {
      // 1. Replay-safe Idempotency check
      if (idempotencyKey) {
        const { data: existingRefund } = await supabaseAdmin
          .from('refunds')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (existingRefund) {
          // Fetch the current bill to return together
          const { data: bill } = await supabaseAdmin
            .from('bills')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('id', billId)
            .single();

          return { refund: existingRefund as RefundDTO, bill: bill as BillDTO };
        }
      }

      // 2. Fetch and OCC lock the active bill
      const { data: bill, error: fetchErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', billId)
        .single();

      if (fetchErr || !bill) {
        throw new AppError('Bill not found.', 404, ErrorCode.NOT_FOUND);
      }

      const currentPaid = Number(bill.amount_paid_minor);
      const currentRefunded = Number(bill.amount_refunded_minor);
      const newRefunded = currentRefunded + refundAmountMinor;

      // Validation bounds: refund_amount_minor must not exceed amount_paid_minor - amount_refunded_minor
      if (newRefunded > currentPaid) {
        throw new AppError(
          `Refund amount (${refundAmountMinor}) exceeds remaining refundable amount (${currentPaid - currentRefunded}).`,
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      // Determine target status
      // If fully refunded, status transitions to 'REFUNDED'
      // If partially refunded, it transitions to 'PARTIALLY_PAID' (or remains 'PARTIALLY_PAID')
      const targetStatus: BillStatus = newRefunded === currentPaid ? 'REFUNDED' : 'PARTIALLY_PAID';

      // 3. Perform atomic state update under OCC protection
      const { data: updatedBill, error: updateErr } = await supabaseAdmin
        .from('bills')
        .update({
          amount_refunded_minor: newRefunded,
          status: targetStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', billId)
        .eq('version_num', bill.version_num)
        .select()
        .single();

      if (updateErr || !updatedBill) {
        if ((updateErr && updateErr.code === 'PGRST116') || !updatedBill) {
          throw new AppError('OCC Lock Mismatch: Bill was updated concurrently. Reload and retry.', 409, ErrorCode.CONFLICT);
        }
        throw new AppError(`Failed to update bill totals: ${updateErr ? updateErr.message : 'Unknown error'}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 4. Create authoritative refund log
      const { data: refund, error: refundErr } = await supabaseAdmin
        .from('refunds')
        .insert({
          tenant_id: tenantId,
          branch_id: bill.branch_id,
          bill_id: billId,
          payment_transaction_id: paymentTransactionId || null,
          refund_amount_minor: refundAmountMinor,
          currency_code: bill.currency_code,
          reason,
          idempotency_key: idempotencyKey || null,
          gateway_ref: gatewayRef || null,
          issued_by: issuedBy || null,
        })
        .select()
        .single();

      if (refundErr || !refund) {
        throw new AppError(`Failed to create refund record: ${refundErr?.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 5. Emit REFUND_CREATED & REFUND_COMPLETED sequence outbox events
      await supabaseAdmin.rpc('log_financial_event', {
        p_tenant_id: tenantId,
        p_branch_id: bill.branch_id,
        p_event_type: 'REFUND_CREATED',
        p_aggregate_id: refund.id,
        p_aggregate_type: 'refund',
        p_payload: {
          refundId: refund.id,
          billId,
          refundAmountMinor,
          reason,
        },
      });

      await supabaseAdmin.rpc('log_financial_event', {
        p_tenant_id: tenantId,
        p_branch_id: bill.branch_id,
        p_event_type: 'REFUND_COMPLETED',
        p_aggregate_id: refund.id,
        p_aggregate_type: 'refund',
        p_payload: {
          refundId: refund.id,
          billId,
          refundAmountMinor,
          newRefundedTotalMinor: newRefunded,
          billStatus: targetStatus,
        },
      });

      return { refund: refund as RefundDTO, bill: updatedBill as BillDTO };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Refund execution failed: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }
}
