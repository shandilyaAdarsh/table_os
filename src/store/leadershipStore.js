import { create } from 'zustand';

export const useLeadershipStore = create((set, get) => ({
  isLeader: false,
  isAttemptingLock: false,
  abortController: null,
  lockName: null,

  requestLeadership: (stationId) => {
    if (!navigator.locks) {
      console.warn('[LeadershipStore] Web Locks API not supported. Falling back to multi-active mode.');
      set({ isLeader: true });
      return;
    }

    if (get().isAttemptingLock || get().isLeader) return;

    const lockName = `kds-station-${stationId || 'global'}`;
    const controller = new AbortController();

    set({ isAttemptingLock: true, abortController: controller, lockName });

    navigator.locks.request(
      lockName,
      { mode: 'exclusive', signal: controller.signal },
      async (lock) => {
        // We have acquired the lock. This tab is now the leader.
        set({ isLeader: true, isAttemptingLock: false });
        console.log(`[LeadershipStore] Acquired exclusive lock: ${lockName}. This tab is now the LEADER.`);

        // The lock is held for as long as this promise remains unresolved.
        // We return a never-resolving promise so the lock is held until the page unloads
        // or we explicitly abort it via the AbortController.
        return new Promise((resolve) => {
          // Store resolve function if we want to manually release it later,
          // but typically AbortController handles it.
        });
      }
    ).catch(err => {
      if (err.name === 'AbortError') {
        console.log(`[LeadershipStore] Lock request for ${lockName} aborted.`);
      } else {
        console.error('[LeadershipStore] Failed to acquire lock:', err);
      }
    });

    // We didn't await the request, it runs in the background. 
    // If another tab holds the lock, the callback won't run until that tab closes.
    // So if `isLeader` remains false, we are a standby tab.
    set({ isAttemptingLock: false });
  },

  releaseLeadership: () => {
    const { abortController, lockName } = get();
    if (abortController) {
      abortController.abort();
      set({ isLeader: false, abortController: null, lockName: null });
      console.log(`[LeadershipStore] Released leadership for ${lockName}.`);
    }
  }
}));
