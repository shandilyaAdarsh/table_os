import { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

// Helper function to fetch and compute daily analytics summary
async function computeDailySummary(tenantId: string, branchId: string | undefined, dateStr: string) {
  const startOfDay = `${dateStr}T00:00:00.000Z`;
  const endOfDay = `${dateStr}T23:59:59.999Z`;

  let query = supabaseAdmin
    .from('orders')
    .select(`
      id,
      order_snapshots!orders_order_snapshot_id_fkey (
        subtotal_minor,
        tax_total_minor,
        discount_total_minor,
        grand_total_minor
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay);

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data: orders, error } = await query;
  if (error) {
    throw error;
  }

  let totalRevenue = 0;
  let totalTax = 0;
  let totalDiscount = 0;
  const totalOrders = orders?.length || 0;

  if (orders) {
    for (const order of orders) {
      const snapshot = Array.isArray(order.order_snapshots)
        ? order.order_snapshots[0]
        : (order.order_snapshots as any);
      
      if (snapshot) {
        totalRevenue += Number(snapshot.grand_total_minor || 0);
        totalTax += Number(snapshot.tax_total_minor || 0);
        totalDiscount += Number(snapshot.discount_total_minor || 0);
      }
    }
  }

  const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return {
    tenant_id: tenantId,
    branch_id: branchId || null,
    date: dateStr,
    total_revenue_amount: totalRevenue,
    total_tax_amount: totalTax,
    total_discount_amount: totalDiscount,
    total_order_count: totalOrders,
    average_order_value_amount: averageOrderValue,
    generated_at: new Date().toISOString()
  };
}

export async function getDailySummary(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req.params.tenantId || req.context?.tenantId) as string;
    const branchId = req.query.branch_id as string | undefined;
    const dateStr = req.query.date as string;

    if (!tenantId) {
      res.status(400).json({ success: false, error: { message: 'Missing tenantId' } });
      return;
    }
    if (!dateStr) {
      res.status(400).json({ success: false, error: { message: 'Missing date parameter' } });
      return;
    }

    const summary = await computeDailySummary(tenantId, branchId, dateStr);

    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    logger.error({ error }, 'Error fetching daily summary');
    res.status(500).json({ success: false, error: { message: error.message || 'Internal server error' } });
  }
}

export async function getAnalyticsRange(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = (req.params.tenantId || req.context?.tenantId) as string;
    const branchId = req.query.branch_id as string | undefined;
    const startDateStr = req.query.start_date as string;
    const endDateStr = req.query.end_date as string;

    if (!tenantId) {
      res.status(400).json({ success: false, error: { message: 'Missing tenantId' } });
      return;
    }
    if (!startDateStr || !endDateStr) {
      res.status(400).json({ success: false, error: { message: 'Missing start_date or end_date parameter' } });
      return;
    }

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const summaries = [];

    // Loop through each day in the range and compute the summary
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const summary = await computeDailySummary(tenantId, branchId, dateStr);
      summaries.push(summary);
    }

    res.status(200).json({
      success: true,
      data: summaries
    });
  } catch (error: any) {
    logger.error({ error }, 'Error fetching analytics range');
    res.status(500).json({ success: false, error: { message: error.message || 'Internal server error' } });
  }
}
