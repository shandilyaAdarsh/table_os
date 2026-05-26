import { create } from 'zustand';
import { useMutationCoordinator } from './mutationCoordinator';

export const useCartStore = create((set, get) => ({
  // Authoritative State (the snapshot from the server)
  serverCart: { items: [], id: null, revision: 0 },
  
  // This projection derives its optimistic state by overlaying the MutationCoordinator queue
  getOptimisticItems: () => {
    const { serverCart } = get();
    // Deep clone to avoid mutating server state
    let items = JSON.parse(JSON.stringify(serverCart.items || []));

    // Get the queue directly from MutationCoordinator
    const mutationQueue = useMutationCoordinator.getState().queue;

    for (const mutation of mutationQueue) {
      if (mutation.status === 'FAILED_FATAL' || mutation.status === 'BLOCKED') {
        continue;
      }

      const { type, payload } = mutation;

      if (type === 'ADD_ITEM') {
        items.push({
          id: `optimistic_${mutation.mutation_id}`,
          menu_item_id: payload.menu_item_id,
          quantity: payload.quantity,
          selected_modifiers: payload.selected_modifiers || [],
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
  },

  hydrateServerCart: (cartData) => {
    set({ serverCart: cartData });
  },

  // Helper actions that now dispatch to the MutationCoordinator
  addItem: async (menuItemId, quantity, modifiers = []) => {
    const currentRevision = get().serverCart.revision;
    return await useMutationCoordinator.getState().enqueueMutation(
      'ADD_ITEM',
      { menu_item_id: menuItemId, quantity, selected_modifiers: modifiers },
      currentRevision
    );
  },

  updateItem: async (itemId, quantity) => {
    const currentRevision = get().serverCart.revision;
    return await useMutationCoordinator.getState().enqueueMutation(
      'UPDATE_ITEM',
      { itemId, quantity },
      currentRevision
    );
  },

  removeItem: async (itemId) => {
    const currentRevision = get().serverCart.revision;
    return await useMutationCoordinator.getState().enqueueMutation(
      'REMOVE_ITEM',
      { itemId },
      currentRevision
    );
  }
}));
