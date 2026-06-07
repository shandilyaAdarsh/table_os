import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { menuItems } from '../../../mock/data'

// Mock Data
const DEMO_CART = [
  { ...menuItems.find(m => m.id === 'm5'), qty: 1, modifier: 'Medium Well', note: '' },
  { ...menuItems.find(m => m.id === 'm11'), qty: 2, modifier: '', note: 'Extra crispy please' },
]
const UPSELL = menuItems.filter(m => ['m13', 'm15'].includes(m.id))

export default function Cart() {
  const navigate = useNavigate()
  const [cart, setCart] = useState(DEMO_CART)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)

  const change = (id, delta) =>
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i).filter(i => i.qty > 0))

  const submitOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      // Import dependencies inline or they must be at the top
      // Assuming they are at the top, but we'll use dynamic imports if not
      const { fetchWithRuntime, submitMutation } = await import('../../../lib/apiClient');
      const { getQrSession } = await import('../utils/qrSession');
      
      const session = getQrSession();
      if (!session.tenantId || !session.tableId) {
        throw new Error('Missing session information. Please scan the QR code again.');
      }

      const items = cart.map(i => ({
        menu_item_id: i.id,
        quantity: i.qty,
        item_notes: i.note,
        // Map modifiers here if real data existed
      }));

      const res = await submitMutation('/api/v1/orders/direct', {
        mutation_id: 'create_direct_order',
        idempotency_key: crypto.randomUUID(),
        payload: {
          tableId: session.tableId,
          items
        }
      });

      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to place order.');
      }

      // Order created successfully
      setCart([]);
      navigate(`/menu/confirmed/${res.data.order.id}`);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred while placing your order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '430px', margin: '0 auto', minHeight: '100vh', background: '#E31E24', position: 'relative', display: 'flex', flexDirection: 'column', fontFamily: '"Plus Jakarta Sans", sans-serif', overflow: 'hidden' }}>
      
      {/* Dimmed Background Overlay mapping to prior screen */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.05)', opacity: 0.4 }}>
        {/* Faux header from menu beneath */}
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', opacity: 0.5 }}>
           <span className="material-symbols-outlined" style={{ color: 'white', cursor: 'pointer' }} onClick={() => navigate(-1)}>close</span>
           <span style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>Stitch Kitchen</span>
           <span className="material-symbols-outlined" style={{ color: 'white' }}>shopping_cart</span>
        </div>
      </div>

      {/* Main Sheet */}
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
        style={{ marginTop: 80, flex: 1, background: 'white', borderRadius: '32px 32px 0 0', width: '100%', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 -20px 60px rgba(0,0,0,0.4)', zIndex: 10 }}
      >
        
        {/* Drag Handle */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', paddingTop: 16, paddingBottom: 8 }}>
           <div style={{ width: 40, height: 4, background: '#E5E7EB', borderRadius: 2 }}></div>
        </div>

        {/* Header content */}
        <div style={{ padding: '8px 24px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
           <div>
             <h1 style={{ color: '#E31E24', fontWeight: 800, fontSize: 24, margin: 0, letterSpacing: '-0.02em' }}>Your Order</h1>
             <p style={{ color: '#6C757D', fontSize: 14, margin: '4px 0 0', fontWeight: 500 }}>{cart.reduce((a,c) => a+c.qty, 0)} items selected</p>
           </div>
           <button onClick={() => navigate(-1)} style={{ width: 36, height: 36, background: '#F3F4F6', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E31E24' }}>
             <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
           </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingBottom: 130 }}>
          
          {/* Item List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
            <AnimatePresence>
              {cart.map(item => (
                <motion.div key={item.id} layout exit={{ opacity: 0, scale: 0.95 }} style={{ display: 'flex', gap: 16, alignItems: 'start' }}>
                  
                  {/* Image */}
                  <div style={{ width: 72, height: 72, flexShrink: 0 }}>
                     <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                  </div>
                  
                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                      <div>
                        <p style={{ color: '#E31E24', fontWeight: 700, fontSize: 16, margin: 0, lineHeight: 1.2 }}>{item.name}</p>
                        <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.modifier || item.note}</p>
                      </div>
                      <p style={{ color: '#E31E24', fontWeight: 800, fontSize: 16, margin: 0 }}>₹{(item.price * item.qty).toLocaleString()}</p>
                    </div>

                    {/* Controls Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#F3F4F6', borderRadius: 10, padding: '2px' }}>
                        <button onClick={() => change(item.id, -1)} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E31E24', fontWeight: 800, fontSize: 18 }}>−</button>
                        <span style={{ width: 28, textAlign: 'center', color: '#E31E24', fontWeight: 700, fontSize: 14 }}>{item.qty}</span>
                        <button onClick={() => change(item.id, 1)} style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E31E24', fontWeight: 800, fontSize: 18 }}>+</button>
                      </div>
                      <button onClick={() => change(item.id, -item.qty)} style={{ background: 'transparent', border: 'none', color: '#EF4444', padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                         <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div style={{ height: 1, background: '#F3F4F6', marginBottom: 32 }}></div>

          {/* Upsell */}
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ color: '#9CA3AF', fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>Often ordered with</h3>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, margin: '0 -24px', paddingLeft: 24 }}>
              {UPSELL.map(item => (
                <div key={item.id} style={{ flexShrink: 0, width: 140 }}>
                  <img src={item.image} alt={item.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div style={{ background: '#F9FAFB', borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6C757D', fontSize: 14 }}>
               <span>Subtotal</span>
               <span style={{ fontWeight: 600, color: '#E31E24' }}>₹{subtotal.toLocaleString()}</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6C757D', fontSize: 14 }}>
               <span>Taxes</span>
               <span style={{ fontWeight: 600, color: '#E31E24' }}>Calculated at checkout</span>
             </div>
             <div style={{ height: 1, background: '#E5E7EB', margin: '4px 0' }}></div>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#E31E24', fontWeight: 800, fontSize: 18 }}>Estimated Total</span>
                <span style={{ color: '#E31E24', fontWeight: 900, fontSize: 24 }}>₹{subtotal.toLocaleString()}</span>
             </div>
          </div>

        </div>

        {/* Place Order CTA Sticky Footer */}
        <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'white', padding: '20px 24px 40px', boxSizing: 'border-box', borderTop: '1px solid #F3F4F6' }}>
           {errorMsg && (
             <div style={{ padding: '8px 12px', background: '#FEE2E2', color: '#EF4444', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600, textAlign: 'center' }}>
               {errorMsg}
             </div>
           )}
           <button
             disabled={submitting}
             onClick={submitOrder}
             style={{ 
               width: '100%', background: submitting ? '#FCA5A5' : '#E31E24', color: 'white', 
               padding: '18px 0', borderRadius: 16, border: 'none', 
               fontWeight: 700, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer', 
               boxShadow: '0 10px 30px rgba(27,43,75,0.2)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
             }}
           >
             {submitting ? 'Placing Order...' : 'Confirm Order'}
             {!submitting && <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>}
           </button>
        </div>

      </motion.div>
    </div>
  )
}
