import { create } from 'zustand';
import { fetchWithRuntime } from '../lib/apiClient';
import { useRuntimeIdentityStore } from './runtimeIdentityStore';
import { useActiveOrdersProjection } from './projections/activeOrdersProjection';
import { useTableOccupancyProjection } from './projections/tableOccupancyProjection';
import { useBillingProjection } from './projections/billingProjection';
import { useKitchenOrdersProjection } from './projections/kitchenOrdersProjection';
import { useKitchenMetricsProjection } from './projections/kitchenMetricsProjection';

export const useProjectionCoordinator = create((set, get) => ({
  lastAppliedSequence: 0,
  snapshotVersion: null,
  projectionHash: null,
  runtimeProjectionVersion: 1,
  
  isReplaying: false,
  isFetchingSnapshot: false,
  lastRebuildTimestamp: 0,
  projectionGeneration: 0,
  
  // A queue of invalidation requests to debounce
  pendingInvalidations: new Set(),
  
  init: (initialSequence) => set({ lastAppliedSequence: initialSequence }),

  // When RealtimeEventRouter detects a gap, it triggers this
  startReplay: async (branchId) => {
    if (get().isReplaying) return;
    set({ isReplaying: true });

    try {
      const fromSequence = get().lastAppliedSequence;
      const response = await fetchWithRuntime(`/api/v1/branches/${branchId}/events/replay?from_sequence=${fromSequence}`);
      if (response.ok) {
        const events = await response.json();
        
        // Sequentially apply missing events
        for (const ev of events) {
          get().applyEvent(ev);
        }
      }
    } catch (e) {
      console.error('[ProjectionCoordinator] Failed to fetch replay events', e);
    } finally {
      set({ isReplaying: false });
    }
  },

  // Apply an event deterministically
  applyEvent: (eventPayload) => {
    const state = get();
    const seq = eventPayload.metadata?.sequence_number;

    if (!seq) {
      console.warn('[ProjectionCoordinator] Event lacks sequence_number', eventPayload);
      return;
    }

    if (seq <= state.lastAppliedSequence) {
      // Dedupe: already processed
      return;
    }

    if (seq > state.lastAppliedSequence + 1) {
      // Gap detected, but maybe this was called directly? RealtimeEventRouter should prevent this.
      console.warn(`[ProjectionCoordinator] Sequence gap detected during apply: expected ${state.lastAppliedSequence + 1}, got ${seq}`);
    }

    // Mark as processed
    set({ lastAppliedSequence: seq });

    // Route event for invalidation based on type
    get().routeInvalidation(eventPayload);
  },

  routeInvalidation: (eventPayload) => {
    const { eventType } = eventPayload;
    
    // Add to pending invalidations and trigger a debounced rebuild
    const invalidations = new Set(get().pendingInvalidations);
    
    if (eventType.startsWith('order.')) {
      invalidations.add('activeOrders');
      invalidations.add('kitchenOrders'); // Orders might affect kitchen
    } else if (eventType.startsWith('kitchen.')) {
      invalidations.add('kitchenOrders');
      invalidations.add('kitchenMetrics');
    } else if (eventType.startsWith('table.')) {
      invalidations.add('tableOccupancy');
    } else if (eventType.startsWith('billing.') || eventType.startsWith('settlement.')) {
      invalidations.add('billing');
    }
    // 'menu.' events might trigger full cart/menu rebuild
    
    set({ pendingInvalidations: invalidations });
    
    // Trigger debounced flush
    get().scheduleRebuild();
  },

  scheduleRebuild: async () => {
    // Replay Watermark Awareness: 
    // If the transport layer is currently actively syncing a large block of replay events,
    // we strictly defer all rebuilds until the SYNC_COMPLETE signal manually flushes them.
    const { useTransportStore } = await import('./transportStore');
    if (useTransportStore.getState().isSyncing) {
      return; 
    }

    // Basic debounce logic: if already scheduled or fetching, wait.
    if (get().isFetchingSnapshot) return;

    // Cooldown logic for Replay Storm Protection
    const REBUILD_COOLDOWN_MS = 500; 
    const timeSinceLastRebuild = Date.now() - get().lastRebuildTimestamp;
    
    if (timeSinceLastRebuild < REBUILD_COOLDOWN_MS) {
      setTimeout(() => {
        get().flushInvalidations();
      }, REBUILD_COOLDOWN_MS - timeSinceLastRebuild);
      return;
    }

    // Use a slight timeout to batch rapid synchronous invalidations
    setTimeout(() => {
      get().flushInvalidations();
    }, 50);
  },

  flushInvalidations: async () => {
    const state = get();
    if (state.pendingInvalidations.size === 0 || state.isFetchingSnapshot) return;

    // Stale Rebuild Prevention token
    const executionGeneration = state.projectionGeneration + 1;
    set({ isFetchingSnapshot: true, projectionGeneration: executionGeneration });
    
    try {
      const targets = Array.from(state.pendingInvalidations);
      const branchId = useRuntimeIdentityStore.getState().branchId;
      
      console.log(`[ProjectionCoordinator] Rebuilding projections (Gen: ${executionGeneration}):`, targets);
      
      const promises = [];
      if (targets.includes('activeOrders')) promises.push(useActiveOrdersProjection.getState().rebuild(branchId));
      if (targets.includes('tableOccupancy')) promises.push(useTableOccupancyProjection.getState().rebuild(branchId));
      if (targets.includes('billing')) promises.push(useBillingProjection.getState().rebuild(branchId));
      if (targets.includes('kitchenOrders')) promises.push(useKitchenOrdersProjection.getState().rebuild(branchId));
      if (targets.includes('kitchenMetrics')) promises.push(useKitchenMetricsProjection.getState().rebuild(branchId));

      await Promise.allSettled(promises);
      
      // Check if a newer rebuild started while we were awaiting promises
      if (get().projectionGeneration === executionGeneration) {
        set({ pendingInvalidations: new Set(), lastRebuildTimestamp: Date.now() });
      } else {
        console.warn(`[ProjectionCoordinator] Rebuild Gen ${executionGeneration} aborted. Stale data prevented from committing.`);
      }
    } finally {
      // Only clear fetching flag if we are the current generation
      if (get().projectionGeneration === executionGeneration) {
        set({ isFetchingSnapshot: false });
      }
    }
  }
}));
