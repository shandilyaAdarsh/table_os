import { create } from 'zustand';
import { fetchWithRuntime } from '../../lib/apiClient';

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
      const stationQuery = stationId ? `?station_id=${stationId}` : '';
      const response = await fetchWithRuntime(`/api/v1/branches/${branchId}/kitchen/metrics${stationQuery}`);
      
      if (response.ok) {
        const data = await response.json();
        // The backend is authoritative for all operational metrics (prep duration, throughput, SLA)
        // We do not compute these client-side.
        set({ metrics: data.data || get().metrics });
      } else {
        throw new Error(`Failed to rebuild kitchen metrics: ${response.status}`);
      }
    } catch (e) {
      console.error('[KitchenMetricsProjection] Rebuild failed', e);
      set({ error: e.message });
    } finally {
      set({ isRebuilding: false });
    }
  }
}));
