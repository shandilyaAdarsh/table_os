import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from './authStore.js'

export { useAuthStore, useAuthStore as useAdminStore }

// ─── ORDER STORE ────────────────────────────────────────────────────────────
export const useOrderStore = create((set, get) => ({
  orders: [],
  isLoading: false,

  // Fetch all active orders from Supabase
  fetchOrders: async () => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID

    if (!tenantId) {
      console.warn('[Store] fetchOrders skipped: no tenantId')
      set({ isLoading: false })
      return
    }
    set({ isLoading: true })
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .not('status', 'eq', 'served')
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      const orders = (data || []).map(normalizeOrder)
      set({ orders, isLoading: false })
    } catch (err) {
      console.error('[Store] fetchOrders failed:', err)
      set({ isLoading: false })
    }
  },

  // Subscribe to Realtime changes — call once on KDS mount
  subscribeRealtime: () => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    if (!tenantId) return () => {}

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload

          if (eventType === 'INSERT') {
            // Need to fetch order_items for the new order
            supabase
              .from('order_items')
              .select('*')
              .eq('order_id', newRow.id)
              .then(({ data: items }) => {
                const order = normalizeOrder({ ...newRow, order_items: items || [], isNew: true })
                set(s => ({ orders: [order, ...s.orders] }))
              })
          }

          if (eventType === 'UPDATE') {
            set(s => ({
              orders: s.orders.map(o =>
                o.id === newRow.id
                  ? { ...o, status: newRow.status }
                  : o
              )
            }))
          }

          if (eventType === 'DELETE') {
            set(s => ({ orders: s.orders.filter(o => o.id !== oldRow.id) }))
          }
        })
      .subscribe()

    // Return unsubscribe function for cleanup
    return () => supabase.removeChannel(channel)
  },

  // Write status to DB → Realtime will update Zustand
  updateOrderStatus: async (id, status) => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) console.error('[KDS] updateOrderStatus error:', error)
    // Do NOT manually update Zustand — Realtime handles it
  },

  // Remove (mark served) in DB → Realtime handles Zustand update
  removeOrder: async (id) => {
    const { tenantId } = useAuthStore.getState()
    // We already updated status to 'served' in the component usually,
    // but this ensures the store action is consistent.
    const { error } = await supabase
      .from('orders')
      .update({ status: 'served' })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) console.error('[KDS] removeOrder error:', error)
  },

  // Partial Accept: Items NOT in acceptedIds are marked is_rejected
  acceptPartialOrder: async (orderId, acceptedIds) => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    const { orders } = get()
    const order = orders.find(o => o.id === orderId)
    if (!order) return

    const rejectedIds = order.items
      .filter(it => !acceptedIds.includes(it.id))
      .map(it => it.id)

    // OPTIMISTIC UPDATE: Move to cooking and reject filtered items instantly
    set(s => ({
      orders: s.orders.map(o => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          status: 'cooking',
          isNew: false,
          items: o.items.map(it => rejectedIds.includes(it.id) ? { ...it, isRejected: true } : it)
        };
      })
    }));

    try {
      // 1. Update order status to cooking
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'cooking', is_new: false })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)

      if (orderError) throw orderError

      // 2. Mark unselected items as rejected
      if (rejectedIds.length > 0) {
        await supabase
          .from('order_items')
          .update({ is_rejected: true })
          .in('id', rejectedIds)
      }
    } catch (err) {
      console.error('[KDS] acceptPartialOrder failed, reverting...', err)
      get().fetchOrders(); // Revert to server truth
    }
  },

  // Reject Order: Mark whole order rejected and items rejected
  rejectOrder: async (orderId, outOfStockItemIds = []) => {
    const { tenantId } = useAuthStore.getState()
    
    // OPTIMISTIC UPDATE: Remove/Reject order instantly
    set(s => ({
      orders: s.orders.map(o => {
        if (o.id !== orderId) return o;
        return { ...o, status: 'rejected', isNew: false };
      })
    }));

    try {
      // 1. Mark order rejected
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'rejected', is_new: false })
        .eq('id', orderId)
        .eq('tenant_id', tenantId)

      if (orderError) throw orderError

      // 2. Mark all items in this order as rejected
      await supabase
        .from('order_items')
        .update({ is_rejected: true })
        .eq('order_id', orderId)

      // 3. Mark specific items as out of stock if provided
      if (outOfStockItemIds.length > 0) {
        await useMenuStore.getState().markItemsUnavailable(outOfStockItemIds)
      }
    } catch (err) {
      console.error('[KDS] rejectOrder failed, reverting...', err)
      get().fetchOrders(); // Revert
    }
  },

  setOrderNew: (id) => set(s => ({
    orders: s.orders.map(o => o.id === id ? { ...o, isNew: false } : o)
  })),

  // Toggle individual order item 'done' status
  toggleOrderItem: async (orderId, itemId, done) => {
    // Optimistic update
    set(s => ({
      orders: s.orders.map(o => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          items: o.items.map(it => it.id === itemId ? { ...it, done } : it)
        };
      })
    }));

    const { error } = await supabase
      .from('order_items')
      .update({ done })
      .eq('id', itemId);

    if (error) {
      console.error('[KDS] toggleOrderItem error:', error);
      // Revert on error (fetch orders again or handle specifically)
      get().fetchOrders();
    }
  },
}))


// ─── TABLE STORE ─────────────────────────────────────────────────────────────
export const useTableStore = create((set) => ({
  tables: [],
  isLoading: false,

  fetchTables: async () => {
    const { tenantId } = useAuthStore.getState()
    if (!tenantId) return

    set({ isLoading: true })
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('label', { ascending: true })

    if (error) { console.error('[Tables] fetch error:', error); set({ isLoading: false }); return }
    set({ tables: data || [], isLoading: false })
  },

  updateTableStatus: async (id, status) => {
    const { tenantId } = useAuthStore.getState()
    const { error } = await supabase
      .from('tables')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) console.error('[Tables] updateStatus error:', error)
  },
}))

// ─── CART STORE (local only, no DB) ──────────────────────────────────────────
export const useCartStore = create((set) => ({
  items: [], note: '',
  addItem: (item) => set(s => ({ items: [...s.items, item] })),
  removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
  updateQty: (id, qty) => set(s => ({ items: s.items.map(i => i.id === id ? { ...i, qty } : i) })),
  setNote: (note) => set({ note }),
  clear: () => set({ items: [], note: '' }),
}))

// ─── MENU STORE ───────────────────────────────────────────────────────────────
export const useMenuStore = create((set) => ({
  items: [],
  isLoading: false,

  fetchMenu: async () => {
    const { tenantId } = useAuthStore.getState()
    if (!tenantId) return

    set({ isLoading: true })
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('category', { ascending: true })

    if (error) { console.error('[Menu] fetch error:', error); set({ isLoading: false }); return }
    set({ items: data || [], isLoading: false })
  },

  toggle86: async (id) => {
    const { tenantId } = useAuthStore.getState()
    const { items } = useMenuStore.getState()
    const item = items.find(i => i.id === id)
    if (!item) return

    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) console.error('[Menu] toggle86 error:', error)
    // Optimistic local update since menu has no Realtime subscription
    else set(s => ({ items: s.items.map(i => i.id === id ? { ...i, is_available: !i.is_available } : i) }))
  },

  markItemsUnavailable: async (itemIds) => {
    const { tenantId } = useAuthStore.getState()
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: false })
      .in('id', itemIds)
      .eq('tenant_id', tenantId)

    if (error) console.error('[Menu] markItemsUnavailable error:', error)
    else set(s => ({ items: s.items.map(i => itemIds.includes(i.id) ? { ...i, is_available: false } : i) }))
  },
}))

// ─── NORMALIZER ──────────────────────────────────────────────────────────────
function normalizeOrder(row) {
  if (!row) return null
  return {
    id: row.id,
    tableId: row.table_id || row.tableId || null,
    tableNum: row.table_num || row.tableNum || '?',
    status: row.status || 'pending',
    createdAt: row.created_at || null,
    note: row.note || '',
    allergen: row.allergen || null,
    isNew: row.isNew || false,
    items: (row.order_items || []).map(it => ({
      id: it?.id,
      menuItemId: it?.menu_item_id || null, // Needed for OOS flagging
      name: it?.name || 'Unknown Item',
      qty: it?.qty || 1,
      station: it?.station || '',
      allergen: it?.allergen || null,
      note: it?.note || '',
      done: it?.done || false,
      isRejected: it?.is_rejected || false,
    })).filter(Boolean),
  }
}
