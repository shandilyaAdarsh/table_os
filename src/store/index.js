import { create } from 'zustand'
import { supabase } from '../lib/supabase.js'
import { useAuthStore } from './authStore.js'

export { useAuthStore, useAuthStore as useAdminStore }

// ─── ORDER STORE ────────────────────────────────────────────────────────────
export const useOrderStore = create((set, get) => ({
  liveOrders: [],
  historyOrders: [],
  totalOrdersToday: 0,
  isLoading: false,
  pendingActions: new Set(), // Set of order IDs currently being updated

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
        .not('status', 'in', '("served","rejected")')
        .order('created_at', { ascending: true })

      if (error) {
        throw error
      }

      const fetchedOrders = (data || []).map(normalizeOrder)
      
      set(s => {
        // Merge fetched orders but PRESERVE local state for orders with pending actions
        const merged = fetchedOrders.map(newOrder => {
          if (s.pendingActions.has(newOrder.id)) {
            const local = s.liveOrders.find(o => o.id === newOrder.id)
            return local ? { ...newOrder, status: local.status } : newOrder
          }
          return newOrder
        })

        return { liveOrders: merged, isLoading: false }
      })

      // Also fetch today's count
      get().fetchTodayCount()
    } catch (err) {
      console.error('[Store] fetchOrders failed:', err)
      set({ isLoading: false })
    }
  },

  fetchTodayCount: async () => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    if (!tenantId) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    try {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', today.toISOString())

      if (error) throw error
      set({ totalOrdersToday: count || 0 })
    } catch (err) {
      console.error('[Store] fetchTodayCount failed:', err)
    }
  },

  fetchHistory: async (filter = 'day') => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    if (!tenantId) return

    set({ isLoading: true })
    try {
      let query = supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', tenantId)
        .in('status', ['served', 'rejected'])
        .order('created_at', { ascending: false })

      const now = new Date()
      if (filter === 'day') {
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)
        query = query.gte('created_at', startOfDay.toISOString())
      } else if (filter === 'week') {
        const startOfWeek = new Date()
        startOfWeek.setDate(now.getDate() - 7)
        query = query.gte('created_at', startOfWeek.toISOString())
      } else if (filter === 'month') {
        const startOfMonth = new Date()
        startOfMonth.setMonth(now.getMonth() - 1)
        query = query.gte('created_at', startOfMonth.toISOString())
      }
      // if 'all', no date filter, just use the limit

      const { data, error } = await query.limit(100)

      if (error) throw error

      const orders = (data || []).map(normalizeOrder)
      set({ historyOrders: orders, isLoading: false })
    } catch (err) {
      console.error('[Store] fetchHistory failed:', err)
      set({ isLoading: false })
    }
  },

  // Subscribe to Realtime changes — call once on KDS mount
  subscribeRealtime: () => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    if (!tenantId) return () => {}

    const channel = supabase
      .channel('kds-realtime')
      // 1. Listen to Order changes
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload

          if (eventType === 'INSERT') {
            // RACE CONDITION FIX: Wait 500ms for items to be inserted before fetching
            await new Promise(r => setTimeout(r, 500))
            
            const { data: items } = await supabase
              .from('order_items')
              .select('*')
              .eq('order_id', newRow.id)

            if (newRow.status === 'served' || newRow.status === 'rejected') return

            const order = normalizeOrder({ ...newRow, order_items: items || [], isNew: true })
            set(s => {
              if (s.liveOrders.some(o => o.id === order.id)) return s
              return { 
                liveOrders: [order, ...s.liveOrders],
                totalOrdersToday: s.totalOrdersToday + 1
              }
            })
          }

          if (eventType === 'UPDATE') {
            set(s => {
              // If we have a pending local action for this order, ignore the update 
              if (s.pendingActions.has(newRow.id)) return s

              return {
                liveOrders: s.liveOrders
                  .map(o => o.id === newRow.id ? { ...o, status: newRow.status } : o)
                  .filter(o => o.status !== 'served' && o.status !== 'rejected')
              }
            })
          }

          if (eventType === 'DELETE') {
            set(s => ({ liveOrders: s.liveOrders.filter(o => o.id !== oldRow.id) }))
          }
        })
      // 2. Listen to Order Item changes (syncs 'done' status and late additions)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        (payload) => {
          const { eventType, new: newItem, old: oldItem } = payload
          
          set(s => {
            const orderIndex = s.liveOrders.findIndex(o => o.id === (newItem?.order_id || oldItem?.order_id))
            if (orderIndex === -1) return s

            const updatedOrders = [...s.liveOrders]
            const order = { ...updatedOrders[orderIndex] }

            if (eventType === 'INSERT') {
              if (!order.items.some(it => it.id === newItem.id)) {
                order.items = [...order.items, normalizeOrderItem(newItem)]
              }
            } else if (eventType === 'UPDATE') {
              order.items = order.items.map(it => 
                it.id === newItem.id ? { ...it, ...normalizeOrderItem(newItem) } : it
              )
            } else if (eventType === 'DELETE') {
              order.items = order.items.filter(it => it.id !== oldItem.id)
            }

            updatedOrders[orderIndex] = order
            return { liveOrders: updatedOrders }
          })
        })
      .subscribe()

    // Return unsubscribe function for cleanup
    return () => supabase.removeChannel(channel)
  },

  // Write status to DB → Realtime will update Zustand
  updateOrderStatus: async (id, status) => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    const prevOrders = get().liveOrders

    // OPTIMISTIC UPDATE
    set(s => {
      const nextActions = new Set(s.pendingActions)
      nextActions.add(id)
      return {
        pendingActions: nextActions,
        liveOrders: s.liveOrders.map(o => o.id === id ? { ...o, status } : o)
      }
    })

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status, is_new: false })
        .eq('id', id)
        .eq('tenant_id', tenantId)

      if (error) throw error

      // If terminal status, remove from list after short delay or instantly
      if (status === 'served' || status === 'rejected') {
        set(s => {
          const nextActions = new Set(s.pendingActions)
          nextActions.delete(id)
          return {
            pendingActions: nextActions,
            liveOrders: s.liveOrders.filter(o => o.id !== id)
          }
        })
      } else {
        // Just remove from pending actions, status is already updated
        set(s => {
          const nextActions = new Set(s.pendingActions)
          nextActions.delete(id)
          return { pendingActions: nextActions }
        })
      }
    } catch (error) {
      console.error('[KDS] updateOrderStatus error:', error)
      set(s => {
        const nextActions = new Set(s.pendingActions)
        nextActions.delete(id)
        return { pendingActions: nextActions, liveOrders: prevOrders }
      })
    }
  },

  // Remove (mark served) in DB → Realtime handles Zustand update
  removeOrder: async (id) => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
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
    const { liveOrders } = get()
    const order = liveOrders.find(o => o.id === orderId)
    if (!order) return

    const rejectedIds = order.items
      .filter(it => !acceptedIds.includes(it.id))
      .map(it => it.id)

    const prevOrders = get().liveOrders

    // OPTIMISTIC UPDATE: Move to cooking and reject filtered items instantly
    set(s => {
      const nextActions = new Set(s.pendingActions)
      nextActions.add(orderId)
      return {
        pendingActions: nextActions,
        liveOrders: s.liveOrders.map(o => {
          if (o.id !== orderId) return o;
          return {
            ...o,
            status: 'cooking',
            isNew: false,
            items: o.items.map(it => rejectedIds.includes(it.id) ? { ...it, isRejected: true } : it)
          };
        })
      }
    });

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
      // Success
      set(s => {
        const nextActions = new Set(s.pendingActions)
        nextActions.delete(orderId)
        return { pendingActions: nextActions }
      })
    } catch (err) {
      console.error('[KDS] acceptPartialOrder failed, reverting...', err)
      set(s => {
        const nextActions = new Set(s.pendingActions)
        nextActions.delete(orderId)
        return { pendingActions: nextActions, liveOrders: prevOrders }
      })
    }
  },

  // Reject Order: Mark whole order rejected and items rejected
  rejectOrder: async (orderId, outOfStockItemIds = []) => {
    const { tenantId: storeId } = useAuthStore.getState()
    const tenantId = storeId || import.meta.env.VITE_TENANT_ID
    
    const prevOrders = get().liveOrders
    
    // OPTIMISTIC UPDATE: Remove/Reject order instantly
    set(s => {
      const nextActions = new Set(s.pendingActions)
      nextActions.add(orderId)
      
      return {
        pendingActions: nextActions,
        liveOrders: s.liveOrders.map(o => {
          if (o.id !== orderId) return o;
          return { ...o, status: 'rejected', isNew: false };
        })
      }
    });

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
      // 4. Success: Remove from pending and filter out of list
      set(s => {
        const nextActions = new Set(s.pendingActions)
        nextActions.delete(orderId)
        return {
          pendingActions: nextActions,
          liveOrders: s.liveOrders.filter(o => o.id !== orderId)
        }
      })
    } catch (err) {
      console.error('[KDS] rejectOrder failed, reverting...', err)
      set(s => {
        const nextActions = new Set(s.pendingActions)
        nextActions.delete(orderId)
        return {
          pendingActions: nextActions,
          liveOrders: prevOrders
        }
      })
      throw err
    }
  },

  setOrderNew: (id) => set(s => ({
    liveOrders: s.liveOrders.map(o => o.id === id ? { ...o, isNew: false } : o)
  })),

  // Toggle individual order item 'done' status
  toggleOrderItem: async (orderId, itemId, done) => {
    // Optimistic update
    set(s => ({
      liveOrders: s.liveOrders.map(o => {
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
function normalizeOrderItem(it) {
  if (!it) return null
  return {
    id: it.id,
    menuItemId: it.menu_item_id || null,
    name: it.name || 'Unknown Item',
    qty: it.qty || 1,
    station: it.station || '',
    allergen: it.allergen || null,
    note: it.note || '',
    done: it.done || false,
    isRejected: it.is_rejected || false,
  }
}

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
    customerName: row.customer_name || row.customerName || '',
    isNew: row.isNew || false,
    items: (row.order_items || []).map(normalizeOrderItem).filter(Boolean),
  }
}

