import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

export async function getDailyAnalytics(
  tenantId: string,
  dateStr: string,
  branchId?: string
) {
  // We assume dateStr is YYYY-MM-DD
  const startDate = new Date(dateStr);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  let query = supabaseAdmin
    .from('bills')
    .select('status, grand_total_minor, tax_total_minor, discount_total_minor')
    .eq('tenant_id', tenantId)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', endDate.toISOString());

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data: bills, error: billsError } = await query;

  if (billsError) {
    throw new AppError(`Failed to fetch bills for analytics: ${billsError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  let totalRevenueAmount = 0;
  let totalTaxAmount = 0;
  let totalDiscountAmount = 0;
  let totalOrderCount = 0;

  for (const bill of bills || []) {
    if (bill.status === 'PAID') {
      totalRevenueAmount += bill.grand_total_minor || 0;
      totalTaxAmount += bill.tax_total_minor || 0;
      totalDiscountAmount += bill.discount_total_minor || 0;
      totalOrderCount += 1;
    }
  }

  const averageOrderValueAmount = totalOrderCount > 0 
    ? Math.floor(totalRevenueAmount / totalOrderCount) 
    : 0;

  return {
    tenant_id: tenantId,
    branch_id: branchId,
    date: startDate.toISOString(),
    total_revenue_amount: totalRevenueAmount,
    total_tax_amount: totalTaxAmount,
    total_discount_amount: totalDiscountAmount,
    total_order_count: totalOrderCount,
    average_order_value_amount: averageOrderValueAmount,
    generated_at: new Date().toISOString(),
  };
}
