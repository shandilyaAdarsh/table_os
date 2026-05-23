// ============================================================
// src/modules/billing/settlement-lifecycle.service.ts
// Service orchestrating finite state machine (FSM) transitions
// for bills, payments capture execution, and auditable events.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { BillDTO, BillStatus } from './billing-runtime.types';
import { ReceiptSnapshotService } from './receipt-snapshot.service';
import * as ordersRepo from '../orders/orders.repository';
import { transitionOrderStatus } from '../orders/orders.service';

const VALID_TRANSITIONS: Record<BillStatus, BillStatus[]> = {
  UNPAID: ['PARTIALLY_PAID', 'PAID', 'VOIDED'],
  PARTIALLY_PAID: ['PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED'],
  PAID: ['REFUNDED', 'PARTIALLY_PAID'],
  FAILED: ['UNPAID'],
  VOIDED: [],
  REFUNDED: [],
};

export class SettlementLifecycleService {
  /**
   * Applies a gateway-captured payment to an active bill.
   * Enforces transactional locks and strict OCC Compare-And-Swap checks.
   */
  public static async applySettlement(params: {
    tenantId: string;
    billId: string;
    paymentIntentId: string | null;
    paymentMethod: any;
    amountMinor: number;
    gatewayRef?: string;
    gatewayPayload?: any;
    processedBy?: string;
  }): Promise<BillDTO> {
    const { tenantId, billId, paymentIntentId, paymentMethod, amountMinor, gatewayRef, gatewayPayload, processedBy } = params;

    try {
      // 1. Fetch and Lock the active bill
      const { data: bill, error: fetchErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', billId)
        .single();

      if (fetchErr || !bill) {
        throw new AppError('Bill check failed: record not found.', 404, ErrorCode.NOT_FOUND);
      }

      // Check current state bounds
      if (['PAID', 'VOIDED', 'REFUNDED'].includes(bill.status)) {
        throw new AppError(`Cannot apply payment on bill in '${bill.status}' status.`, 400, ErrorCode.VALIDATION_ERROR);
      }

      // Calculate new paid amount and determine target status
      const currentPaid = Number(bill.amount_paid_minor);
      const grandTotal = Number(bill.grand_total_minor);
      const newPaid = currentPaid + amountMinor;

      if (newPaid > grandTotal) {
        throw new AppError('Cumulative payments cannot exceed bill grand total.', 400, ErrorCode.VALIDATION_ERROR);
      }

      const targetStatus: BillStatus = newPaid >= grandTotal ? 'PAID' : 'PARTIALLY_PAID';

      // 2. Validate FSM State Transition matrix
      this.validateTransition(bill.status as BillStatus, targetStatus);

      // 3. Perform atomic state update under OCC protection
      const { data: updatedBill, error: updateErr } = await supabaseAdmin
        .from('bills')
        .update({
          amount_paid_minor: newPaid,
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

      // 4. Create authoritative settlements and payment transaction log entries
      const { data: settlement, error: setErr } = await supabaseAdmin
        .from('settlements')
        .insert({
          tenant_id: tenantId,
          branch_id: bill.branch_id,
          bill_id: billId,
          payment_intent_id: paymentIntentId,
          amount_minor: amountMinor,
          currency_code: bill.currency_code,
          processed_by: processedBy,
        })
        .select()
        .single();

      if (setErr) {
        throw new AppError(`Failed to create settlement transaction: ${setErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      const { error: txErr } = await supabaseAdmin
        .from('payment_transactions')
        .insert({
          tenant_id: tenantId,
          branch_id: bill.branch_id,
          settlement_id: settlement.id,
          payment_method: paymentMethod,
          amount_minor: amountMinor,
          currency_code: bill.currency_code,
          gateway_ref: gatewayRef || null,
          gateway_payload: gatewayPayload || null,
          status: 'completed',
        });

      if (txErr) {
        throw new AppError(`Failed to record append-only payment transaction: ${txErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 5. Emit PAYMENT_CAPTURED event
      await supabaseAdmin.rpc('log_financial_event', {
        p_tenant_id: tenantId,
        p_branch_id: bill.branch_id,
        p_event_type: 'PAYMENT_CAPTURED',
        p_aggregate_id: settlement.id,
        p_aggregate_type: 'settlement',
        p_payload: {
          settlementId: settlement.id,
          billId,
          amountMinor,
          paymentMethod,
        },
      });

      // 6. Action-Completed Sync Triggers
      if (targetStatus === 'PAID') {
        // A. Freeze invoice snapshot immediately (Audit-safe immutable snapshot rule)
        await ReceiptSnapshotService.freezeReceipt(tenantId, bill.branch_id, billId);

        // B. Emit SETTLEMENT_COMPLETED event
        await supabaseAdmin.rpc('log_financial_event', {
          p_tenant_id: tenantId,
          p_branch_id: bill.branch_id,
          p_event_type: 'SETTLEMENT_COMPLETED',
          p_aggregate_id: billId,
          p_aggregate_type: 'bill',
          p_payload: {
            billId,
            billNumber: bill.bill_number,
            grandTotalMinor: grandTotal,
            settledAt: new Date().toISOString(),
          },
        });

        // C. Sync linked parent orders to COMPLETED status
        const { data: billOrders, error: boErr } = await supabaseAdmin
          .from('bill_orders')
          .select('order_id')
          .eq('bill_id', billId);

        if (!boErr && billOrders) {
          for (const bo of billOrders) {
            const order = await ordersRepo.getOrderById(tenantId, bo.order_id);
            if (order && order.status !== 'completed') {
              await transitionOrderStatus({
                tenantId,
                orderId: bo.order_id,
                targetStatus: 'completed',
                versionNum: order.version_num,
                userId: processedBy,
                reason: `Settled in full via unified table check payment.`,
              });
            }
          }
        }
      }

      return updatedBill as BillDTO;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Settlement lifecycle service error: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Voids an unpaid bill.
   */
  public static async voidBill(params: {
    tenantId: string;
    billId: string;
    reason: string;
    voidedBy?: string;
  }): Promise<BillDTO> {
    const { tenantId, billId, reason, voidedBy } = params;

    try {
      const { data: bill, error: fetchErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', billId)
        .single();

      if (fetchErr || !bill) {
        throw new AppError('Bill not found.', 404, ErrorCode.NOT_FOUND);
      }

      if (bill.status !== 'UNPAID') {
        throw new AppError(`Only UNPAID bills can be voided. Current state is '${bill.status}'.`, 400, ErrorCode.VALIDATION_ERROR);
      }

      this.validateTransition(bill.status as BillStatus, 'VOIDED');

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('bills')
        .update({
          status: 'VOIDED',
          voided_at: new Date().toISOString(),
          voided_by: voidedBy,
          void_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('id', billId)
        .eq('version_num', bill.version_num)
        .select()
        .single();

      if (updateErr || !updated) {
        throw new AppError('OCC Lock Mismatch: Bill was updated concurrently.', 409, ErrorCode.CONFLICT);
      }

      // Emit BILL_VOIDED event
      await supabaseAdmin.rpc('log_financial_event', {
        p_tenant_id: tenantId,
        p_branch_id: bill.branch_id,
        p_event_type: 'BILL_VOIDED',
        p_aggregate_id: billId,
        p_aggregate_type: 'bill',
        p_payload: {
          billId,
          voidedBy,
          reason,
        },
      });

      return updated as BillDTO;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Void bill failed: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Transition checker
   */
  private static validateTransition(from: BillStatus, to: BillStatus): void {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new AppError(
        `Invalid state transition: Cannot transition bill status from '${from}' to '${to}'.`,
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
  }
}
