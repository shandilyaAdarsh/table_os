import { create } from 'zustand';
import { fetchWithRuntime } from '../../lib/apiClient';

export const useActiveOrdersProjection = create((set, get) => ({
  orders: [],
  isRebuilding: false,
  error: null,

  rebuild: async (branchId) => {
    if (get().isRebuilding) return;
    set({ isRebuilding: true, error: null });

    try {
      const response = await fetchWithRuntime(`/api/v1/branches/${branchId}/orders`);
      if (response.ok) {
        const data = await response.json();
        set({ orders: data.data || [] });
      } else {
        throw new Error(`Failed to rebuild orders: ${response.status}`);
      }
    } catch (e) {
      console.error('[ActiveOrdersProjection] Rebuild failed', e);
      set({ error: e.message });
    } finally {
      set({ isRebuilding: false });
    }
  },

  // Derive optimistic state by overlaying MutationCoordinator's pending orders
  getOptimisticOrders: (pendingMutations) => {
    // Basic implementation: deep clone and overlay
    const orders = JSON.parse(JSON.stringify(get().orders));
    // Apply pending mutations related to orders here
    return orders;
  }
}));
