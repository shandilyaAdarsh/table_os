import { create } from 'zustand';
import { fetchWithRuntime } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';

export const useKitchenOrdersProjection = create((set, get) => ({
  orders: [],
  isRebuilding: false,
  error: null,

  updateLocalOrderStatus: (orderId, newStatus) => {
    const orders = get().orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o);
    set({ orders });
  },

  rebuild: async (branchId, stationId = null) => {
    if (get().isRebuilding) return;
    set({ isRebuilding: true, error: null });

    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id, name, qty, unit_price, note, status, done, is_rejected
          )
        `)
        .in('status', ['pending', 'cooking', 'ready'])
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Map Supabase table schema to KDSBoard model format
      const mappedOrders = (data || []).map(order => ({
        id: order.id,
        tableNum: order.table_num,
        customerName: order.guest_name || 'GUEST',
        status: order.status,
        createdAt: order.created_at,
        isPendingOperationalConfirmation: false,
        items: (order.order_items || []).map(item => ({
          id: item.id,
          name: item.name || '—',
          qty: item.qty,
          done: item.done,
          isRejected: item.is_rejected,
          note: item.note
        }))
      }));
        // Ensure deterministic ordering (stable sort): created_at, bump priority, etc.
        const sortedOrders = mappedOrders.sort((a, b) => {
          // Priority 1: Expedite / Priority flag (if present)
          if (a.is_expedite && !b.is_expedite) return -1;
          if (!a.is_expedite && b.is_expedite) return 1;
          
          // Priority 2: SLA Breach
          const slaMs = 660000; // 11 minutes default
          const now = Date.now();
          const aElapsed = now - new Date(a.createdAt).getTime();
          const bElapsed = now - new Date(b.createdAt).getTime();
          const aBreach = aElapsed > (a.sla_ms || slaMs);
          const bBreach = bElapsed > (b.sla_ms || slaMs);
          if (aBreach && !bBreach) return -1;
          if (!aBreach && bBreach) return 1;

          // Priority 3: Created At (oldest first)
          const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (timeDiff !== 0) return timeDiff;

          // Priority 4: Sequence watermark
          if (a.sequence !== undefined && b.sequence !== undefined) {
            if (a.sequence !== b.sequence) return a.sequence - b.sequence;
          }

          // Priority 5: Lexicographical ID fallback
          return String(a.id).localeCompare(String(b.id));
        });

        set({ orders: sortedOrders });
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
