import { create } from 'zustand';
import { initDB } from '../lib/idbStorage';
import { useConnectivityStore } from './connectivityStore';
import { submitMutation } from '../lib/apiClient';

// Deterministic Mutation Status Model
export const MutationStatus = {
  PENDING: 'PENDING',
  IN_FLIGHT: 'IN_FLIGHT',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FATAL: 'FAILED_FATAL',
  OCC_CONFLICT: 'OCC_CONFLICT',
  BLOCKED: 'BLOCKED',
};

// Types of mutations that must NOT auto-rebase on conflict
const FINANCIAL_MUTATIONS = [
  'SETTLE_PAYMENT',
  'REFUND_PAYMENT',
  'SPLIT_BILL',
  'CLOSE_ORDER',
  'TRANSFER_ORDER' // Table reassignment might be safe, but order transfer implies billing implications
];

function isFinancialConflict(type) {
  return FINANCIAL_MUTATIONS.includes(type);
}

export const useMutationCoordinator = create((set, get) => ({
  queue: [], // In-memory reflection of IDB queue for UI tracking
  isDraining: false,

  // Initialize from IDB on startup
  init: async () => {
    const db = await initDB();
    const allMutations = await db.getAll('mutation_queue');
    // Sort by sequence to maintain monotonic ordering
    allMutations.sort((a, b) => a.mutation_sequence - b.mutation_sequence);
    set({ queue: allMutations });
  },

  enqueueMutation: async (type, payload, expectedRevision = 0, providedIdempotencyKey = null) => {
    const db = await initDB();
    const idempotency_key = providedIdempotencyKey || crypto.randomUUID();
    
    const tx = db.transaction(['mutation_queue', 'idempotency_tombstones'], 'readwrite');
    const store = tx.objectStore('mutation_queue');
    const tombstoneStore = tx.objectStore('idempotency_tombstones');
    
    // Aggressive deduplication against pending mutations
    const existing = await store.getAll();
    const isPendingDuplicate = existing.some(m => m.idempotency_key === idempotency_key && m.status !== MutationStatus.FAILED_FATAL);
    
    // Aggressive deduplication against already completed (tombstoned) mutations
    const isTombstoned = await tombstoneStore.get(idempotency_key);
    
    if (isPendingDuplicate || isTombstoned) {
      console.warn(`[MutationCoordinator] Suppressed duplicate mutation: ${type} (Key: ${idempotency_key})`);
      await tx.done;
      return null; // Return null or existing mutation
    }

    // Monotonic sequence generation
    const maxSeq = existing.reduce((max, m) => Math.max(max, m.mutation_sequence), 0);
    const mutation_sequence = maxSeq + 1;
    const mutation_id = crypto.randomUUID();

    const mutation = {
      mutation_id,
      mutation_sequence,
      idempotency_key,
      type,
      payload,
      expected_cart_revision: expectedRevision,
      status: MutationStatus.PENDING,
      timestamp: new Date().toISOString(),
      retry_count: 0
    };

    // Durably persist to IndexedDB
    await store.put(mutation);
    await tx.done;
    
    // Update React UI State
    set((state) => ({ queue: [...state.queue, mutation] }));

    // Attempt to drain if online
    if (useConnectivityStore.getState().isOnline) {
      get().drainQueue();
    }

    return mutation;
  },

  updateMutationStatus: async (mutationId, status) => {
    const db = await initDB();
    const tx = db.transaction('mutation_queue', 'readwrite');
    const store = tx.objectStore('mutation_queue');
    const mutation = await store.get(mutationId);
    if (mutation) {
      mutation.status = status;
      await store.put(mutation);
    }
    await tx.done;

    set((state) => ({
      queue: state.queue.map((m) => (m.mutation_id === mutationId ? { ...m, status } : m)),
    }));
  },

  removeMutation: async (mutationId) => {
    const db = await initDB();
    
    // Fetch mutation to get idempotency key before removing
    const mutation = await db.get('mutation_queue', mutationId);
    
    const tx = db.transaction(['mutation_queue', 'idempotency_tombstones'], 'readwrite');
    await tx.objectStore('mutation_queue').delete(mutationId);
    
    // Tombstone it to prevent post-crash re-enqueue
    if (mutation && mutation.idempotency_key) {
      const tombstoneStore = tx.objectStore('idempotency_tombstones');
      await tombstoneStore.put({
        idempotency_key: mutation.idempotency_key,
        timestamp: Date.now()
      });
      
      // LRU Bounding (max 1000 items) - simple cleanup
      const allTombstones = await tombstoneStore.getAll();
      if (allTombstones.length > 1000) {
        allTombstones.sort((a, b) => a.timestamp - b.timestamp);
        const toDelete = allTombstones.slice(0, allTombstones.length - 1000);
        for (const t of toDelete) {
          await tombstoneStore.delete(t.idempotency_key);
        }
      }
    }
    
    await tx.done;

    set((state) => ({
      queue: state.queue.filter((m) => m.mutation_id !== mutationId),
    }));
  },

  // Expose stuck mutations based on threshold
  getStuckMutations: (thresholdMs = 10000) => {
    const now = Date.now();
    return get().queue.filter(m => {
      const isPendingOrInFlight = m.status === MutationStatus.PENDING || m.status === MutationStatus.IN_FLIGHT;
      if (!isPendingOrInFlight) return false;
      const elapsed = now - new Date(m.timestamp).getTime();
      return elapsed > thresholdMs;
    });
  },

  drainQueue: async () => {
    const state = get();
    if (state.isDraining) return;
    if (!useConnectivityStore.getState().isOnline) return;

    set({ isDraining: true });

    try {
      // Re-read queue from DB to be authoritative
      const db = await initDB();
      const allMutations = await db.getAll('mutation_queue');
      const pendingMutations = allMutations
        .filter((m) => m.status === MutationStatus.PENDING || m.status === MutationStatus.FAILED_RETRYABLE)
        .sort((a, b) => a.mutation_sequence - b.mutation_sequence);

      for (const mutation of pendingMutations) {
        if (!useConnectivityStore.getState().isOnline) {
          break; // Stop draining if we go offline
        }

        // Apply exponential backoff for retries
        if (mutation.status === MutationStatus.FAILED_RETRYABLE) {
          const backoff = Math.min(1000 * Math.pow(2, mutation.retry_count), 30000);
          const timeSinceLastUpdate = Date.now() - new Date(mutation.timestamp).getTime();
          if (timeSinceLastUpdate < backoff) {
            continue; // Skip this one for now, wait for backoff
          }
        }

        await get().updateMutationStatus(mutation.mutation_id, MutationStatus.IN_FLIGHT);

        try {
          const response = await submitMutation('/api/v1/mutations', mutation); // Generic endpoint example
          
          if (response.ok) {
            await get().removeMutation(mutation.mutation_id);
            useConnectivityStore.getState().recordApiSuccess();
          } else if (response.status === 409) {
            // OCC Conflict
            if (isFinancialConflict(mutation.type)) {
              await get().updateMutationStatus(mutation.mutation_id, MutationStatus.BLOCKED);
              // Notify UI that user intervention is required
              console.error(`[MutationCoordinator] BLOCKED finalization mutation due to OCC: ${mutation.mutation_id}`);
            } else {
              // Safe to rebase - mark OCC_CONFLICT, UI/ProjectionCoordinator should trigger re-fetch and rebase
              await get().updateMutationStatus(mutation.mutation_id, MutationStatus.OCC_CONFLICT);
              // Actually we can auto-trigger the silent re-fetch from ProjectionCoordinator here in the future
            }
          } else if (response.status >= 500) {
            // Retryable error
            mutation.retry_count = (mutation.retry_count || 0) + 1;
            mutation.timestamp = new Date().toISOString();
            const dbRef = await initDB();
            await dbRef.put('mutation_queue', mutation);
            await get().updateMutationStatus(mutation.mutation_id, MutationStatus.FAILED_RETRYABLE);
            useConnectivityStore.getState().recordApiSuccess(); // Network works, server is just failing
          } else {
            // 400 Bad Request / 422 Validation Error -> Fatal
            await get().updateMutationStatus(mutation.mutation_id, MutationStatus.FAILED_FATAL);
            useConnectivityStore.getState().recordApiSuccess();
          }
        } catch (error) {
          // Network timeout / Error
          console.error('[MutationCoordinator] Network failure during submit:', error);
          useConnectivityStore.getState().recordApiTimeout();
          
          mutation.retry_count = (mutation.retry_count || 0) + 1;
          mutation.timestamp = new Date().toISOString();
          const dbRef = await initDB();
          await dbRef.put('mutation_queue', mutation);
          await get().updateMutationStatus(mutation.mutation_id, MutationStatus.FAILED_RETRYABLE);
          break; // Stop draining since network is down
        }
      }
    } finally {
      set({ isDraining: false });
    }
  },
}));

// Connect to Connectivity Store changes
useConnectivityStore.subscribe((state, prevState) => {
  if (state.isOnline && !prevState.isOnline) {
    useMutationCoordinator.getState().drainQueue();
  }
});
