import { create } from 'zustand';
import { RuntimeState } from '../runtime/transport/RuntimeTransportManager';

export interface RuntimeCoordinationState {
  transportState: RuntimeState;
  
  // Derived Health States
  isHealthy: boolean;
  isRecovering: boolean;
  isDegraded: boolean;
  canMutate: boolean;
  isRealtimeConnected: boolean;

  // Setters (Invoked strictly by infrastructure layer)
  setTransportState: (state: RuntimeState) => void;
}

export const useRuntimeStore = create<RuntimeCoordinationState>((set) => ({
  transportState: 'BOOTSTRAPPING',
  
  isHealthy: false,
  isRecovering: false,
  isDegraded: false,
  canMutate: false,
  isRealtimeConnected: false,

  setTransportState: (state: RuntimeState) => set((s) => {
    // Compute derived health properties based on the new transport state
    return {
      transportState: state,
      isHealthy: state === 'LIVE',
      isRecovering: state === 'RECOVERING' || state === 'SYNCING',
      isDegraded: state === 'DEGRADED',
      canMutate: state === 'LIVE' || state === 'DEGRADED' || state === 'SYNCING', // Allow mutations unless fully suspended/failed/offline
      isRealtimeConnected: state === 'LIVE' || state === 'SYNCING' || state === 'RECOVERING'
    };
  })
}));
