import { create } from 'zustand';
import { fetchWithRuntime } from '../../lib/apiClient';

export const useKitchenOrdersProjection = create((set, get) => ({
  orders: [],
  isRebuilding: false,
  error: null,

  rebuild: async (branchId, stationId = null) => {
    if (get().isRebuilding) return;
    set({ isRebuilding: true, error: null });

    try {
      // Station-scoped projection filter applied via query param if stationId is present
      const stationQuery = stationId ? `?station_id=${stationId}` : '';
      const response = await fetchWithRuntime(`/api/v1/branches/${branchId}/kitchen/orders${stationQuery}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Ensure deterministic ordering (stable sort): created_at, bump priority, etc.
        const sortedOrders = (data.data || []).sort((a, b) => {
          // Priority 1: Expedite / Priority flag (if present)
          if (a.is_expedite && !b.is_expedite) return -1;
          if (!a.is_expedite && b.is_expedite) return 1;
          
          // Priority 2: SLA Breach
          const slaMs = 660000; // 11 minutes default
          const now = Date.now();
          const aElapsed = now - new Date(a.created_at).getTime();
          const bElapsed = now - new Date(b.created_at).getTime();
          const aBreach = aElapsed > (a.sla_ms || slaMs);
          const bBreach = bElapsed > (b.sla_ms || slaMs);
          if (aBreach && !bBreach) return -1;
          if (!aBreach && bBreach) return 1;

          // Priority 3: Created At (oldest first)
          const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          if (timeDiff !== 0) return timeDiff;

          // Priority 4: Sequence watermark
          if (a.sequence !== undefined && b.sequence !== undefined) {
            if (a.sequence !== b.sequence) return a.sequence - b.sequence;
          }

          // Priority 5: Lexicographical ID fallback
          return String(a.id).localeCompare(String(b.id));
        });

        set({ orders: sortedOrders });
      } else {
        throw new Error(`Failed to rebuild kitchen orders: ${response.status}`);
      }
    } catch (e) {
      console.error('[KitchenOrdersProjection] Rebuild failed', e);
      set({ error: e.message });
    } finally {
      set({ isRebuilding: false });
    }
  },

  // Derive optimistic state by overlaying MutationCoordinator's pending orders
  getOptimisticOrders: (pendingMutations) => {
    const baseOrders = JSON.parse(JSON.stringify(get().orders));
    
    // Apply strict operational boundaries for optimistic overlays
    pendingMutations.forEach(mutation => {
      const { type, payload } = mutation;
      const order = baseOrders.find(o => o.id === payload.orderId);
      
      if (order) {
        if (type === 'KITCHEN_MARK_PREPARING') {
          // Safe to instantly transition visually
          order.status = 'cooking';
          // Optionally mark specific items as preparing
          if (payload.itemIds) {
            order.items.forEach(it => {
              if (payload.itemIds.includes(it.id)) it.status = 'preparing';
            });
          }
        } 
        else if (type === 'KITCHEN_MARK_READY' || type === 'KITCHEN_BUMP_TICKET') {
          // Do NOT optimistically remove or change to ready. 
          // Instead, put into a pending operational state visually.
          order.isPendingOperationalConfirmation = true;
        }
        else if (type === 'KITCHEN_RECALL_TICKET') {
          // Do NOT optimistically recall. Wait for backend authoritative state.
        }
        else if (type === 'KITCHEN_REASSIGN_STATION') {
          // Wait for backend confirmation
          order.isPendingStationReassignment = true;
        }
      }
    });

    return baseOrders;
  }
}));
