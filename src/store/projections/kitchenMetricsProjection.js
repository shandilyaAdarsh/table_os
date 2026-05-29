import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export const useKitchenMetricsProjection = create((set, get) => ({
  metrics: {
    totalOrdersToday: 0,
    averagePrepTimeSeconds: 0,
    delayedOrdersCount: 0,
    activeTicketsCount: 0,
  },
  isRebuilding: false,
  error: null,

  rebuild: async (branchId, stationId = null) => {
    if (get().isRebuilding) return;
    set({ isRebuilding: true, error: null });

    try {
      const startOfToday = new Date();
      startOfToday.setHours(0,0,0,0);

      // Query total orders placed today
      const { count: totalCount, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfToday.toISOString());

      if (countError) throw countError;

      // Query active tickets count
      const { count: activeCount, error: activeError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'cooking']);

      if (activeError) throw activeError;

      set({
        metrics: {
          totalOrdersToday: totalCount || 0,
          averagePrepTimeSeconds: 420, // Static mock for demo prep time (7 mins)
          delayedOrdersCount: 0,
          activeTicketsCount: activeCount || 0,
        }
      });
    } catch (e) {
      console.error('[KitchenMetricsProjection] Rebuild failed', e);
      set({ error: e.message });
    } finally {
      set({ isRebuilding: false });
    }
  }
}));
