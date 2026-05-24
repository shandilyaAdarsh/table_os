// src/store/availabilityStore.js
import { create } from 'zustand';

export const useAvailabilityStore = create((set, get) => ({
  overlayByItemId: {}, // Map<menuItemId, AvailabilityItemDto>
  isStale: false,
  lastFetchedAt: null,
  error: null,

  setOverlayData: (overlayData) => {
    const newMap = {};
    if (overlayData && Array.isArray(overlayData.items)) {
      overlayData.items.forEach(item => {
        newMap[item.menu_item_id] = item;
      });
    }
    
    set({
      overlayByItemId: newMap,
      isStale: false,
      lastFetchedAt: Date.now(),
      error: null
    });
  },

  setStale: (errorMsg) => {
    // Preserves the existing overlay but marks it as stale
    set({
      isStale: true,
      error: errorMsg || 'Failed to refresh availability data'
    });
  },

  getAvailability: (menuItemId) => {
    // Default to visible if we haven't fetched the overlay yet
    return get().overlayByItemId[menuItemId] || {
      is_available: true,
      visibility_state: 'VISIBLE',
      reason: null,
      resolution_source: 'DEFAULT'
    };
  }
}));
