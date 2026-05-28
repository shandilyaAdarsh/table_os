import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { fetchWithRuntime, submitMutation } from '../../../lib/apiClient'
import { runtime } from '../../../runtime'
import { SupabaseTransportAdapter } from '../../../runtime/transport/SupabaseTransportAdapter'
import { supabase } from '../../../lib/supabase'
import { motion } from 'framer-motion'
import { playBeep } from '../../../utils/beep'
import { BottomNav } from '../components/BottomNav'
import { getTableNum } from '../utils/tableNum'

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
  const location = useLocation()
  const resolvedOrderId = orderId || location?.state?.orderId
  
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orderStatus, setOrderStatus] = useState('pending')
  const [localElapsed, setLocalElapsed] = useState(0)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)

  useEffect(() => {
    if (!resolvedOrderId) return

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
    cooking:  { text: '🍳 Preparing',   color: '#1A365D', bg: '#EFF6FF' },
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
    <div style={{ minHeight: '100vh', background: '#F8F8F8', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', position: 'relative', margin: '0 auto', maxWidth: '430px' }}>
      
      {/* 1. HEADER ROW */}
      <header style={{ position: 'sticky', top: 0, background: 'white', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20, width: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <button onClick={() => navigate('/menu/browse')} style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ color: '#1B2B4B' }}>arrow_back</span>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#1B2B4B', margin: 0 }}>Order #{(order?.id || '').substring(0, 8).toUpperCase()}</h1>
          <span style={{ fontSize: 12, color: '#6B7280' }}>Table {order?.table_num}</span>
        </div>
        <button onClick={() => navigate('/menu/browse')} style={{ width: 40, height: 40, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            {order?.order_items?.map(item => {
              const itemSt = getItemStatus(item)
              const cfg = statusConfig[itemSt]
              return (
                <div key={item?.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img 
                      src={item?.menu_items?.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80'} 
                      alt={item?.name}
                      style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover' }}
                      onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{
                        fontSize: 14, fontWeight: 600,
                        textDecoration: item?.is_rejected ? 'line-through' : 'none',
                        color: item?.is_rejected ? '#9CA3AF' : '#111827'
                      }}>{item?.name}</span>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>Qty: {item?.qty}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: '600',
                    color: cfg.color, background: cfg.bg,
                    padding: '3px 8px', borderRadius: '20px'
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
            borderRadius: '16px',
            border: '0.5px solid #E5E7EB',
            padding: '16px',
            margin: '0 16px 16px'
          }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '12px' }}>
              Bill Summary
            </p>

            {/* Item breakdown */}
            {orderItemsList.filter(item => !item.is_rejected).map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#374151', maxWidth: '65%' }}>
                  {item.name}
                  <span style={{ color: '#9CA3AF', marginLeft: '4px' }}>×{item.qty}</span>
                </span>
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                  ₹{(item.unit_price || 0) * (item.qty || 0)}
                </span>
              </div>
            ))}

            <div style={{ height: '1px', background: '#F3F4F6', margin: '8px 0 10px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Subtotal</span>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>₹{subtotal}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Taxes</span>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>₹{tax}</span>
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
            onClick={() => navigate('/menu/browse')}
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
          <div style={{
            width: '80px', height: '80px',
            background: '#F0FDF4',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '36px',
            marginBottom: '20px'
          }}>✅</div>

          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '0 0 8px' }}>
            Thank you for dining with us!
          </h2>

          <p style={{ fontSize: '14px', color: '#6B7280', margin: '0 0 32px', lineHeight: 1.6 }}>
            We hope you enjoyed your meal.<br/>
            Come back and visit us again soon 🙏
          </p>

          <button
            onClick={() => navigate('/menu/browse')}
            style={{
              width: '100%',
              background: '#1A365D',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              padding: '15px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '12px'
            }}
          >
            Back to Menu
          </button>

          <button
            onClick={() => navigate('/menu/orders')}
            style={{
              width: '100%',
              background: 'white',
              color: '#1A365D',
              border: '1.5px solid #1A365D',
              borderRadius: '14px',
              padding: '14px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            View Order History
          </button>
        </div>
      )}
    </div>
  )
}
