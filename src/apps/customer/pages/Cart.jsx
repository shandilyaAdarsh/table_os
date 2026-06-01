import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../../../store/index'
import { supabase } from '../../../lib/supabase'
import { BottomNav } from '../components/BottomNav'
import { getTableNum } from '../utils/tableNum'
import { motion, AnimatePresence } from 'framer-motion'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'

export default function Cart() {
  const navigate = useNavigate()
  const cartItems = useCartStore(state => state.items || [])
  const addItem = useCartStore(state => state.addItem)
  const updateQty = useCartStore(state => state.updateQty)
  const clear = useCartStore(state => state.clear)

  const [isPlacing, setIsPlacing] = useState(false)

  const subtotal = cartItems.reduce((a, i) => a + ((i.unit_price || i.price || 0) * i.qty), 0)
  const grandTotal = subtotal // Direct total

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0 || isPlacing) return
    setIsPlacing(true)
    try {
      const tableNum = getTableNum()
      const guestSession = JSON.parse(localStorage.getItem('customerSession') || '{}')

      // Bypassing the RPC and inserting directly into the older schema
      const subtotal = cartItems.reduce((a, i) => a + ((i.unit_price || i.price || 0) * i.qty), 0)

      // 1. Insert into old orders table
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: TENANT_ID,
          table_num: tableNum,
          guest_name: guestSession.name || 'Guest',
          guest_count: guestSession.guestCount || 1,
          total_amount: subtotal,
          status: 'pending',
          is_new: true,
          note: ''
        })
        .select()
        .single()

      if (orderError) throw orderError

      const orderId = orderData.id

      // 2. Insert into old order_items table
      const itemsToInsert = cartItems.map(item => {
        // If the frontend fell back to mock data, item.id will be 'm1', etc.
        // This causes a UUID cast error in Postgres. If not a UUID, send null.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
        
        return {
          order_id: orderId,
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
      navigate(`/menu/confirmed/${orderId}`, { state: { orderId } })
    } catch (err) {
      console.error('[Cart] placeOrder failed:', err)
      alert('Could not place order. Please try again. ' + (err.message || ''))
    } finally {
      setIsPlacing(false)
    }
  }

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#F8FAFC', paddingBottom: 220, position: 'relative', boxSizing: 'border-box' }}>
      {/* Header Banner */}
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '16px 20px', 
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px) saturate(120%)',
        WebkitBackdropFilter: 'blur(16px) saturate(120%)',
        borderBottom: '1px solid rgba(241, 245, 249, 0.8)',
        position: 'sticky', top: 0, zIndex: 30
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18, color: '#D91A2A' }}>🍴</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#D91A2A', letterSpacing: '0.05em', fontFamily: 'Outfit, sans-serif' }}>GUSTO</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '4px 12px', borderRadius: 20, color: '#065F46', fontSize: 11, fontWeight: 800 }}>
            <span style={{ fontSize: 8, color: '#10B981', animation: 'pulse 1.5s infinite' }}>●</span> Live Sync
          </div>
        </div>
      </div>

      {/* Main Column */}
      <div style={{ padding: '20px' }}>
        {/* Section 1: You Your Items */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', color: '#FFFFFF', fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 10, boxShadow: '0 2px 6px rgba(217, 26, 42, 0.2)' }}>You</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>Your Items</span>
          </div>

          {cartItems.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ background: '#FFFFFF', border: '1px dashed #E2E8F0', borderRadius: 20, padding: '32px 20px', textAlign: 'center', color: '#64748B', fontSize: 13, fontWeight: 500 }}
            >
              Your basket is empty. Browse the menu to add items!
            </motion.div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AnimatePresence>
                {cartItems.map((item, idx) => (
                  <motion.div 
                    key={`${item.id}-${idx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    style={{ display: 'flex', gap: 12, background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 20, padding: 12, alignItems: 'center', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.015)' }}
                  >
                    <img src={item.image_url || `https://placehold.co/60x60?text=${item.name[0]}`} style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover', background: '#F1F5F9' }} alt={item.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{item.name}</h4>
                      {item.modifiers?.length > 0 && <p style={{ fontSize: 11, color: '#64748B', marginTop: 2, marginBottom: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontWeight: 500 }}>{item.modifiers.join(', ')}</p>}
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#D91A2A', display: 'inline-block', marginTop: 4 }}>₹{((item.unit_price || item.price || 0) * item.qty).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', padding: '4px 6px', borderRadius: 20, border: '1.5px solid #FEE2E2', boxShadow: '0 2px 8px rgba(217, 26, 42, 0.02)' }}>
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => updateQty(item.id, item.modifiers, item.qty - 1)} style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F172A', background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 800, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>−</motion.button>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#D91A2A', minWidth: 14, textAlign: 'center' }}>{item.qty}</span>
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => addItem({ ...item, qty: 1 })} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', fontSize: 14, fontWeight: 800, boxShadow: '0 2px 8px rgba(217, 26, 42, 0.2)' }}>+</motion.button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

      </div>

      {/* Place Order CTA Sticky Footer */}
      <div style={{ 
        position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)', 
        width: '100%', maxWidth: 430, 
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px) saturate(120%)',
        WebkitBackdropFilter: 'blur(16px) saturate(120%)',
        padding: '16px 20px calc(16px + env(safe-area-inset-bottom))', 
        borderTop: '1px solid rgba(241, 245, 249, 0.8)', 
        zIndex: 30, 
        boxSizing: 'border-box', 
        boxShadow: '0 -10px 30px rgba(15, 23, 42, 0.04)' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>₹{(grandTotal).toFixed(2)}</span>
        </div>
        <motion.button
          onClick={handlePlaceOrder}
          disabled={isPlacing || cartItems.length === 0}
          whileHover={cartItems.length > 0 ? { scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' } : {}}
          whileTap={cartItems.length > 0 ? { scale: 0.98 } : {}}
          style={{
            width: '100%', height: 50, background: cartItems.length > 0 ? 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)' : '#CBD5E1',
            color: '#FFFFFF', border: 'none', borderRadius: 24, fontSize: 15, fontWeight: 700,
            cursor: cartItems.length > 0 ? 'pointer' : 'not-allowed',
            boxShadow: cartItems.length > 0 ? '0 8px 24px rgba(217, 26, 42, 0.2)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {isPlacing ? 'Placing Order...' : 'Send Orders to Kitchen →'}
        </motion.button>
      </div>

      <BottomNav />
    </div>
  )
}
