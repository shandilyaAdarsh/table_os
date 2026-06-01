/**
 * CartDrawer.jsx — Bottom-sheet cart overlay
 * Ported from qr-restaurant-demo/src/components/CartDrawer.tsx
 * Adapted: Radix Sheet → modal div, Zustand shape adapted, Supabase placeOrder added
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore, useSessionStore } from '../../../store/index'
import { AnimatePresence, motion } from 'framer-motion'
import { getTableNum } from '../utils/tableNum'
import { supabase } from '../../../lib/supabase'

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
  const [noteFocused, setNoteFocused] = useState(false)

  const subtotal   = cartItems.reduce((a, i) => a + ((i.unit_price || i.price || 0) * i.qty), 0)
  const totalQty   = cartItems.reduce((a, i) => a + i.qty, 0)
  const cgst       = subtotal * 0.025
  const sgst       = subtotal * 0.025
  const grandTotal = subtotal + cgst + sgst

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

      // 1. Insert into old orders table
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: TENANT_ID,
          table_num: resolvedTableNum,
          guest_name: guestSession.name || 'Guest',
          guest_count: guestSession.guestCount || 1,
          total_amount: Math.round(grandTotal),
          status: 'pending',
          is_new: true,
          note: note || ''
        })
        .select()
        .single()

      if (orderError) throw orderError

      const newOrderId = orderData.id

      // 2. Insert into old order_items table
      const itemsToInsert = cartItems.map(item => {
        // If the frontend fell back to mock data, item.id will be 'm1', etc.
        // This causes a UUID cast error in Postgres. If not a UUID, send null.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
        
        return {
          order_id: newOrderId,
          menu_item_id: isUuid ? item.id : null,
          name: item.name,
          qty: item.qty,
          unit_price: item.unit_price || item.price || 0,
          modifiers: item.modifiers || [],
          status: 'pending',
          is_rejected: false,
          done: false
        }
      })

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError

      clear()
      onClose()
      navigate(`/menu/confirmed/${newOrderId}`, { state: { orderId: newOrderId } })
    } catch (err) {
      console.error('[CartDrawer] placeOrder failed:', err)
      alert('Could not place order. Please try again. ' + (err.message || ''))
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
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
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
              maxWidth: 430, margin: '0 auto',
              maxHeight: '92vh', display: 'flex', flexDirection: 'column',
              background: '#FFFFFF',
              borderRadius: '32px 32px 0 0',
              boxShadow: '0 -12px 40px rgba(15, 23, 42, 0.08)',
              fontFamily: 'Inter, sans-serif'
            }}
          >
            <div style={{ background: '#FFFFFF', borderRadius: '32px 32px 0 0', paddingTop: 12, paddingBottom: 16, paddingLeft: 20, paddingRight: 20, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: 36, height: 4, background: '#CBD5E1', borderRadius: 2, margin: '0 auto 16px', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontWeight: 800, fontSize: 20, color: '#0F172A', margin: 0, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.01em' }}>Your Basket</h2>
                  <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>{totalQty} {totalQty === 1 ? 'item' : 'items'} selected</span>
                </div>
                <motion.button 
                  onClick={onClose} 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.02)', transition: 'all 0.2s' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#0F172A', fontWeight: 900 }}>close</span>
                </motion.button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0 20px' }}>
              {cartItems.length === 0 ? (
                <div style={{ padding: '60px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, border: '1.5px solid #F1F5F9' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#94A3B8' }}>shopping_basket</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: '0 0 8px', fontFamily: 'Outfit, sans-serif' }}>Your basket is empty</h3>
                  <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5, margin: '0 0 24px', fontWeight: 500 }}>Add some delicious items from the menu to place an order</p>
                  <motion.button 
                    onClick={onClose} 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{ background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', color: 'white', border: 'none', borderRadius: 24, padding: '12px 32px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 20px rgba(217, 26, 42, 0.22)' }}
                  >Browse Menu</motion.button>
                </div>
              ) : (
                <>
                  <div style={{ padding: '0 20px' }}>
                    {cartItems.map((item, idx) => (
                      <div key={`${item.id}-${idx}`} style={{ display: 'flex', gap: 14, padding: '16px 0', borderBottom: idx === cartItems.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', background: '#F1F5F9', flexShrink: 0 }}>
                          <img src={item.image_url || `https://placehold.co/64x64?text=${item.name[0]}`} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontWeight: 800, fontSize: 15, color: '#0F172A', margin: '0 0 2px', fontFamily: 'Outfit, sans-serif' }}>{item.name}</h4>
                          {item.modifiers?.length > 0 && (
                            <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 6px', fontWeight: 500 }}>{item.modifiers.join(', ')}</p>
                          )}
                           <span style={{ fontWeight: 800, fontSize: 15, color: '#D91A2A' }}>₹{((item.unit_price || item.price || 0) * item.qty).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#FEF2F2', borderRadius: 20, height: 36, padding: '0 6px', border: '1.5px solid #FCA5A5', alignSelf: 'center', boxShadow: '0 2px 8px rgba(217, 26, 42, 0.02)' }}>
                          <motion.button whileTap={{ scale: 0.85 }} onClick={() => updateQty(item.id, item.modifiers, item.qty - 1)} style={{ width: 24, height: 24, border: '1px solid #F1F5F9', background: '#FFFFFF', borderRadius: '50%', color: '#0F172A', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>−</motion.button>
                          <span style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#D91A2A' }}>{item.qty}</span>
                          <motion.button whileTap={{ scale: 0.85 }} onClick={() => addItem({ ...item, qty: 1, unit_price: item.unit_price || item.price || 0 })} style={{ width: 24, height: 24, border: 'none', background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', borderRadius: '50%', color: '#FFFFFF', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: '0 2px 8px rgba(217, 26, 42, 0.2)' }}>+</motion.button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ height: 8, background: '#F8FAFC', margin: '8px 0', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }} />

                  {/* Complete your meal suggestions */}
                  <div style={{ padding: '16px 20px' }}>
                    <h5 style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Complete your meal</h5>
                    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }} className="hide-scrollbar">
                      {UPSELL.filter(u => !cartItems.find(i => i.id === u.id)).map(rec => (
                        <motion.div 
                          key={rec.id} 
                          whileHover={{ y: -3 }}
                          style={{ width: 130, flexShrink: 0, background: 'white', border: '1px solid #F1F5F9', borderRadius: 16, padding: 10, boxShadow: '0 4px 18px rgba(15, 23, 42, 0.02)', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
                        >
                          <img src={rec.image_url} alt={rec.name} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 8 }} />
                          <p style={{ fontWeight: 800, fontSize: 12, color: '#0F172A', margin: '0 0 4px', lineHeight: 1.3, height: 32, overflow: 'hidden', fontFamily: 'Outfit, sans-serif' }}>{rec.name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: 13, color: '#D91A2A' }}>₹{rec.price}</span>
                            <motion.button 
                              onClick={() => addItem({ ...rec, qty: 1, unit_price: rec.price, modifiers: [], note: '' })} 
                              whileTap={{ scale: 0.9 }}
                              style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(217, 26, 42, 0.2)' }}
                            >+</motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: '16px 20px' }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>Special Instructions</label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      onFocus={() => setNoteFocused(true)}
                      onBlur={() => setNoteFocused(false)}
                      placeholder="e.g. No salt, extra spicy..."
                      rows={2}
                      style={{ 
                        width: '100%', 
                        background: '#FFFFFF', 
                        border: noteFocused ? '1.5px solid #D91A2A' : '1px solid #E2E8F0', 
                        borderRadius: 14, 
                        padding: '12px 16px', 
                        fontSize: 14, 
                        fontWeight: 500,
                        color: '#0F172A', 
                        resize: 'none', 
                        outline: 'none', 
                        boxSizing: 'border-box',
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        boxShadow: noteFocused ? '0 0 0 4px rgba(217, 26, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.02)' : 'none'
                      }}
                    />
                  </div>

                  <div style={{ padding: '20px', margin: '0 20px', background: '#F8FAFC', borderRadius: 20, border: '1.5px dashed #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#64748B', fontSize: 13, fontWeight: 500 }}>Item Subtotal</span>
                      <span style={{ color: '#0F172A', fontWeight: 700, fontSize: 13 }}>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ color: '#64748B', fontSize: 13, fontWeight: 500 }}>Taxes (5%)</span>
                      <span style={{ color: '#0F172A', fontWeight: 700, fontSize: 13 }}>₹{(cgst + sgst).toFixed(2)}</span>
                    </div>
                    <div style={{ height: 1, background: '#E2E8F0', marginBottom: 12 }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#0F172A', fontWeight: 800, fontSize: 16, fontFamily: 'Outfit, sans-serif' }}>To Pay</span>
                      <span style={{ color: '#D91A2A', fontWeight: 800, fontSize: 18 }}>₹{Math.round(grandTotal)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {cartItems.length > 0 && (
              <div style={{ padding: '16px 20px 24px', borderTop: '1px solid #F1F5F9' }}>
                <motion.button
                  id="place-order-btn"
                  onClick={handlePlaceOrder}
                  disabled={isPlacing}
                  whileHover={{ scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    width: '100%', height: 50, background: isPlacing ? '#CBD5E1' : 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', color: 'white',
                    border: 'none', borderRadius: 24, fontSize: 15, fontWeight: 700, cursor: isPlacing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', boxShadow: isPlacing ? 'none' : '0 8px 24px rgba(217, 26, 42, 0.2)'
                  }}
                >
                  {isPlacing ? (
                    'Placing Order...'
                  ) : (
                    <>
                      <span>Place Order</span>
                      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.25)' }} />
                      <span style={{ color: '#FFFFFF' }}>₹{Math.round(grandTotal)}</span>
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
