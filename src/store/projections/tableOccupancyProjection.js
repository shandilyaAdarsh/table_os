import { create } from 'zustand';
import { fetchWithRuntime } from '../../lib/apiClient';

export const useTableOccupancyProjection = create((set, get) => ({
  tables: [],
  isRebuilding: false,
  error: null,

  rebuild: async (branchId) => {
    if (get().isRebuilding) return;
    set({ isRebuilding: true, error: null });

    try {
      const response = await fetchWithRuntime(`/api/v1/branches/${branchId}/tables`);
      if (response.ok) {
        const data = await response.json();
        set({ tables: data.data || [] });
      } else {
        throw new Error(`Failed to rebuild tables: ${response.status}`);
      }
    } catch (e) {
      console.error('[TableOccupancyProjection] Rebuild failed', e);
      set({ error: e.message });
    } finally {
      set({ isRebuilding: false });
    }
  },

  getOptimisticTables: (pendingMutations) => {
    const tables = JSON.parse(JSON.stringify(get().tables));
    // Apply pending table status updates here
    return tables;
  }
}));
