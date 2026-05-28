/**
 * CartDrawer.jsx — Bottom-sheet cart overlay
 * Ported from qr-restaurant-demo/src/components/CartDrawer.tsx
 * Adapted: Radix Sheet → modal div, Zustand shape adapted, Supabase placeOrder added
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore, useSessionStore } from '../../../store/index'
import { submitMutation } from '../../../lib/apiClient'
import { supabase } from '../../../lib/supabase'
import { AnimatePresence, motion } from 'framer-motion'
import { getTableNum } from '../utils/tableNum'

// Hardcoded — env vars are NOT reliably set on Vercel for this demo build
const TENANT_ID = import.meta.env.VITE_TENANT_ID || '11111111-1111-1111-1111-111111111111'
const TABLE_ID  = import.meta.env.VITE_DEMO_TABLE_ID || null


const UPSELL = [
  { id: 'm14', name: 'Garlic Naan x2',  price: 160, image_url: 'https://images.unsplash.com/photo-1601050638917-3606f5095b4e?w=200&q=80' },
  { id: 'm23', name: 'Fresh Lime Soda', price: 180, image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=200&q=80' },
  { id: 'm17', name: 'Masala Papad',    price: 80,  image_url: 'https://images.unsplash.com/photo-1626132644529-56e960c19cd2?w=200&q=80' },
]

export default function CartDrawer({ open, onClose }) {
  const navigate   = useNavigate()
  const cartItems  = useCartStore(s => s.items)
  const addItem    = useCartStore(s => s.addItem)
  const updateQty  = useCartStore(s => s.updateQty)
  const clear      = useCartStore(s => s.clear)
  const [isPlacing, setIsPlacing] = useState(false)
  const [note,      setNote]      = useState('')

  const subtotal   = cartItems.reduce((a, i) => a + ((i.unit_price || i.price || 0) * i.qty), 0)
  const totalQty   = cartItems.reduce((a, i) => a + i.qty, 0)

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // 5-tier table number resolver — survives React Router navigation dropping ?table=
  const resolveTableNum = () => {
    // Priority 1: Zustand session store
    const store = useSessionStore.getState()
    const fromStore = store.table_num || store.tableNum || store.currentTable
    if (fromStore && fromStore !== 'undefined' && fromStore !== 'null') return fromStore

    // Priority 2: Current URL
    const fromUrl = new URLSearchParams(window.location.search).get('table')
    if (fromUrl) return fromUrl

    // Priority 3: localStorage
    const fromLocal = localStorage.getItem('tableNum') || localStorage.getItem('table_num')
    if (fromLocal && fromLocal !== 'undefined' && fromLocal !== 'null') return fromLocal

    // Priority 4: sessionStorage
    const fromSession = sessionStorage.getItem('tableNum') || sessionStorage.getItem('table_num')
    if (fromSession && fromSession !== 'undefined' && fromSession !== 'null') return fromSession

    // Priority 5: Absolute demo fallback
    return 'T03'
  }

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0 || isPlacing) return
    setIsPlacing(true)
    try {
      const resolvedTableNum = resolveTableNum()
      console.log('[CartDrawer] resolvedTableNum:', resolvedTableNum)
      console.log('[CartDrawer] window.location.search:', window.location.search)
      console.log('[CartDrawer] localStorage tableNum:', localStorage.getItem('tableNum'))

      // Read guest session saved by CheckIn screen
      const guestSession = JSON.parse(localStorage.getItem('customerSession') || '{}')

      const { data: order, error } = await supabase.from('orders').insert({
        tenant_id: TENANT_ID,
        table_num: resolvedTableNum,
        note: note || `Order by ${guestSession.name || 'Guest'} · Party of ${guestSession.guestCount || 1}`,
      }).select().single()

      if (error) {
        throw error
      }

      const { error: itemsError } = await supabase.from('order_items').insert(
        cartItems.map(item => ({
          order_id:     order.id,
          name:         item.name,
          qty:          item.qty,
          unit_price:   item.unit_price || item.price || 0,
        }))
      )

      if (itemsError) {
        throw itemsError
      }

      const newOrderId = order.id
      clear()
      onClose()
      navigate(`/menu/confirmed/${newOrderId}`, { state: { orderId: newOrderId } })
    } catch (err) {
      console.error('[CartDrawer] placeOrder failed:', err.message)
      setIsPlacing(false)
      alert('Could not place order. Please try again.')
    } finally {
      setIsPlacing(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(27,43,75,0.4)', backdropFilter: 'blur(4px)' }}
          />

          <motion.div
            role="dialog"
            aria-label="Your Basket"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
              maxHeight: '92vh', display: 'flex', flexDirection: 'column',
              background: '#FFFFFF',
              borderRadius: '32px 32px 0 0',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 2, margin: '12px auto', flexShrink: 0 }} />

            <div style={{ padding: '4px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6' }}>
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 20, color: '#1B2B4B', margin: 0 }}>Your Basket</h2>
                <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>{totalQty} {totalQty === 1 ? 'item' : 'items'} selected</span>
              </div>
              <button onClick={onClose} style={{ border: 'none', background: '#F3F4F6', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#1B2B4B' }}>close</span>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0 20px' }}>
              {cartItems.length === 0 ? (
                <div style={{ padding: '60px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#9CA3AF' }}>shopping_basket</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#1B2B4B', margin: '0 0 8px' }}>Your basket is empty</h3>
                  <p style={{ fontSize: 14, color: '#6B7280', lineHeight: 1.5, margin: '0 0 24px' }}>Add some delicious items from the menu to place an order</p>
                  <button onClick={onClose} style={{ background: '#1B2B4B', color: 'white', border: 'none', borderRadius: 12, padding: '12px 32px', fontWeight: 700, cursor: 'pointer' }}>Browse Menu</button>
                </div>
              ) : (
                <>
                  <div style={{ padding: '0 20px' }}>
                    {cartItems.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} style={{ display: 'flex', gap: 14, padding: '16px 0', borderBottom: idx === cartItems.length - 1 ? 'none' : '1px solid #F3F4F6' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: '#F3F4F6', flexShrink: 0 }}>
                          <img src={item.image_url || `https://placehold.co/64x64?text=${item.name[0]}`} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontWeight: 700, fontSize: 15, color: '#1B2B4B', margin: '0 0 2px' }}>{item.name}</h4>
                          {item.modifiers?.length > 0 && (
                            <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 6px' }}>{item.modifiers.join(', ')}</p>
                          )}
                          <span style={{ fontWeight: 800, fontSize: 15, color: '#F97316' }}>₹{(item.unit_price || item.price || 0) * item.qty}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#F3F4F6', borderRadius: 10, height: 36, padding: '0 4px', alignSelf: 'center' }}>
                          <button onClick={() => updateQty(item.id, item.modifiers, item.qty - 1)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#1B2B4B', fontWeight: 800, cursor: 'pointer', fontSize: 18 }}>−</button>
                          <span style={{ width: 30, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#111827' }}>{item.qty}</span>
                          <button onClick={() => addItem({ ...item, qty: 1, unit_price: item.unit_price || item.price || 0 })} style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#1B2B4B', fontWeight: 800, cursor: 'pointer', fontSize: 18 }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ height: 8, background: '#F9FAFB', margin: '8px 0' }} />

                  <div style={{ padding: '16px 20px' }}>
                    <h5 style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Complete your meal</h5>
                    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                      {UPSELL.filter(u => !cartItems.find(i => i.id === u.id)).map(rec => (
                        <div key={rec.id} style={{ width: 130, flexShrink: 0, background: 'white', border: '1px solid #F3F4F6', borderRadius: 14, padding: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                          <img src={rec.image_url} alt={rec.name} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 8 }} />
                          <p style={{ fontWeight: 700, fontSize: 12, color: '#1B2B4B', margin: '0 0 4px', lineHeight: 1.3, height: 32, overflow: 'hidden' }}>{rec.name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: '#F97316' }}>₹{rec.price}</span>
                            <button onClick={() => addItem({ ...rec, qty: 1, unit_price: rec.price, modifiers: [], note: '' })} style={{ width: 28, height: 28, borderRadius: 8, background: '#1B2B4B', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: '16px 20px' }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: '#1B2B4B', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>Special Instructions</label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="e.g. No salt, extra spicy..."
                      rows={2}
                      style={{ width: '100%', background: '#F9FAFB', border: '1.5px solid #F3F4F6', borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#1B2B4B', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ padding: '20px', margin: '0 20px', background: '#F9FAFB', borderRadius: 16, border: '1px dashed #E5E7EB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#6B7280', fontSize: 13 }}>Item Subtotal</span>
                      <span style={{ color: '#1B2B4B', fontWeight: 600, fontSize: 13 }}>₹{subtotal}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ color: '#6B7280', fontSize: 13 }}>Taxes</span>
                      <span style={{ color: '#1B2B4B', fontWeight: 600, fontSize: 13 }}>Calculated at checkout</span>
                    </div>
                    <div style={{ height: 1, background: '#E5E7EB', marginBottom: 12 }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#1B2B4B', fontWeight: 800, fontSize: 16 }}>Estimated Total</span>
                      <span style={{ color: '#F97316', fontWeight: 800, fontSize: 18 }}>₹{subtotal}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {cartItems.length > 0 && (
              <div style={{ padding: '16px 20px 24px', borderTop: '1px solid #F3F4F6' }}>
                <button
                  id="place-order-btn"
                  onClick={handlePlaceOrder}
                  disabled={isPlacing}
                  style={{
                    width: '100%', height: 56, background: isPlacing ? '#9CA3AF' : '#1B2B4B', color: 'white',
                    border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: isPlacing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, transition: 'all 0.2s'
                  }}
                >
                  {isPlacing ? (
                    'Placing Order...'
                  ) : (
                    <>
                      <span>Place Order</span>
                      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
                      <span style={{ color: '#F97316' }}>Submit</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
