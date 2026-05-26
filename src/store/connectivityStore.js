import { create } from 'zustand';

export const useConnectivityStore = create((set, get) => ({
  isOnline: navigator.onLine,
  lastHeartbeat: Date.now(),
  lastSuccessfulPing: Date.now(),

  setOnline: (status) => {
    if (get().isOnline !== status) {
      console.log(`[Connectivity] State changed to: ${status ? 'ONLINE' : 'OFFLINE'}`);
      set({ isOnline: status });
      
      // We can trigger queue drainage here if it goes online, or do it by reacting to store changes
    }
  },

  recordHeartbeat: () => set({ lastHeartbeat: Date.now(), isOnline: true }),
  
  recordApiSuccess: () => set({ lastSuccessfulPing: Date.now(), isOnline: true }),

  recordApiTimeout: () => {
    console.warn('[Connectivity] API Timeout detected. Marking offline.');
    set({ isOnline: false });
  },

  // A method to start a background ping if we are offline
  startConnectivityCheck: (pingUrl) => {
    setInterval(async () => {
      const state = get();
      if (!state.isOnline) {
        try {
          // Send a quick HEAD request or similar to an endpoint to verify reachability
          const res = await fetch(pingUrl, { method: 'HEAD', cache: 'no-cache' });
          if (res.ok) {
            state.recordApiSuccess();
          }
        } catch (e) {
          // Still offline
        }
      }
    }, 10000); // every 10 seconds
  }
}));

// Bind to native events as a baseline, though we trust heuristics more
window.addEventListener('online', () => {
  useConnectivityStore.getState().setOnline(true);
});
window.addEventListener('offline', () => {
  useConnectivityStore.getState().setOnline(false);
});
