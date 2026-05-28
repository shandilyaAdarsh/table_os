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

  // --- Runtime Infrastructure Integration ---
  // The store is now an IMMUTABLE projection consumer.
  // It does NOT orchestrate fetches, it does NOT patch partial state,
  // and it does NOT execute mutations.
  
  replaceOrdersProjection: (orders) => {
    console.debug(`[useOrderStore] Atomic projection replacement: ${orders.length} orders`);
    
    // Also compute today's orders count based on the projection
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const countToday = orders.filter(o => (o.created_at || o.createdAt) >= todayIso).length;

    set({ 
      liveOrders: orders, 
      totalOrdersToday: countToday,
      isLoading: false 
    });
  },

  replaceOrderProjection: (order) => set(s => {
    console.debug(`[useOrderStore] Atomic single-order projection replacement: ${order.id}`);
    
    let exists = false;
    const nextOrders = s.liveOrders.map(o => {
      if (o.id === order.id) {
        exists = true;
        return order;
      }
      return o;
    });

    if (!exists) {
      nextOrders.push(order);
    }

    // Sort appropriately if needed
    // nextOrders.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))

    return { liveOrders: nextOrders };
  }),

  // For Admin/KDS history
  setHistoryOrders: (orders) => set({ historyOrders: orders, isLoading: false }),
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

  destroy: () => set({ initialized: false, items: [] }),

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

