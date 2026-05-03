import { create } from 'zustand'
import { supabase, TENANT_ID } from '../lib/supabase.js'

// ─── ORDER STORE ────────────────────────────────────────────────────────────
export const useOrderStore = create((set, get) => ({
  orders: [],
  isLoading: false,

  // Fetch all active orders from Supabase
  fetchOrders: async () => {
    if (!supabase) {
      console.error('[Store] Supabase client is null. Verify .env.local!')
      set({ isLoading: false })
      return
    }
    set({ isLoading: true })
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('tenant_id', TENANT_ID)
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
    if (!supabase) {
      console.error('[Store] subscribeRealtime: Supabase client missing!')
      return () => {}
    }
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${TENANT_ID}` },
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
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', TENANT_ID)

    if (error) console.error('[KDS] updateOrderStatus error:', error)
    // Do NOT manually update Zustand — Realtime handles it
  },

  // Remove (mark served) in DB → Realtime handles Zustand update
  removeOrder: async (id) => {
    // We already updated status to 'served' in the component usually,
    // but this ensures the store action is consistent.
    const { error } = await supabase
      .from('orders')
      .update({ status: 'served' })
      .eq('id', id)
      .eq('tenant_id', TENANT_ID)

    if (error) console.error('[KDS] removeOrder error:', error)
  },

  setOrderNew: (id) => set(s => ({
    orders: s.orders.map(o => o.id === id ? { ...o, isNew: false } : o)
  })),

  // Toggle individual order item 'done' status
  toggleOrderItem: async (orderId, itemId, done) => {
    // Optimistic update
    set(s => ({
      orders: s.orders.map(o => {
        if (o.id !== orderId) return o
        return {
          ...o,
          items: o.items.map(it => it.id === itemId ? { ...it, done } : it)
        }
      })
    }))

    const { error } = await supabase
      .from('order_items')
      .update({ done })
      .eq('id', itemId)

    if (error) {
      console.error('[KDS] toggleOrderItem error:', error)
      // Revert on error (fetch orders again or handle specifically)
      get().fetchOrders()
    }
  },
}))

// ─── ADMIN STORE ─────────────────────────────────────────────────────────────
export const useAdminStore = create((set) => ({
  staff: null,
  login: (staffData) => set({ staff: staffData }),
  logout: () => set({ staff: null })
}))

// ─── TABLE STORE ─────────────────────────────────────────────────────────────
export const useTableStore = create((set) => ({
  tables: [],
  isLoading: false,

  fetchTables: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .order('label', { ascending: true })

    if (error) { console.error('[Tables] fetch error:', error); set({ isLoading: false }); return }
    set({ tables: data || [], isLoading: false })
  },

  updateTableStatus: async (id, status) => {
    const { error } = await supabase
      .from('tables')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', TENANT_ID)

    if (error) console.error('[Tables] updateStatus error:', error)
  },
}))

// ─── CART STORE (local only, no DB) ──────────────────────────────────────────
export const useCartStore = create((set) => ({
  items: [],
  note: '',
  addItem: (item) => set(s => {
    // Check if item with same ID and modifiers already exists
    const existing = s.items.find(i =>
      i.id === item.id &&
      JSON.stringify(i.modifiers || []) === JSON.stringify(item.modifiers || [])
    )
    if (existing) {
      return {
        items: s.items.map(i =>
          (i.id === item.id && JSON.stringify(i.modifiers || []) === JSON.stringify(item.modifiers || []))
            ? { ...i, qty: i.qty + (item.qty || 1) }
            : i
        )
      }
    }
    return { items: [...s.items, { ...item, qty: item.qty || 1 }] }
  }),
  removeItem: (id, modifiers) => set(s => ({
    items: s.items.filter(i =>
      !(i.id === id && JSON.stringify(i.modifiers || []) === JSON.stringify(modifiers || []))
    )
  })),
  updateQty: (id, modifiers, qty) => set(s => {
    if (qty <= 0) {
      return {
        items: s.items.filter(i =>
          !(i.id === id && JSON.stringify(i.modifiers || []) === JSON.stringify(modifiers || []))
        )
      }
    }
    return {
      items: s.items.map(i =>
        (i.id === id && JSON.stringify(i.modifiers || []) === JSON.stringify(modifiers || []))
          ? { ...i, qty }
          : i
      )
    }
  }),
  setNote: (note) => set({ note }),
  clear: () => set({ items: [], note: '' }),
}))

// ─── MENU STORE ───────────────────────────────────────────────────────────────
export const useMenuStore = create((set, get) => ({
  items: [],
  isLoading: false,
  initialized: false,

  init: async (tenantId = TENANT_ID) => {
    if (get().initialized) return
    await get().fetchMenu(tenantId)
    set({ initialized: true })
  },

  fetchMenu: async (tenantId = TENANT_ID) => {
    if (!supabase) {
      console.error('[Menu] Supabase client missing!')
      set({ isLoading: false })
      return
    }
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('category', { ascending: true })

    if (error) { console.error('[Menu] fetch error:', error); set({ isLoading: false }); return }
    set({ items: data || [], isLoading: false })
  },

  destroy: () => set({ initialized: false, items: [] }),

  toggle86: async (id) => {
    const { items } = get()
    const item = items.find(i => i.id === id)
    if (!item) return

    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', id)
      .eq('tenant_id', TENANT_ID)

    if (error) console.error('[Menu] toggle86 error:', error)
    // Optimistic local update since menu has no Realtime subscription
    else set(s => ({ items: s.items.map(i => i.id === id ? { ...i, is_available: !i.is_available } : i) }))
  },
}))

export const useSessionStore = create((set) => ({
  session_id: localStorage.getItem('session_id') || null,
  name: localStorage.getItem('session_name') || '',
  phone: localStorage.getItem('session_phone') || '',
  table_num: localStorage.getItem('session_table') || 'T03',

  joinTable: (name, phone, tableNum) => {
    const id = `sess_${Date.now()}`
    localStorage.setItem('session_id', id)
    localStorage.setItem('session_name', name)
    localStorage.setItem('session_phone', phone)
    localStorage.setItem('session_table', tableNum)
    set({ session_id: id, name, phone, table_num: tableNum })
  },

  leaveTable: () => {
    localStorage.removeItem('session_id')
    localStorage.removeItem('session_name')
    localStorage.removeItem('session_phone')
    localStorage.removeItem('session_table')
    set({ session_id: null, name: '', phone: '', table_num: 'T03' })
  }
}))

export const useStaffStore = create((set) => ({
  staff_user: null,
  isAuthenticated: false,

  login: (staffMember) => {
    localStorage.setItem('staff_user', JSON.stringify(staffMember))
    set({ staff_user: staffMember, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('staff_user')
    set({ staff_user: null, isAuthenticated: false })
  },

  init: () => {
    const stored = localStorage.getItem('staff_user')
    if (stored) {
      try {
        const staffMember = JSON.parse(stored)
        set({ staff_user: staffMember, isAuthenticated: true })
      } catch {
        localStorage.removeItem('staff_user')
      }
    }
  }
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
      name: it?.name || 'Unknown Item',
      qty: it?.qty || 1,
      station: it?.station || '',
      allergen: it?.allergen || null,
      note: it?.note || '',
      done: it?.done || false,
    })).filter(Boolean),
  }
}
