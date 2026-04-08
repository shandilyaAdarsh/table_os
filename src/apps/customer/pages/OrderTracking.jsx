import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { motion } from 'framer-motion'
import { playBeep } from '../../../utils/beep'
import { BottomNav } from '../components/BottomNav'

const STATUS_MAP = {
  pending:  { step: 1 },
  cooking:  { step: 2 },
  ready:    { step: 3 },
  served:   { step: 4 },
  rejected: { step: 1 }
}

const STEPS = [
  { step: 1, title: 'Order Received', subtitle: 'Kitchen has your order', icon: '📋' },
  { step: 2, title: 'Preparing', subtitle: 'Chef is cooking your food', icon: '👨‍🍳' },
  { step: 3, title: 'Ready!', subtitle: 'Your food is ready to be served', icon: '🔔' },
  { step: 4, title: 'Served', subtitle: 'Enjoy your meal!', icon: '✅' },
]

export default function OrderTracking() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orderStatus, setOrderStatus] = useState('pending')
  const [localElapsed, setLocalElapsed] = useState(0)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)

  useEffect(() => {
    if (!orderId) return

    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            menu_items (
              name,
              image_url,
              is_veg
            )
          )
        `)
        .eq('id', orderId)
        .single()
        
      if (!error && data) {
        setOrder(data)
        setOrderStatus(data.status || 'pending')
      }
      setLoading(false)
    }
    
    fetchOrder()

    const channel = supabase
      .channel('track-order-' + orderId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: 'id=eq.' + orderId
      }, (payload) => {
        setOrderStatus(payload.new.status)
        setOrder(prev => ({ ...prev, ...payload.new }))
        playBeep()
      })
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId])

  // Unlock audio on first tap (iOS requirement)
  useEffect(() => {
    const unlock = () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => window.removeEventListener('touchstart', unlock);
  }, []);

  // Live elapsed ticker — counts up from order.created_at
  useEffect(() => {
    if (!order?.created_at) return
    const start = new Date(order.created_at).getTime()
    const tick = () => {
      setLocalElapsed(Math.floor((Date.now() - start) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [order?.created_at])

  // Auto-redirect on served
  useEffect(() => {
    if (orderStatus === 'served') {
      const t = setTimeout(() => {
        navigate(`/customer/pay/${orderId}`)
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [orderStatus, orderId, navigate])

  // Stop on rejected — no redirect

  if (!order) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        flexDirection: 'column',
        gap: '16px',
        background: '#F8F8F8',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: '40px', height: '40px',
          border: '3px solid #F97316',
          borderTop: '3px solid transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <p style={{ color: '#6B7280', fontSize: '14px', fontWeight: 500 }}>
          Loading your order...
        </p>
      </div>
    );
  }

  const stepIndex = { pending: 1, cooking: 2, ready: 3, served: 4, rejected: -1, payment_pending: 2, paid: 3 }
  const currentStep = stepIndex[orderStatus] ?? 1

  // ETA calculation from localElapsed
  const etaSeconds = Math.max(0, 20 * 60 - localElapsed)
  const etaMinutes = Math.ceil(etaSeconds / 60)

  // Bill totals
  const subtotal = (order?.order_items || []).reduce((sum, item) =>
    sum + ((item.unit_price || 0) * (item.qty || 0)), 0)
  const gst = Math.round(subtotal * 0.05)
  const total = subtotal + gst

  // Load Razorpay SDK dynamically
  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true)
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  // Handle Razorpay online payment
  const handlePayment = async () => {
    try {
      setPaymentLoading(true)
      const loaded = await loadRazorpay()
      if (!loaded) {
        alert('Payment service failed to load. Please try again.')
        setPaymentLoading(false)
        return
      }

      const options = {
        key: 'rzp_test_Sb2Ab0QBXjj4KE',
        amount: total * 100,
        currency: 'INR',
        name: 'The Grand Spice',
        description: `Order #${String(orderId).slice(-6).toUpperCase()}`,
        image: 'https://i.imgur.com/n5tjHFD.png',
        handler: async (response) => {
          const paymentId = response.razorpay_payment_id

          await supabase
            .from('orders')
            .update({ status: 'paid' })
            .eq('id', orderId)

          await supabase
            .from('restaurant_tables')
            .update({ status: 'paid' })
            .eq('table_num', order?.table_num)
            .eq('tenant_id', '11111111-1111-1111-1111-111111111111')

          setPaymentDone(true)
          setPaymentLoading(false)
        },
        prefill: {
          name: 'Guest',
          contact: '9999999999'
        },
        theme: {
          color: '#D69E2E'
        },
        modal: {
          ondismiss: () => {
            setPaymentLoading(false)
          }
        }
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()
    } catch (err) {
      console.error('Payment error:', err)
      alert('Something went wrong. Please try again.')
      setPaymentLoading(false)
    }
  }

  // Download plain-text invoice
  const handleDownloadInvoice = () => {
    const lines = [
      '===================================',
      '       THE GRAND SPICE',
      '       A Rooftop Kitchen, Mumbai',
      '===================================',
      `Table: ${order?.table_num || 'T03'}`,
      `Order: #${String(orderId).slice(-6).toUpperCase()}`,
      `Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      '-----------------------------------',
      'ITEMS:',
      ...(order?.order_items || []).map(item =>
        `${(item.name || '').padEnd(20)} x${item.qty}   \u20b9${(item.unit_price || 0) * (item.qty || 0)}`
      ),
      '-----------------------------------',
      `Subtotal:              \u20b9${subtotal}`,
      `GST (5%):              \u20b9${gst}`,
      `TOTAL:                 \u20b9${total}`,
      '===================================',
      '     Thank you for dining with us!',
      '===================================',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Invoice_${String(orderId).slice(-6).toUpperCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F8', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', position: 'relative', margin: '0 auto', maxWidth: '430px' }}>
      
      {/* 1. HEADER ROW */}
      <header style={{ position: 'sticky', top: 0, background: 'white', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20, width: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <button onClick={() => navigate('/customer/browse')} style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ color: '#1B2B4B' }}>arrow_back</span>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#1B2B4B', margin: 0 }}>Order #{(order?.id || '').substring(0, 8).toUpperCase()}</h1>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Table {order?.table_num}</span>
        </div>
        <button onClick={() => navigate('/customer/browse')} style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ color: '#1B2B4B' }}>shopping_cart</span>
        </button>
      </header>

      <main style={{ flex: 1, paddingBottom: 96 }}>
        
        {/* 2. STATUS BAR */}
        <div style={{
          background: orderStatus === 'rejected' ? '#FEF2F2' : '#F0FDF4',
          border: orderStatus === 'rejected' ? '1px solid #FECACA' : '1px solid #BBF7D0',
          borderRadius: 12, margin: 16, padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, background: orderStatus === 'rejected' ? '#EF4444' : orderStatus === 'ready' ? '#22C55E' : '#F97316', borderRadius: '50%' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: orderStatus === 'rejected' ? '#DC2626' : '#16A34A' }}>
              {orderStatus === 'rejected' ? '✕ Order was rejected by kitchen'
               : orderStatus === 'served'  ? 'Enjoy your meal!'
               : orderStatus === 'paid'    ? 'Payment received ✅ Thank you!'
               : orderStatus === 'ready'   ? 'Your order is ready! ✅'
               : orderStatus === 'cooking' ? 'Kitchen is cooking your order 🍳'
               : orderStatus === 'payment_pending' ? 'Payment requested — waiter is on the way 🙏'
               : '🟡 Waiting for kitchen to confirm'}
            </span>
          </div>
          {orderStatus !== 'rejected' && orderStatus !== 'served' && (
            <div style={{ background: '#DCFCE7', borderRadius: 999, padding: '2px 10px', color: '#16A34A', fontSize: 12, fontWeight: 500 }}>
              {orderStatus === 'ready' ? 'Ready to serve! ✅'
               : orderStatus === 'cooking' && etaMinutes > 1 ? `~${etaMinutes} min remaining`
               : orderStatus === 'cooking' ? 'Almost ready! 🍳'
               : 'Waiting for kitchen...'}
            </div>
          )}
        </div>

        {/* 3. RESTAURANT BANNER */}
        <div style={{ position: 'relative', height: 100, margin: '0 16px 16px', borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg, #111D35, #1B2B4B)' }}>
          <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>The Grand Spice</h2>
            <p style={{ color: 'white', fontSize: 12, opacity: 0.6, margin: '4px 0 0' }}>Estimated arrival: 5-7 mins</p>
          </div>
        </div>

        {/* 4. VERTICAL STEPPER */}
        <div style={{ background: 'white', borderRadius: 16, margin: '0 16px 16px', padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {STEPS?.map((s, idx) => {
              const isPast = s.step < currentStep
              const isCurrent = s.step === currentStep
              const isFuture = s.step > currentStep
              const isLast = idx === STEPS?.length - 1

              return (
                <div key={idx} style={{ display: 'flex', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Circle Icon */}
                    <div style={{ zIndex: 10, background: 'white' }}>
                      {isPast ? (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                        </div>
                      ) : isCurrent ? (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #F97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="current-step" style={{ width: 12, height: 12, background: '#F97316', borderRadius: '50%' }} />
                        </div>
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #E5E7EB' }} />
                      )}
                    </div>
                    {/* Line */}
                    {!isLast && (
                      <div style={{ width: 2, flex: 1, background: isPast ? '#22C55E' : '#E5E7EB' }} />
                    )}
                  </div>

                  <div style={{ paddingBottom: 24, paddingTop: 4, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3 style={{ fontSize: 15, margin: 0, color: isFuture ? '#6B7280' : '#111827', fontWeight: isFuture ? 400 : 600 }}>
                        {s.title}
                      </h3>
                      {isCurrent && (
                        <span style={{ background: '#FFF4ED', color: '#F97316', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
                          IN PROGRESS
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>
                      {isPast ? 'Completed' : isCurrent ? 'Just now' : 'Waiting...'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 5. YOUR ITEMS CARD */}
        <div style={{ background: 'white', borderRadius: 16, margin: '0 16px 16px', padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>Your Items</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {order?.order_items?.map(item => (
              <div key={item?.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img 
                    src={item?.menu_items?.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80'} 
                    alt={item?.name}
                    style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }}
                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{item?.name}</span>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>Qty: {item?.qty}</span>
                  </div>
                </div>
                <div>
                  {item?.status === 'out_of_stock' ? (
                    <span style={{
                      background: '#FEE2E2',
                      color: '#EF4444',
                      fontSize: '11px',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '20px',
                      marginLeft: '8px'
                    }}>Out of Stock</span>
                  ) : item?.status === 'accepted' || item?.done === true ? (
                    <span style={{ color: '#22C55E', fontSize: '13px' }}>✅ Accepted</span>
                  ) : (
                    <span style={{ color: '#F97316', fontSize: '13px' }}>🔄 Preparing</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. BILL SUMMARY + PAY BUTTON */}
        {(orderStatus === 'pending' || orderStatus === 'cooking' || orderStatus === 'ready') && (
          <div style={{
            background: 'white',
            borderRadius: '16px',
            border: '0.5px solid #E5E7EB',
            padding: '16px',
            margin: '0 16px 16px'
          }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
              Bill Summary
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Subtotal</span>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>₹{subtotal}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>GST (5%)</span>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>₹{gst}</span>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: '0.5px solid #E5E7EB',
              paddingTop: '10px', marginBottom: '16px'
            }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>Total</span>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>₹{total}</span>
            </div>

            {/* Pay button — shows when not yet paid */}
            {!paymentDone && (
              <button
                onClick={handlePayment}
                disabled={paymentLoading}
                style={{
                  width: '100%',
                  background: paymentLoading ? '#9CA3AF' : '#D69E2E',
                  border: 'none',
                  borderRadius: '14px',
                  padding: '15px',
                  color: 'white',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: paymentLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '10px'
                }}
              >
                {paymentLoading ? 'Opening payment...' : `Pay ₹${total} Online`}
              </button>
            )}

            {/* Payment success state */}
            {paymentDone && (
              <div style={{
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                borderRadius: '12px',
                padding: '12px 16px',
                textAlign: 'center',
                marginBottom: '10px'
              }}>
                <p style={{ fontSize: '15px', fontWeight: '600', color: '#16A34A', margin: 0 }}>
                  ✅ Payment Successful!
                </p>
                <p style={{ fontSize: '12px', color: '#4B5563', marginTop: '4px' }}>
                  Thank you for dining with us 🙏
                </p>
              </div>
            )}

            {/* Download invoice — only after payment */}
            {paymentDone && (
              <button
                onClick={handleDownloadInvoice}
                style={{
                  width: '100%',
                  background: 'white',
                  border: '1.5px solid #1A365D',
                  borderRadius: '14px',
                  padding: '13px',
                  color: '#1A365D',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                ⬇ Download Invoice
              </button>
            )}
          </div>
        )}

        {/* 7. ADD MORE ITEMS BUTTON */}
        <div style={{ padding: '0 16px', marginBottom: 8 }}>
          <button 
            onClick={() => navigate('/customer/browse')}
            style={{ width: '100%', border: '1.5px solid #1B2B4B', background: 'white', color: '#1B2B4B', height: 48, borderRadius: 12, fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
            Add more items
          </button>
          <p style={{ fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 12 }}>
            A server will bring your order to Table {order?.table_num}
          </p>
        </div>
      </main>

      {/* 7. BOTTOM NAV */}
      <BottomNav />
    </div>
  )
}
