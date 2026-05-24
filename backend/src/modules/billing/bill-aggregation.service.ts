// ============================================================
// src/modules/billing/bill-aggregation.service.ts
// Service aggregating active orders, computing minor-unit totals,
// and issuing unified table or single-order bills.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { BillDTO } from './billing-runtime.types';

export class BillAggregationService {
  /**
   * Aggregates multiple active orders into a single, unified bill.
   * decoupling bills from single order to support table-wide check out.
   */
  public static async aggregateOrdersIntoBill(params: {
    tenantId: string;
    branchId: string;
    tableId: string | null;
    sessionId: string | null;
    orderIds: string[];
    parentBillId?: string | null;
  }): Promise<BillDTO> {
    const { tenantId, branchId, tableId, sessionId, orderIds, parentBillId = null } = params;

    if (orderIds.length === 0) {
      throw new AppError('Cannot aggregate empty order list into a bill.', 400, ErrorCode.VALIDATION_ERROR);
    }

    try {
      // 1. Fetch Order Snapshots and their line items, modifiers, and taxes
      const { data: orderSnapshots, error: snapErr } = await supabaseAdmin
        .from('order_snapshots')
        .select(`
          id,
          order_id,
          subtotal_minor,
          tax_total_minor,
          discount_total_minor,
          grand_total_minor,
          order_item_snapshots (
            id,
            menu_item_id,
            item_name_snapshot,
            quantity,
            unit_price_minor,
            line_total_minor,
            is_branch_price_override,
            item_notes,
            display_order,
            order_modifier_snapshots (
              id,
              modifier_group_id,
              modifier_option_id,
              modifier_group_name_snapshot,
              modifier_option_name_snapshot,
              price_delta_minor
            )
          ),
          order_tax_snapshots (
            id,
            tax_profile_name_snapshot,
            tax_strategy_id,
            rate_basis_points,
            calc_mode_snapshot,
            taxable_amount_minor,
            tax_amount_minor,
            jurisdiction_snapshot
          )
        `)
        .eq('tenant_id', tenantId)
        .in('order_id', orderIds);

      if (snapErr) {
        throw new AppError(`Failed to fetch order snapshots: ${snapErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      if (!orderSnapshots || orderSnapshots.length === 0) {
        throw new AppError('No order snapshots found for the given orders.', 404, ErrorCode.NOT_FOUND);
      }

      // 2. Aggregate financial totals in minor units
      let totalSubtotal = 0;
      let totalTax = 0;
      let totalDiscount = 0;
      let totalGrand = 0;

      const billItemsToInsert: any[] = [];

      for (const snap of orderSnapshots) {
        totalSubtotal += Number(snap.subtotal_minor);
        totalTax += Number(snap.tax_total_minor);
        totalDiscount += Number(snap.discount_total_minor);
        totalGrand += Number(snap.grand_total_minor);

        const itemSnapshots = (snap.order_item_snapshots as any[]) || [];
        for (const itemSnap of itemSnapshots) {
          // Calculate item subtotal, inclusive modifiers
          let modifiersDelta = 0;
          const modifiers = itemSnap.order_modifier_snapshots || [];
          for (const mod of modifiers) {
            modifiersDelta += Number(mod.price_delta_minor);
          }

          const unitPrice = Number(itemSnap.unit_price_minor) + modifiersDelta;
          const subtotal = unitPrice * Number(itemSnap.quantity);

          // We'll map taxes and discounts proportionally at first, or allocate
          // directly based on order snapshot splits if item-level split is triggered
          billItemsToInsert.push({
            tenant_id: tenantId,
            order_item_snapshot_id: itemSnap.id,
            quantity: itemSnap.quantity,
            unit_price_minor: unitPrice,
            subtotal_minor: subtotal,
            tax_total_minor: 0, // Computed proportionally later or when splitting
            discount_total_minor: 0,
            grand_total_minor: subtotal,
          });
        }
      }

      // 3. Pro-rate tax totals and discounts to individual bill items to maintain granular totals
      if (totalSubtotal > 0) {
        let allocatedTax = 0;
        let allocatedDiscount = 0;

        for (let i = 0; i < billItemsToInsert.length; i++) {
          const item = billItemsToInsert[i];
          const ratio = item.subtotal_minor / totalSubtotal;

          if (i === billItemsToInsert.length - 1) {
            // Allocate remainder to final item to eliminate rounding leakage
            item.tax_total_minor = totalTax - allocatedTax;
            item.discount_total_minor = totalDiscount - allocatedDiscount;
          } else {
            item.tax_total_minor = Math.round(totalTax * ratio);
            item.discount_total_minor = Math.round(totalDiscount * ratio);
            allocatedTax += item.tax_total_minor;
            allocatedDiscount += item.discount_total_minor;
          }

          item.grand_total_minor = item.subtotal_minor + item.tax_total_minor - item.discount_total_minor;
        }
      }

      // 4. Generate Daily Sequential Bill Number
      const billNumber = await this.generateBillNumber(branchId);

      // 5. Execute unified aggregate insertion in database transaction
      const { data: bill, error: billErr } = await supabaseAdmin
        .from('bills')
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          table_id: tableId,
          session_id: sessionId,
          parent_bill_id: parentBillId,
          bill_number: billNumber,
          status: 'UNPAID',
          subtotal_minor: totalSubtotal,
          tax_total_minor: totalTax,
          discount_total_minor: totalDiscount,
          grand_total_minor: totalGrand,
          amount_paid_minor: 0,
          amount_refunded_minor: 0,
          currency_code: 'USD',
        })
        .select()
        .single();

      if (billErr) {
        throw new AppError(`Failed to insert bill record: ${billErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 6. Bulk Insert Bill Items
      const preparedBillItems = billItemsToInsert.map((bi) => ({
        ...bi,
        bill_id: bill.id,
      }));

      const { error: itemsErr } = await supabaseAdmin
        .from('bill_items')
        .insert(preparedBillItems);

      if (itemsErr) {
        throw new AppError(`Failed to insert bill items: ${itemsErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 7. Insert Bill-Orders Mapping Join Records
      const billOrders = orderIds.map((orderId) => ({
        tenant_id: tenantId,
        bill_id: bill.id,
        order_id: orderId,
      }));

      const { error: joinErr } = await supabaseAdmin
        .from('bill_orders')
        .insert(billOrders);

      if (joinErr) {
        throw new AppError(`Failed to link bill orders mapping: ${joinErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 8. Log financial sequence outbox event
      const { error: eventErr } = await supabaseAdmin.rpc('log_financial_event', {
        p_tenant_id: tenantId,
        p_branch_id: branchId,
        p_event_type: 'BILL_CREATED',
        p_aggregate_id: bill.id,
        p_aggregate_type: 'bill',
        p_payload: {
          billId: bill.id,
          billNumber: bill.bill_number,
          grandTotalMinor: bill.grand_total_minor,
          orderIds,
        },
      });

      if (eventErr) {
        throw new AppError(`Failed to publish BILL_CREATED financial event: ${eventErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      return bill as BillDTO;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Bill aggregation service error: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Returns the open balance (grand_total - amount_paid).
   */
  public static async getOpenBalance(tenantId: string, billId: string): Promise<number> {
    const { data: bill, error } = await supabaseAdmin
      .from('bills')
      .select('grand_total_minor, amount_paid_minor')
      .eq('tenant_id', tenantId)
      .eq('id', billId)
      .single();

    if (error || !bill) {
      throw new AppError('Bill not found.', 404, ErrorCode.NOT_FOUND);
    }

    return Number(bill.grand_total_minor) - Number(bill.amount_paid_minor);
  }

  /**
   * Sequence Generator: BILL-YYYYMMDD-XXXX
   */
  private static async generateBillNumber(branchId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count, error } = await supabaseAdmin
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      throw new AppError('Failed to generate sequential bill number sequence.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const nextNum = (count ?? 0) + 1;
    return `BILL-${dateStr}-${String(nextNum).padStart(4, '0')}`;
  }
}
