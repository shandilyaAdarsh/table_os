// ============================================================
// src/modules/billing/receipt-snapshot.service.ts
// Service capturing and freezing complete checkout structures
// as permanent, audit-safe receipt JSON records.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { ReceiptSnapshotDTO } from './billing-runtime.types';

export class ReceiptSnapshotService {
  /**
   * Freezes a complete receipt structure at the moment of settlement.
   * Ensures historical receipts never resolve from live menu or price tables later.
   */
  public static async freezeReceipt(
    tenantId: string,
    branchId: string,
    billId: string
  ): Promise<ReceiptSnapshotDTO> {
    try {
      // 1. Double check if receipt is already frozen to ensure replay-safety
      const { data: existing, error: existErr } = await supabaseAdmin
        .from('receipt_snapshots')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('bill_id', billId)
        .maybeSingle();

      if (existErr) {
        throw new AppError(`Receipt snapshot check failed: ${existErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      if (existing) {
        return existing as ReceiptSnapshotDTO;
      }

      // 2. Fetch entire bill header and its line items
      const { data: bill, error: billErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', billId)
        .single();

      if (billErr || !bill) {
        throw new AppError('Authoritative bill check failed.', 404, ErrorCode.NOT_FOUND);
      }

      const { data: billItems, error: itemsErr } = await supabaseAdmin
        .from('bill_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('bill_id', billId);

      if (itemsErr) {
        throw new AppError(`Failed to fetch bill items: ${itemsErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 3. Fetch linked orders
      const { data: mappings, error: mapErr } = await supabaseAdmin
        .from('bill_orders')
        .select('order_id')
        .eq('bill_id', billId);

      if (mapErr) {
        throw new AppError(`Failed to fetch linked bill orders: ${mapErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      const orderIds = mappings?.map((m) => m.order_id) || [];

      // 4. Fetch the authoritative immutable order, item, modifier, and tax snapshots
      let snapshots: any[] = [];
      if (orderIds.length > 0) {
        const { data: snaps, error: snapsErr } = await supabaseAdmin
          .from('order_snapshots')
          .select(`
            id,
            order_id,
            subtotal_minor,
            tax_total_minor,
            discount_total_minor,
            grand_total_minor,
            currency_code,
            snapshotted_at,
            order_item_snapshots (
              id,
              menu_item_id,
              item_name_snapshot,
              quantity,
              unit_price_minor,
              line_total_minor,
              order_modifier_snapshots (
                id,
                modifier_group_name_snapshot,
                modifier_option_name_snapshot,
                price_delta_minor
              )
            ),
            order_tax_snapshots (
              id,
              tax_profile_name_snapshot,
              rate_basis_points,
              calc_mode_snapshot,
              tax_amount_minor
            )
          `)
          .eq('tenant_id', tenantId)
          .in('order_id', orderIds);

        if (snapsErr) {
          throw new AppError(`Failed to retrieve order snapshots: ${snapsErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }
        snapshots = snaps || [];
      }

      // 5. Fetch all payments transactions linked to this bill
      const { data: settlements, error: setErr } = await supabaseAdmin
        .from('settlements')
        .select(`
          id,
          amount_minor,
          settled_at,
          processed_by,
          payment_transactions (
            id,
            payment_method,
            amount_minor,
            gateway_ref,
            status,
            created_at
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('bill_id', billId);

      if (setErr) {
        throw new AppError(`Failed to retrieve payments: ${setErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 6. Build final, fully self-contained receipt payload
      const frozenPayload = {
        bill: {
          id: bill.id,
          bill_number: bill.bill_number,
          status: bill.status,
          subtotal_minor: bill.subtotal_minor,
          tax_total_minor: bill.tax_total_minor,
          discount_total_minor: bill.discount_total_minor,
          grand_total_minor: bill.grand_total_minor,
          amount_paid_minor: bill.amount_paid_minor,
          currency_code: bill.currency_code,
          created_at: bill.created_at,
          settled_at: new Date().toISOString(),
        },
        branch: {
          tenant_id: tenantId,
          branch_id: branchId,
        },
        bill_items: billItems.map((bi) => ({
          id: bi.id,
          order_item_snapshot_id: bi.order_item_snapshot_id,
          quantity: bi.quantity,
          unit_price_minor: bi.unit_price_minor,
          subtotal_minor: bi.subtotal_minor,
          tax_total_minor: bi.tax_total_minor,
          discount_total_minor: bi.discount_total_minor,
          grand_total_minor: bi.grand_total_minor,
        })),
        order_snapshots: snapshots,
        settlements: settlements || [],
        system_version: '1.0.0',
      };

      // 7. Insert the receipt snapshot
      const receiptNumber = `REC-${bill.bill_number.replace('BILL-', '')}`;

      const { data: snapshot, error: insErr } = await supabaseAdmin
        .from('receipt_snapshots')
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          bill_id: billId,
          receipt_number: receiptNumber,
          frozen_payload: frozenPayload,
        })
        .select()
        .single();

      if (insErr) {
        if (insErr.code === '23505') {
          // Concurrent insertion safety check
          const { data: check } = await supabaseAdmin
            .from('receipt_snapshots')
            .select('*')
            .eq('bill_id', billId)
            .single();
          if (check) return check as ReceiptSnapshotDTO;
        }
        throw new AppError(`Failed to save receipt snapshot: ${insErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      return snapshot as ReceiptSnapshotDTO;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Receipt snapshot service error: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Retrieves a previously frozen receipt snapshot.
   */
  public static async getReceiptSnapshot(tenantId: string, billId: string): Promise<ReceiptSnapshotDTO | null> {
    const { data, error } = await supabaseAdmin
      .from('receipt_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('bill_id', billId)
      .maybeSingle();

    if (error) {
      throw new AppError(`Failed to fetch receipt snapshot: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    return data as ReceiptSnapshotDTO | null;
  }
}
