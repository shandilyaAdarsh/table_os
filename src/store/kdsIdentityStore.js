import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idbZustandStorage } from '../lib/idbStorage';

export const useKdsIdentityStore = create(
  persist(
    (set) => ({
      // Persisted fields
      kitchenDeviceId: crypto.randomUUID(),
      stationId: null, // e.g., 'GRILL', 'EXPO', 'FRYER', 'MAIN'
      branchId: null,
      
      // In-memory runtime session fields (re-generated on load)
      runtimeSessionId: crypto.randomUUID(),
      runtimeEpoch: Date.now(),

      setStationId: (stationId) => set({ stationId }),
      setBranchId: (branchId) => set({ branchId }),

      // Full reset
      clearIdentity: () => set({
        stationId: null,
        branchId: null,
        runtimeSessionId: crypto.randomUUID(),
        runtimeEpoch: Date.now(),
      }),
    }),
    {
      name: 'tableos-kds-identity',
      storage: idbZustandStorage,
      partialize: (state) => ({
        kitchenDeviceId: state.kitchenDeviceId,
        stationId: state.stationId,
        branchId: state.branchId,
      }), // Only persist these fields
    }
  )
);
