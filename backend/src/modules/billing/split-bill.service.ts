// ============================================================
// src/modules/billing/split-bill.service.ts
// Service managing item-level, fractional, and seat-based
// split-billing orchestration and deterministic reconciliation.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { BillDTO } from './billing-runtime.types';

export class SplitBillService {
  /**
   * Splits an unpaid bill fractionally (equal split) across N seats.
   * Allocates bases point rounding remainders to the final check.
   */
  public static async splitBillFractionally(
    tenantId: string,
    parentBillId: string,
    splitCount: number
  ): Promise<BillDTO[]> {
    if (splitCount <= 1) {
      throw new AppError('Split count must be greater than 1.', 400, ErrorCode.VALIDATION_ERROR);
    }

    try {
      // 1. Fetch Parent Bill
      const { data: parent, error: fetchErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', parentBillId)
        .single();

      if (fetchErr || !parent) {
        throw new AppError('Parent bill not found.', 404, ErrorCode.NOT_FOUND);
      }

      if (parent.status !== 'UNPAID') {
        throw new AppError(`Cannot split bill in '${parent.status}' status.`, 400, ErrorCode.VALIDATION_ERROR);
      }

      // Check if already split to prevent duplicate split execution (replay-safe)
      const { data: existingChildren, error: childErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('parent_bill_id', parentBillId);

      if (!childErr && existingChildren && existingChildren.length > 0) {
        return existingChildren as BillDTO[];
      }

      // 2. Perform fractional division of grand totals
      const baseSubtotal = Math.floor(Number(parent.subtotal_minor) / splitCount);
      const baseTax = Math.floor(Number(parent.tax_total_minor) / splitCount);
      const baseDiscount = Math.floor(Number(parent.discount_total_minor) / splitCount);
      const baseGrand = Math.floor(Number(parent.grand_total_minor) / splitCount);

      const childrenToInsert: any[] = [];
      let allocatedSubtotal = 0;
      let allocatedTax = 0;
      let allocatedDiscount = 0;
      let allocatedGrand = 0;

      for (let i = 1; i <= splitCount; i++) {
        const isLast = i === splitCount;
        const subtotal = isLast ? Number(parent.subtotal_minor) - allocatedSubtotal : baseSubtotal;
        const tax = isLast ? Number(parent.tax_total_minor) - allocatedTax : baseTax;
        const discount = isLast ? Number(parent.discount_total_minor) - allocatedDiscount : baseDiscount;
        const grand = isLast ? Number(parent.grand_total_minor) - allocatedGrand : baseGrand;

        allocatedSubtotal += subtotal;
        allocatedTax += tax;
        allocatedDiscount += discount;
        allocatedGrand += grand;

        childrenToInsert.push({
          tenant_id: tenantId,
          branch_id: parent.branch_id,
          table_id: parent.table_id,
          session_id: parent.session_id,
          parent_bill_id: parentBillId,
          bill_number: `${parent.bill_number}-SP${i}`,
          status: 'UNPAID',
          subtotal_minor: subtotal,
          tax_total_minor: tax,
          discount_total_minor: discount,
          grand_total_minor: grand,
          amount_paid_minor: 0,
          amount_refunded_minor: 0,
          currency_code: parent.currency_code,
        });
      }

      // 3. Execute bulk children insertion inside transaction
      const { data: insertedChildren, error: insertErr } = await supabaseAdmin
        .from('bills')
        .insert(childrenToInsert)
        .select();

      if (insertErr || !insertedChildren) {
        throw new AppError(`Failed to insert split child bills: ${insertErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 4. Record Split Allocations
      const allocations = insertedChildren.map((child: any) => ({
        tenant_id: tenantId,
        bill_id: parentBillId,
        split_bill_id: child.id,
        allocated_percentage: (100 / splitCount),
        amount_minor: child.grand_total_minor,
      }));

      const { error: allocErr } = await supabaseAdmin
        .from('split_allocations')
        .insert(allocations);

      if (allocErr) {
        throw new AppError(`Failed to save split allocations: ${allocErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // 5. Emit outbox sequencing events
      for (const child of insertedChildren) {
        await supabaseAdmin.rpc('log_financial_event', {
          p_tenant_id: tenantId,
          p_branch_id: parent.branch_id,
          p_event_type: 'BILL_CREATED',
          p_aggregate_id: child.id,
          p_aggregate_type: 'bill',
          p_payload: {
            billId: child.id,
            billNumber: child.bill_number,
            grandTotalMinor: child.grand_total_minor,
            parentBillId,
          },
        });
      }

      return insertedChildren as BillDTO[];
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Equal split failed: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Splits a parent bill into custom seat-based child bills allocating specific items.
   */
  public static async splitBillByItems(
    tenantId: string,
    parentBillId: string,
    splitGroups: Array<{
      seatNumber: number;
      items: Array<{ billItemId: string; quantity: number }>;
    }>
  ): Promise<BillDTO[]> {
    try {
      // 1. Fetch Parent Bill and its items
      const { data: parent, error: fetchErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', parentBillId)
        .single();

      if (fetchErr || !parent) {
        throw new AppError('Parent bill check failed.', 404, ErrorCode.NOT_FOUND);
      }

      if (parent.status !== 'UNPAID') {
        throw new AppError(`Cannot split bill in '${parent.status}' status.`, 400, ErrorCode.VALIDATION_ERROR);
      }

      const { data: billItems, error: itemsErr } = await supabaseAdmin
        .from('bill_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('bill_id', parentBillId);

      if (itemsErr || !billItems) {
        throw new AppError(`Failed to retrieve parent bill items: ${itemsErr?.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // Check if already split to prevent duplicate split execution (replay-safe)
      const { data: existingChildren } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('parent_bill_id', parentBillId);

      if (existingChildren && existingChildren.length > 0) {
        return existingChildren as BillDTO[];
      }

      // 2. Validate allocation bounds: total split quantities must match parent quantities
      const itemAllocatedQty: Record<string, number> = {};

      for (const group of splitGroups) {
        for (const splitItem of group.items) {
          const parentItem = billItems.find((bi) => bi.id === splitItem.billItemId);
          if (!parentItem) {
            throw new AppError(`Item '${splitItem.billItemId}' does not exist on the parent bill.`, 400, ErrorCode.VALIDATION_ERROR);
          }
          itemAllocatedQty[splitItem.billItemId] = (itemAllocatedQty[splitItem.billItemId] || 0) + splitItem.quantity;
        }
      }

      for (const [itemId, qty] of Object.entries(itemAllocatedQty)) {
        const parentItem = billItems.find((bi) => bi.id === itemId)!;
        if (qty > parentItem.quantity) {
          throw new AppError(
            `Allocated quantity (${qty}) for item '${parentItem.order_item_snapshot_id}' exceeds original quantity (${parentItem.quantity}).`,
            400,
            ErrorCode.VALIDATION_ERROR
          );
        }
      }

      const createdChildBills: BillDTO[] = [];

      // 3. Process each split group
      for (const group of splitGroups) {
        let groupSubtotal = 0;
        let groupTax = 0;
        let groupDiscount = 0;

        const childItemsToInsert: any[] = [];

        for (const splitItem of group.items) {
          const parentItem = billItems.find((bi) => bi.id === splitItem.billItemId)!;
          const ratio = splitItem.quantity / parentItem.quantity;

          const itemSubtotal = Number(parentItem.unit_price_minor) * splitItem.quantity;
          const itemTax = Math.round(Number(parentItem.tax_total_minor) * ratio);
          const itemDiscount = Math.round(Number(parentItem.discount_total_minor) * ratio);

          groupSubtotal += itemSubtotal;
          groupTax += itemTax;
          groupDiscount += itemDiscount;

          childItemsToInsert.push({
            tenant_id: tenantId,
            order_item_snapshot_id: parentItem.order_item_snapshot_id,
            quantity: splitItem.quantity,
            unit_price_minor: parentItem.unit_price_minor,
            subtotal_minor: itemSubtotal,
            tax_total_minor: itemTax,
            discount_total_minor: itemDiscount,
            grand_total_minor: itemSubtotal + itemTax - itemDiscount,
          });
        }

        const groupGrand = groupSubtotal + groupTax - groupDiscount;

        // Create Child Bill record
        const { data: child, error: childErr } = await supabaseAdmin
          .from('bills')
          .insert({
            tenant_id: tenantId,
            branch_id: parent.branch_id,
            table_id: parent.table_id,
            session_id: parent.session_id,
            parent_bill_id: parentBillId,
            bill_number: `${parent.bill_number}-S${group.seatNumber}`,
            status: 'UNPAID',
            subtotal_minor: groupSubtotal,
            tax_total_minor: groupTax,
            discount_total_minor: groupDiscount,
            grand_total_minor: groupGrand,
            amount_paid_minor: 0,
            amount_refunded_minor: 0,
            currency_code: parent.currency_code,
          })
          .select()
          .single();

        if (childErr || !child) {
          throw new AppError(`Failed to save child check: ${childErr?.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }

        // Insert Child Bill Items
        const preparedChildItems = childItemsToInsert.map((ci) => ({
          ...ci,
          bill_id: child.id,
        }));

        const { data: insertedItems, error: cItemsErr } = await supabaseAdmin
          .from('bill_items')
          .insert(preparedChildItems)
          .select();

        if (cItemsErr || !insertedItems) {
          throw new AppError(`Failed to insert split child items: ${cItemsErr?.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }

        // Record Split Allocations
        const groupAllocations = group.items.map((splitItem) => {
          const parentItem = billItems.find((bi) => bi.id === splitItem.billItemId)!;
          const childItem = insertedItems.find((ci) => ci.order_item_snapshot_id === parentItem.order_item_snapshot_id)!;
          return {
            tenant_id: tenantId,
            bill_id: parentBillId,
            split_bill_id: child.id,
            bill_item_id: parentItem.id,
            allocated_quantity: splitItem.quantity,
            amount_minor: childItem.grand_total_minor,
          };
        });

        const { error: saErr } = await supabaseAdmin
          .from('split_allocations')
          .insert(groupAllocations);

        if (saErr) {
          throw new AppError(`Failed to log split allocations log: ${saErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }

        // Emit outbox sequencing events
        await supabaseAdmin.rpc('log_financial_event', {
          p_tenant_id: tenantId,
          p_branch_id: parent.branch_id,
          p_event_type: 'BILL_CREATED',
          p_aggregate_id: child.id,
          p_aggregate_type: 'bill',
          p_payload: {
            billId: child.id,
            billNumber: child.bill_number,
            grandTotalMinor: child.grand_total_minor,
            parentBillId,
            seatNumber: group.seatNumber,
          },
        });

        createdChildBills.push(child as BillDTO);
      }

      return createdChildBills;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Item-level split failed: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }
}
