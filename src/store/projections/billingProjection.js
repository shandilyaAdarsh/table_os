import { create } from 'zustand';
import { fetchWithRuntime } from '../../lib/apiClient';

export const useBillingProjection = create((set, get) => ({
  bills: [],
  isRebuilding: false,
  error: null,

  rebuild: async (branchId) => {
    if (get().isRebuilding) return;
    set({ isRebuilding: true, error: null });

    try {
      const response = await fetchWithRuntime(`/api/v1/branches/${branchId}/bills`);
      if (response.ok) {
        const data = await response.json();
        set({ bills: data.data || [] });
      } else {
        throw new Error(`Failed to rebuild bills: ${response.status}`);
      }
    } catch (e) {
      console.error('[BillingProjection] Rebuild failed', e);
      set({ error: e.message });
    } finally {
      set({ isRebuilding: false });
    }
  },
  
  getOptimisticBills: (pendingMutations) => {
    // In many cases, billing is entirely backend authoritative (financial),
    // but we can apply safe pending states like "PROCESSING_PAYMENT"
    return get().bills;
  }
}));
