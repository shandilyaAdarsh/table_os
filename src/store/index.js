import { create } from 'zustand'

const mockOrders = [
  { id: "#1001", tableNum: "T03", items: [{ name: "Butter Chicken", qty: 2, station: "HOT", allergen: null, note: "", done: false }, { name: "Garlic Naan", qty: 4, station: "BREAD", allergen: null, note: "", done: false }], status: "cooking", elapsed: 240, isNew: false, note: "" },
  { id: "#1002", tableNum: "T07", items: [{ name: "Paneer Tikka", qty: 1, station: "GRILL", allergen: "NUT ALLERGY — verify sauce", note: "Extra spicy", done: false }], status: "pending", elapsed: 60, isNew: false, note: "Extra spicy please" },
  { id: "#1003", tableNum: "T11", items: [{ name: "Dal Makhani", qty: 2, station: "HOT", allergen: null, note: "", done: false }, { name: "Jeera Rice", qty: 2, station: "HOT", allergen: null, note: "", done: false }], status: "ready", elapsed: 680, isNew: false, note: "" }
]

const mockTables = Array.from({ length: 15 }, (_, i) => ({
  id: `T${String(i + 1).padStart(2, '0')}`,
  status: ['vacant', 'occupied', 'payment_pending', 'needs_bussing', 'vacant'][i % 5],
  capacity: 4,
}))

const mockMenuItems = [
  { id: "m1", name: "Butter Chicken", category: "Mains", price: 380, station: "HOT", allergen: null, isAvailable: true, image: "https://source.unsplash.com/400x300/?butter-chicken" },
  { id: "m2", name: "Paneer Tikka", category: "Starters", price: 280, station: "GRILL", allergen: null, isAvailable: true, image: "https://source.unsplash.com/400x300/?paneer-tikka" },
  { id: "m3", name: "Garlic Naan", category: "Breads", price: 60, station: "BREAD", allergen: "GLUTEN", isAvailable: true, image: "https://source.unsplash.com/400x300/?naan" },
  { id: "m4", name: "Dal Makhani", category: "Mains", price: 260, station: "HOT", allergen: null, isAvailable: true, image: "https://source.unsplash.com/400x300/?dal" },
  { id: "m5", name: "Jeera Rice", category: "Rice", price: 180, station: "HOT", allergen: null, isAvailable: true, image: "https://source.unsplash.com/400x300/?rice" },
  { id: "m6", name: "Mango Lassi", category: "Drinks", price: 120, station: "BAR", allergen: "DAIRY", isAvailable: true, image: "https://source.unsplash.com/400x300/?lassi" },
  { id: "m7", name: "Chicken Biryani", category: "Mains", price: 420, station: "HOT", allergen: null, isAvailable: false, image: "https://source.unsplash.com/400x300/?biryani" },
  { id: "m8", name: "Samosa", category: "Starters", price: 80, station: "FRY", allergen: "GLUTEN", isAvailable: true, image: "https://source.unsplash.com/400x300/?samosa" }
]

export const useOrderStore = create((set) => ({
  orders: [...mockOrders],
  addOrder: (order) => set(s => ({ orders: [...s.orders, { ...order, isNew: true }] })),
  updateOrderStatus: (id, status) => set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, status } : o) })),
  toggleItemDone: (orderId, itemIdx) => set(s => ({ orders: s.orders.map(o => o.id === orderId ? { ...o, items: o.items.map((it, i) => i === itemIdx ? { ...it, done: !it.done } : it) } : o) })),
  removeOrder: (id) => set(s => ({ orders: s.orders.filter(o => o.id !== id) })),
  setOrderNew: (id) => set(s => ({ orders: s.orders.map(o => o.id === id ? { ...o, isNew: false } : o) })),
  incrementElapsed: () => set(s => ({ orders: s.orders.map(o => ['pending','cooking'].includes(o.status) ? { ...o, elapsed: o.elapsed + 1 } : o) })),
}))

export const useTableStore = create((set) => ({
  tables: [...mockTables],
  updateTableStatus: (id, status) => set(s => ({ tables: s.tables.map(t => t.id === id ? { ...t, status } : t) })),
}))

export const useCartStore = create((set) => ({
  items: [], note: '',
  addItem: (item) => set(s => ({ items: [...s.items, item] })),
  removeItem: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),
  updateQty: (id, qty) => set(s => ({ items: s.items.map(i => i.id === id ? { ...i, qty } : i) })),
  setNote: (note) => set({ note }),
  clear: () => set({ items: [], note: '' }),
}))

export const useMenuStore = create((set) => ({
  items: [...mockMenuItems],
  toggle86: (id) => set(s => ({ items: s.items.map(i => i.id === id ? { ...i, isAvailable: !i.isAvailable } : i) })),
}))
