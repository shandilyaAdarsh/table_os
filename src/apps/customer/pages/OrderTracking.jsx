import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { fetchWithRuntime, submitMutation } from '../../../lib/apiClient'
import { runtime } from '../../../runtime'
import { SupabaseTransportAdapter } from '../../../runtime/transport/SupabaseTransportAdapter'
import { supabase } from '../../../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { playBeep } from '../../../utils/beep'
import { BottomNav } from '../components/BottomNav'
import { getTableNum } from '../utils/tableNum'


const STEPS = [
  { step: 1, title: 'Order Received', subtitle: 'Kitchen has your order', icon: '📋' },
  { step: 2, title: 'Preparing', subtitle: 'Chef is cooking your food', icon: '👨‍🍳' },
  { step: 3, title: 'Ready!', subtitle: 'Your food is ready to be served', icon: '🔔' },
  { step: 4, title: 'Served', subtitle: 'Enjoy your meal!', icon: '✅' },
]

export default function OrderTracking() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const resolvedOrderId = orderId || location?.state?.orderId
  
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orderStatus, setOrderStatus] = useState('pending')
  const [localElapsed, setLocalElapsed] = useState(0)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)

  useEffect(() => {
    if (!resolvedOrderId) {
      setLoading(false)
      navigate('/menu/browse')
      return
    }

    const fetchOrder = async () => {
      try {
        const res = await fetchWithRuntime(`/api/v1/customer/orders/${resolvedOrderId}`)
        if (res.ok) {
          const { data } = await res.json()
          if (data) {
            setOrder(data)
            setOrderStatus(data.status || 'pending')
          }
        }
      } catch (err) {
        console.error('Error fetching tracking data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchOrder()

    // Bootstrap formal runtime infrastructure for realtime event routing
    const TENANT_ID = '11111111-1111-1111-1111-111111111111'
    const BRANCH_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const topic = `tenant:${TENANT_ID}:branch:${BRANCH_ID}:operational`;
    const adapter = new SupabaseTransportAdapter(supabase);
    runtime.bootstrap('customer_order_tracking', resolvedOrderId, adapter, topic);

    // Fallback polling — degraded mode recovery until projection store is wired
    const fallbackPoll = setInterval(fetchOrder, 10000)

    return () => {
      clearInterval(fallbackPoll)
      runtime.transport.suspend()
    }
  }, [resolvedOrderId])

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

  // No auto-redirect on served — show Thank You screen instead
  // Stop on rejected — no redirect

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        flexDirection: 'column',
        gap: '16px',
        background: '#F8FAFC',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid #D91A2A',
          borderTop: '3px solid transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <p style={{ color: '#64748B', fontSize: '14px', fontWeight: 600 }}>
          Loading your order...
        </p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: '#F8FAFC', fontFamily: 'Inter, sans-serif', padding: 24, textAlign: 'center' }}>
        <p style={{ color: '#64748B', fontSize: 16, fontWeight: 600 }}>Order not found.</p>
        <button onClick={() => navigate('/menu/browse')} style={{ background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', color: 'white', border: 'none', padding: '12px 28px', borderRadius: 24, fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Back to Menu</button>
      </div>
    );
  }

  const stepIndex = { pending: 1, cooking: 2, ready: 3, served: 4, rejected: -1, payment_pending: 2, paid: 3 }
  const currentStep = stepIndex[orderStatus] ?? 1

  // ETA calculation — item-count-based
  const orderItemsList = order?.order_items || []
  const itemCount = orderItemsList.length
  const baseMins = Math.min(8 + (itemCount - 1) * 4, 35)
  const etaSeconds = Math.max(0, (baseMins * 60) - localElapsed)
  const etaMinutes = Math.ceil(etaSeconds / 60)

  // Bill totals
  const subtotal = orderItemsList.reduce((sum, item) =>
    sum + ((item.unit_price || 0) * (item.qty || 0)), 0)
  const tax = order?.tax_amount || 0
  const total = order?.total_amount || (subtotal + tax)

  // Item status helpers (Issue 9)
  const getItemStatus = (item) => {
    if (item.is_rejected) return 'rejected'
    if (item.done) return 'done'
    if (item.status === 'accepted') return 'cooking'
    return 'pending'
  }

  const statusConfig = {
    rejected: { text: '✕ Not Prepared', color: '#EF4444', bg: '#FEF2F2' },
    done:     { text: '✓ Ready',        color: '#16A34A', bg: '#F0FDF4' },
    cooking:  { text: '🍳 Preparing',   color: '#0F2045', bg: '#EFF6FF' },
    pending:  { text: '⏳ Waiting',     color: '#D97706', bg: '#FFFBEB' },
  }

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
        description: `Order #${String(resolvedOrderId).slice(-6).toUpperCase()}`,
        image: 'https://i.imgur.com/n5tjHFD.png',
        handler: async (response) => {
          const paymentId = response.razorpay_payment_id

          await submitMutation('/api/v1/runtime/mutations', {
            mutation_id: 'process_payment',
            idempotency_key: crypto.randomUUID(),
            payload: {
              order_id: resolvedOrderId,
              table_num: order?.table_num || getTableNum(),
              tenant_id: '11111111-1111-1111-1111-111111111111',
              payment_id: paymentId
            }
          })

          setPaymentDone(true)
          setPaymentLoading(false)
        },
        prefill: {
          name: 'Guest',
          contact: '9999999999'
        },
        theme: {
          color: '#D91A2A'
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
      `Order: #${String(resolvedOrderId).slice(-6).toUpperCase()}`,
      `Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      '-----------------------------------',
      'ITEMS:',
      ...(order?.order_items || []).map(item =>
        `${(item.name || '').padEnd(20)} x${item.qty}   \u20b9${(item.unit_price || 0) * (item.qty || 0)}`
      ),
      '-----------------------------------',
      `Subtotal:              \u20b9${subtotal}`,
      `Taxes:                 \u20b9${tax}`,
      `TOTAL:                 \u20b9${total}`,
      '===================================',
      '     Thank you for dining with us!',
      '===================================',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Invoice_${String(resolvedOrderId).slice(-6).toUpperCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', position: 'relative', margin: '0 auto', maxWidth: '430px' }}>
      
      {/* 1. HEADER ROW */}
      <header style={{ 
        position: 'sticky', top: 0, 
        background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', 
        backdropFilter: 'blur(16px)', 
        WebkitBackdropFilter: 'blur(16px)', 
        padding: '16px', 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        zIndex: 20, width: '100%', 
        boxShadow: '0 4px 24px rgba(217, 26, 42, 0.15)', 
        borderBottom: '1px solid rgba(255,255,255,0.15)' 
      }}>
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/menu/browse')} 
          style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ color: '#FFFFFF', fontWeight: 900 }}>arrow_back</span>
        </motion.button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', margin: 0, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.01em' }}>Order #{(order?.id || '').substring(0, 8).toUpperCase()}</h1>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: 800 }}>Table {order?.table_num}</span>
        </div>
        <motion.button 
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/menu/browse')} 
          style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ color: '#FFFFFF', fontWeight: 900 }}>shopping_cart</span>
        </motion.button>
      </header>

      <main style={{ flex: 1, paddingBottom: 110 }}>
        
        {/* 2. STATUS BAR */}
        <div style={{
          background: orderStatus === 'rejected' ? '#FEF2F2' : '#F0FDF4',
          border: orderStatus === 'rejected' ? '1.5px solid #FECACA' : '1.5px solid #BBF7D0',
          borderRadius: 16, margin: 16, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.015)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, background: orderStatus === 'rejected' ? '#EF4444' : orderStatus === 'ready' ? '#22C55E' : '#F97316', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: orderStatus === 'rejected' ? '#DC2626' : '#16A34A' }}>
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
            <div style={{ background: '#DCFCE7', borderRadius: 999, padding: '3px 10px', color: '#16A34A', fontSize: 11, fontWeight: 700 }}>
              {orderStatus === 'ready' ? 'Ready! ✅'
               : orderStatus === 'cooking' && etaMinutes > 1 ? `~${etaMinutes} mins`
               : orderStatus === 'cooking' ? 'Almost ready! 🍳'
               : 'Waiting...'}
            </div>
          )}
        </div>

        {/* 3. RESTAURANT BANNER */}
        <div style={{ position: 'relative', height: 100, margin: '0 16px 16px', borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', boxShadow: '0 8px 24px rgba(217, 26, 42, 0.16)' }}>
          <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
            <h2 style={{ color: 'white', fontSize: 20, fontWeight: 900, margin: 0, fontFamily: 'Outfit, sans-serif', letterSpacing: '0.02em' }}>GUSTO</h2>
            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: '4px 0 0', fontWeight: 700 }}>Estimated arrival: 5-7 mins</p>
          </div>
        </div>

        {/* 4. VERTICAL STEPPER */}
        <div style={{ background: 'white', border: '1px solid #F1F5F9', borderRadius: 20, margin: '0 16px 16px', padding: 20, boxShadow: '0 8px 24px rgba(15,23,42,0.015)' }}>
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
                    <div style={{ zIndex: 10, background: 'white', padding: '2px 0' }}>
                      {isPast ? (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.2)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15, fontWeight: 900 }}>check</span>
                        </div>
                      ) : isCurrent ? (
                        <motion.div 
                          animate={{ scale: [0.95, 1.05, 0.95] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          style={{ 
                            width: 24, height: 24, borderRadius: '50%', 
                            border: '2px solid #D91A2A', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 0 4px rgba(217, 26, 42, 0.15)'
                          }}
                        >
                          <div style={{ width: 10, height: 10, background: '#D91A2A', borderRadius: '50%' }} />
                        </motion.div>
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #E2E8F0' }} />
                      )}
                    </div>
                    {/* Line */}
                    {!isLast && (
                      <div style={{ width: 2, flex: 1, minHeight: 36, background: isPast ? '#10B981' : '#E2E8F0', transition: 'background-color 0.5s' }} />
                    )}
                  </div>

                  <div style={{ paddingBottom: 24, paddingTop: 4, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3 style={{ fontSize: 14, margin: 0, color: isFuture ? '#94A3B8' : '#0F172A', fontWeight: isFuture ? 600 : 800, fontFamily: 'Outfit, sans-serif' }}>
                        {s.title}
                      </h3>
                      {isCurrent && (
                        <motion.span 
                          animate={{ opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          style={{ background: '#FEF2F2', color: '#D91A2A', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999 }}
                        >
                          IN PROGRESS
                        </motion.span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0', fontWeight: 500 }}>
                      {isPast ? 'Completed' : isCurrent ? 'Active now' : 'Waiting...'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 5. YOUR ITEMS CARD */}
        <div style={{ background: 'white', border: '1px solid #F1F5F9', borderRadius: 20, margin: '0 16px 16px', padding: 20, boxShadow: '0 8px 24px rgba(15,23,42,0.015)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: '0 0 16px', fontFamily: 'Outfit, sans-serif' }}>Your Items</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {order?.order_items?.map(item => {
              const itemSt = getItemStatus(item)
              const cfg = statusConfig[itemSt]
              return (
                <div key={item?.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img 
                      src={item?.menu_items?.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80'} 
                      alt={item?.name}
                      style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', background: '#F1F5F9' }}
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{
                        fontSize: 14, fontWeight: 700,
                        textDecoration: item?.is_rejected ? 'line-through' : 'none',
                        color: item?.is_rejected ? '#94A3B8' : '#0F172A'
                      }}>{item?.name}</span>
                      <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500, marginTop: 2 }}>Qty: {item?.qty}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: '800',
                    color: cfg.color, background: cfg.bg,
                    padding: '4px 10px', borderRadius: '20px',
                    border: `1px solid rgba(0,0,0,0.015)`
                  }}>{cfg.text}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 6. BILL SUMMARY + PAY BUTTON */}
        {(orderStatus === 'pending' || orderStatus === 'cooking' || orderStatus === 'ready') && (
          <div style={{
            background: 'white',
            border: '1px solid #F1F5F9',
            borderRadius: '20px',
            padding: '20px',
            margin: '0 16px 16px',
            boxShadow: '0 8px 24px rgba(15,23,42,0.015)'
          }}>
            <p style={{ fontSize: '16px', fontWeight: '800', color: '#0F172A', marginBottom: '14px', fontFamily: 'Outfit, sans-serif' }}>
              Bill Summary
            </p>

            {/* Item breakdown */}
            {orderItemsList.filter(item => !item.is_rejected).map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: '#64748B', maxWidth: '65%', fontWeight: 500 }}>
                  {item.name}
                  <span style={{ color: '#94A3B8', marginLeft: '6px', fontWeight: 600 }}>×{item.qty}</span>
                </span>
                <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>
                  ₹{((item.unit_price || 0) * (item.qty || 0)).toFixed(2)}
                </span>
              </div>
            ))}

            <div style={{ height: '1px', background: '#F1F5F9', margin: '10px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>Subtotal</span>
              <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>₹{subtotal.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 500 }}>GST (5%)</span>
              <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700 }}>₹{gst.toFixed(2)}</span>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: '1px dashed #E2E8F0',
              paddingTop: '12px', marginBottom: '18px'
            }}>
              <span style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>Total</span>
              <span style={{ fontSize: '16px', fontWeight: '800', color: '#D91A2A' }}>₹{total.toFixed(2)}</span>
            </div>

            {/* Pay button — shows when not yet paid */}
            {!paymentDone && (
              <motion.button
                onClick={handlePayment}
                disabled={paymentLoading}
                whileHover={{ scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: '100%',
                  background: paymentLoading ? '#CBD5E1' : 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)',
                  border: 'none',
                  borderRadius: '24px',
                  padding: '15px',
                  color: 'white',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: paymentLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                  boxShadow: paymentLoading ? 'none' : '0 8px 24px rgba(217, 26, 42, 0.2)',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                {paymentLoading ? 'Opening payment...' : `Pay ₹${total} Online`}
              </motion.button>
            )}

            {/* Payment success state */}
            {paymentDone && (
              <div style={{
                background: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: '16px',
                padding: '14px 16px',
                textAlign: 'center',
                marginBottom: '10px',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.05)'
              }}>
                <p style={{ fontSize: '15px', fontWeight: '800', color: '#16A34A', margin: 0 }}>
                  ✅ Payment Successful!
                </p>
                <p style={{ fontSize: '12px', color: '#4B5563', marginTop: '4px', fontWeight: 500 }}>
                  Thank you for dining with us 🙏
                </p>
              </div>
            )}

            {/* Download invoice — only after payment */}
            {paymentDone && (
              <motion.button
                onClick={handleDownloadInvoice}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  width: '100%',
                  background: 'white',
                  border: '1.5px solid #D91A2A',
                  borderRadius: '24px',
                  padding: '13px',
                  color: '#D91A2A',
                  fontSize: '14px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(217, 26, 42, 0.03)',
                  transition: 'all 0.2s'
                }}
              >
                ⬇ Download Invoice
              </motion.button>
            )}
          </div>
        )}

        {/* 7. ADD MORE ITEMS BUTTON */}
        <div style={{ padding: '0 16px', marginBottom: 8 }}>
          <motion.button 
            onClick={() => navigate('/menu/browse')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{ width: '100%', border: '1.5px solid #D91A2A', background: 'white', color: '#D91A2A', height: 48, borderRadius: 24, fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(217, 26, 42, 0.03)', transition: 'all 0.2s' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontWeight: 900 }}>add</span>
            Add more items
          </motion.button>
          <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 14, fontWeight: 500 }}>
            A server will bring your order to Table {order?.table_num}
          </p>
        </div>
      </main>

      {/* 7. BOTTOM NAV */}
      <BottomNav />

      {/* THANK YOU SCREEN — shown when order is served */}
      {orderStatus === 'served' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          minHeight: '100vh',
          background: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          textAlign: 'center',
          maxWidth: '430px',
          margin: '0 auto',
        }}>
          <motion.div 
            animate={{ scale: [0.92, 1.08, 0.92] }}
            transition={{ duration: 3, repeat: Infinity }}
            style={{
              width: '80px', height: '80px',
              background: '#F0FDF4',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
              marginBottom: '24px',
              boxShadow: '0 8px 24px rgba(22, 163, 74, 0.15)'
            }}
          >✅</motion.div>

          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0F172A', margin: '0 0 10px', fontFamily: 'Outfit, sans-serif' }}>
            Thank you for dining with us!
          </h2>

          <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 32px', lineHeight: 1.6, fontWeight: 500 }}>
            We hope you enjoyed your meal.<br/>
            Come back and visit us again soon 🙏
          </p>

          <motion.button
            onClick={() => navigate('/menu/browse')}
            whileHover={{ scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              padding: '15px',
              fontSize: '15px',
              fontWeight: '800',
              cursor: 'pointer',
              marginBottom: '12px',
              boxShadow: '0 8px 24px rgba(217, 26, 42, 0.2)'
            }}
          >
            Back to Menu
          </motion.button>

          <motion.button
            onClick={() => navigate('/menu/orders')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%',
              background: 'white',
              color: '#D91A2A',
              border: '1.5px solid #D91A2A',
              borderRadius: '24px',
              padding: '14px',
              fontSize: '15px',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(217, 26, 42, 0.03)',
              transition: 'all 0.2s'
            }}
          >
            View Order History
          </motion.button>
        </div>
      )}
    </div>
  )
}
