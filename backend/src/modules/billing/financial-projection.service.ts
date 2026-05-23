// ============================================================
// src/modules/billing/financial-projection.service.ts
// Service providing highly optimized read and projection views
// for active table checks, cashier reconciliation, and analytics.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { BillDTO, BillItemDTO, SettlementDTO } from './billing-runtime.types';

export interface TableBillProjection {
  bill: BillDTO;
  orders: Array<{ id: string; order_number: string; status: string; grand_total_minor: number }>;
  items: BillItemDTO[];
  settlements: SettlementDTO[];
}

export interface PaymentReconciliationSummary {
  payment_method: string;
  total_amount_minor: number;
  count: number;
}

export interface FinancialReconciliationView {
  start_date: string;
  end_date: string;
  payments: PaymentReconciliationSummary[];
  refunds: {
    total_amount_minor: number;
    count: number;
  };
  total_payments_minor: number;
  total_refunds_minor: number;
  net_intake_minor: number;
}

export class FinancialProjectionService {
  /**
   * Retrieves active unpaid or partially paid bills for a specific table,
   * projecting their associated orders, items, and settlements.
   */
  public static async getActiveTableBillProjection(
    tenantId: string,
    branchId: string,
    tableId: string
  ): Promise<TableBillProjection[]> {
    try {
      // 1. Query all active (UNPAID, PARTIALLY_PAID, FAILED) bills for the table
      const { data: bills, error: billsErr } = await supabaseAdmin
        .from('bills')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('table_id', tableId)
        .in('status', ['UNPAID', 'PARTIALLY_PAID', 'FAILED'])
        .order('created_at', { ascending: false });

      if (billsErr) {
        throw new AppError(`Failed to fetch active bills: ${billsErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      if (!bills || bills.length === 0) {
        return [];
      }

      const projections: TableBillProjection[] = [];

      for (const bill of bills) {
        // 2. Fetch linked orders through the join table
        const { data: joinData, error: joinErr } = await supabaseAdmin
          .from('bill_orders')
          .select('order_id')
          .eq('tenant_id', tenantId)
          .eq('bill_id', bill.id);

        let orders: Array<{ id: string; order_number: string; status: string; grand_total_minor: number }> = [];
        if (!joinErr && joinData && joinData.length > 0) {
          const orderIds = joinData.map((jd) => jd.order_id);
          const { data: ordersData, error: ordersErr } = await supabaseAdmin
            .from('orders')
            .select('id, order_number, status, grand_total_minor')
            .eq('tenant_id', tenantId)
            .in('id', orderIds);

          if (!ordersErr && ordersData) {
            orders = ordersData.map((o: any) => ({
              id: o.id,
              order_number: o.order_number,
              status: o.status,
              grand_total_minor: Number(o.grand_total_minor),
            }));
          }
        }

        // 3. Fetch bill items
        const { data: items, error: itemsErr } = await supabaseAdmin
          .from('bill_items')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('bill_id', bill.id);

        if (itemsErr) {
          throw new AppError(`Failed to load bill items: ${itemsErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }

        // 4. Fetch settlements applied to this bill
        const { data: settlements, error: setErr } = await supabaseAdmin
          .from('settlements')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('bill_id', bill.id);

        if (setErr) {
          throw new AppError(`Failed to load bill settlements: ${setErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }

        projections.push({
          bill: bill as BillDTO,
          orders,
          items: (items || []) as BillItemDTO[],
          settlements: (settlements || []) as SettlementDTO[],
        });
      }

      return projections;
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Active table projection failed: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Generates a cashier reconciliation report summarizing all successful payments,
   * grouped by payment method, and all refunds issued within a date range.
   */
  public static async getFinancialReconciliationView(params: {
    tenantId: string;
    branchId: string;
    startDate: string;
    endDate: string;
  }): Promise<FinancialReconciliationView> {
    const { tenantId, branchId, startDate, endDate } = params;

    try {
      // 1. Fetch completed payment transactions in time-range
      const { data: txs, error: txErr } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('status', 'completed')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (txErr) {
        throw new AppError(`Failed to fetch transactions for reconciliation: ${txErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      // Group payments by method
      const methodMap: Record<string, { total: number; count: number }> = {};
      let totalPaymentsMinor = 0;

      if (txs) {
        for (const tx of txs) {
          const method = tx.payment_method;
          const amount = Number(tx.amount_minor);

          totalPaymentsMinor += amount;

          if (!methodMap[method]) {
            methodMap[method] = { total: 0, count: 0 };
          }
          methodMap[method].total += amount;
          methodMap[method].count += 1;
        }
      }

      const payments: PaymentReconciliationSummary[] = Object.entries(methodMap).map(([method, stats]) => ({
        payment_method: method,
        total_amount_minor: stats.total,
        count: stats.count,
      }));

      // 2. Fetch refunds issued in time-range
      const { data: refunds, error: refErr } = await supabaseAdmin
        .from('refunds')
        .select('refund_amount_minor')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (refErr) {
        throw new AppError(`Failed to fetch refunds for reconciliation: ${refErr.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
      }

      let totalRefundsMinor = 0;
      const refundCount = refunds?.length || 0;

      if (refunds) {
        for (const ref of refunds) {
          totalRefundsMinor += Number(ref.refund_amount_minor);
        }
      }

      return {
        start_date: startDate,
        end_date: endDate,
        payments,
        refunds: {
          total_amount_minor: totalRefundsMinor,
          count: refundCount,
        },
        total_payments_minor: totalPaymentsMinor,
        total_refunds_minor: totalRefundsMinor,
        net_intake_minor: totalPaymentsMinor - totalRefundsMinor,
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Financial reconciliation query failed: ${err.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }
  }
}
