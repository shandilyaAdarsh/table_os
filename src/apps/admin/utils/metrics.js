import { supabase } from '../../../lib/supabase.js';

export const fetchKPIMetrics = async (tenantId) => {
  try {
    // 1. Revenue & AOV
    const { data: revenueData, error: revErr } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('tenant_id', tenantId)
      .not('status', 'in', '("cancelled","rejected")');
      
    if (revErr) throw revErr;

    let totalRevenue = 0;
    let avgValue = 0;

    if (revenueData && revenueData.length > 0) {
      totalRevenue = revenueData.reduce((sum, order) => sum + (order.total_amount || 0), 0);
      avgValue = totalRevenue / revenueData.length;
    }

    // 2. Active Tables Count
    const { count: activeTables, error: tabErr } = await supabase
      .from('restaurant_tables')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'occupied');

    if (tabErr) throw tabErr;

    // 3. Active Orders Count 
    const { count: activeOrders, error: ordErr } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('status', 'in', '("served","cancelled","rejected")');

    if (ordErr) throw ordErr;

    return {
      revenue: totalRevenue,
      activeTables: activeTables || 0,
      activeOrders: activeOrders || 0,
      avgOrderValue: avgValue
    };
  } catch (error) {
    console.error('Error in fetchKPIMetrics:', error);
    return null;
  }
};
