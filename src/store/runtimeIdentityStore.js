import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idbZustandStorage } from '../lib/idbStorage';

export const useRuntimeIdentityStore = create(
  persist(
    (set) => ({
      // Persisted fields
      deviceId: crypto.randomUUID(), // Generated once per installation
      terminalId: null,              // Backend-issued
      branchId: null,                // Selected branch
      
      // In-memory runtime session fields (re-generated on load)
      runtimeSessionId: crypto.randomUUID(),
      runtimeEpoch: Date.now(),
      staffId: null,

      setTerminalId: (terminalId) => set({ terminalId }),
      setBranchId: (branchId) => set({ branchId }),
      setStaffId: (staffId) => set({ staffId }),

      // Full reset (e.g. device deregistration)
      clearIdentity: () => set({
        terminalId: null,
        branchId: null,
        staffId: null,
        runtimeSessionId: crypto.randomUUID(),
        runtimeEpoch: Date.now(),
      }),
    }),
    {
      name: 'tableos-runtime-identity',
      storage: idbZustandStorage,
      partialize: (state) => ({
        deviceId: state.deviceId,
        terminalId: state.terminalId,
        branchId: state.branchId,
      }), // Only persist these fields
    }
  )
);
