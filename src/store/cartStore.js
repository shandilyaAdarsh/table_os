import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Deterministic Mutation Status Model
export const MutationStatus = {
  PENDING: 'PENDING',
  IN_FLIGHT: 'IN_FLIGHT',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  FAILED_FATAL: 'FAILED_FATAL',
  ROLLED_BACK: 'ROLLED_BACK',
};

// Pure function to calculate optimistic items deterministically
function deriveOptimisticItems(serverCartItems, mutationQueue) {
  // Deep clone to avoid mutating server state
  let items = JSON.parse(JSON.stringify(serverCartItems || []));

  // Sort queue by sequence strictly
  const sortedQueue = [...mutationQueue].sort((a, b) => a.mutation_sequence - b.mutation_sequence);

  for (const mutation of sortedQueue) {
    if (mutation.status === MutationStatus.ROLLED_BACK || mutation.status === MutationStatus.FAILED_FATAL) {
      continue; // Skip permanently failed mutations
    }

    const { type, payload } = mutation;

    if (type === 'ADD_ITEM') {
      // Optimistically push item
      items.push({
        id: `optimistic_${mutation.mutation_id}`,
        menu_item_id: payload.menu_item_id,
        quantity: payload.quantity,
        // (Other snapshot fields would ideally be resolved locally here if we had full menu state, 
        // but for simplicity we rely on the server to fill them in shortly)
      });
    } else if (type === 'UPDATE_ITEM') {
      const idx = items.findIndex(i => i.id === payload.itemId);
      if (idx !== -1) {
        items[idx].quantity = payload.quantity;
      }
    } else if (type === 'REMOVE_ITEM') {
      items = items.filter(i => i.id !== payload.itemId);
    }
  }

  return items;
}

export const useCartStore = create(
  persist(
    (set, get) => ({
      // Authoritative State
      serverCart: null,
      
      // Queued State
      mutationQueue: [],
      nextSequence: 1,

      // Derived State accessor
      getOptimisticItems: () => {
        const { serverCart, mutationQueue } = get();
        return deriveOptimisticItems(serverCart?.items, mutationQueue);
      },

      /**
       * Server Reconciliation
       * Called when the backend returns a successful response.
       */
      reconcileServerResponse: (responseAck, newServerCart) => {
        set((state) => {
          // Remove the acknowledged mutation from the queue
          const nextQueue = state.mutationQueue.filter(
            m => m.mutation_id !== responseAck.mutation_id
          );
          
          return {
            serverCart: newServerCart,
            mutationQueue: nextQueue,
          };
        });
      },

      /**
       * Mutation Queue Management
       */
      enqueueMutation: (type, payload) => {
        const mutation_id = crypto.randomUUID();
        const idempotency_key = crypto.randomUUID();
        const mutation_sequence = get().nextSequence;

        const mutation = {
          mutation_id,
          mutation_sequence,
          idempotency_key,
          type,
          payload,
          status: MutationStatus.PENDING,
          timestamp: new Date().toISOString(),
        };

        set((state) => ({
          mutationQueue: [...state.mutationQueue, mutation],
          nextSequence: state.nextSequence + 1,
        }));

        return mutation;
      },

      updateMutationStatus: (mutationId, status) => {
        set((state) => ({
          mutationQueue: state.mutationQueue.map(m => 
            m.mutation_id === mutationId ? { ...m, status } : m
          ),
        }));
      },

      dropMutation: (mutationId) => {
        set((state) => ({
          mutationQueue: state.mutationQueue.map(m => 
            m.mutation_id === mutationId ? { ...m, status: MutationStatus.ROLLED_BACK } : m
          ),
        }));
      },

      // Completely replace authoritative state (e.g. on fresh load)
      hydrateServerCart: (cartData) => {
        set({ serverCart: cartData });
      },
    }),
    {
      name: 'tableos-cart-engine',
      version: 1,
    }
  )
);
