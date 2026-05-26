import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface BranchAnalytics {
  revenue_total_minor: number;
  order_count: number;
  table_utilization_rate: number;
  average_ticket_minor: number;
  incident_count: number;
}

export class AnalyticsService {
  /**
   * Retrieves branch analytics from optimized read-models or live aggregates safely.
   */
  static async getBranchAnalytics(tenantId: string, branchId: string): Promise<BranchAnalytics> {
    try {
      // 1. Fetch completed order metrics
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('total_amount_minor')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('status', 'COMPLETED');

      if (ordersError) throw ordersError;

      const orderCount = orders?.length || 0;
      const revenueTotal = (orders || []).reduce((sum, o) => sum + (o.total_amount_minor || 0), 0);
      const averageTicket = orderCount > 0 ? Math.round(revenueTotal / orderCount) : 0;

      // 2. Fetch table utilization (active vs total)
      const { data: tables, error: tablesError } = await supabaseAdmin
        .from('tables')
        .select('id, table_runtime_projections(runtime_state)')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId);

      if (tablesError) throw tablesError;

      const totalTables = tables?.length || 0;
      const occupiedTables = (tables || []).filter(
        (t: any) => t.table_runtime_projections?.runtime_state === 'OCCUPIED'
      ).length;

      const tableUtilizationRate = totalTables > 0 ? (occupiedTables / totalTables) * 100 : 0;

      // 3. Incident stats
      const { count: incidentCount } = await supabaseAdmin
        .from('runtime_incidents')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('resolved', false);

      return {
        revenue_total_minor: revenueTotal,
        order_count: orderCount,
        table_utilization_rate: Math.round(tableUtilizationRate * 100) / 100,
        average_ticket_minor: averageTicket,
        incident_count: incidentCount || 0,
      };
    } catch (err: any) {
      logger.error({ err, branchId }, 'Failed to compute branch analytics');
      return {
        revenue_total_minor: 0,
        order_count: 0,
        table_utilization_rate: 0,
        average_ticket_minor: 0,
        incident_count: 0,
      };
    }
  }
}
