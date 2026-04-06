import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { motion } from 'framer-motion'
import { playBeep } from '../../../utils/beep'
import { BottomNav } from '../components/BottomNav'

const STATUS_MAP = {
  pending: { step: 1 },
  cooking: { step: 2 },
  ready:   { step: 3 },
  served:  { step: 4 }
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
  const [elapsed, setElapsed] = useState({ min: 0, sec: 0 })

  useEffect(() => {
    let sub = null

    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .single()
        
      if (!error && data) {
        setOrder(data)
        
        sub = supabase.channel(`tracking_${orderId}`)
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}`
          }, (payload) => {
             setOrder(prev => ({ ...prev, ...payload.new }))
             playBeep()
          })
          .subscribe()
      }
      setLoading(false)
    }
    
    fetchOrder()
    
    return () => {
      if (sub) supabase.removeChannel(sub)
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

  // Live Timer (Countdown to ends_at)
  useEffect(() => {
    if (!order || order.status === 'ready' || order.status === 'served') return
    
    const updateTime = () => {
      // Countdown from ends_at
      const diff = new Date(order.ends_at || new Date(Date.now() + 25*60000)) - new Date()
      if (diff > 0) {
        setElapsed({
          min: Math.floor(diff / 60000),
          sec: Math.floor((diff % 60000) / 1000)
        })
      } else {
        setElapsed({ min: 0, sec: 0 })
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [order?.ends_at, order?.status])

  // Auto-redirect on served
  useEffect(() => {
    if (order?.status === 'served') {
      const t = setTimeout(() => {
        navigate(`/customer/pay/${orderId}`)
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [order?.status, orderId, navigate])

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

  const currentStep = STATUS_MAP[order?.status]?.step || 1

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
        
        {/* 2. GREEN STATUS BAR */}
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, margin: 16, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="current-step" style={{ width: 10, height: 10, background: '#22C55E', borderRadius: '50%' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#16A34A' }}>
              {order?.status === 'served' ? 'Enjoy your meal!' : 
               order?.status === 'ready' ? 'Your order is ready!' : 
               'Your order is being prepared'}
            </span>
          </div>
          <div style={{ background: '#DCFCE7', borderRadius: 999, padding: '2px 10px', color: '#16A34A', fontSize: 12, fontWeight: 500 }}>
            {(elapsed?.min ?? 0)}:{(elapsed?.sec ?? 0) < 10 ? '0'+(elapsed?.sec ?? 0) : (elapsed?.sec ?? 0)} elapsed
          </div>
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
                    src={item?.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&q=80'} 
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
                    <span style={{ background: '#EF4444', color: 'white', fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999 }}>Out of Stock</span>
                  ) : item?.status === 'cooking' ? (
                    <span className="material-symbols-outlined" style={{ color: '#F97316', fontSize: 20, animation: 'spin 2s linear infinite' }}>autorenew</span>
                  ) : (
                    <span className="material-symbols-outlined" style={{ color: '#22C55E', fontSize: 20 }}>check_circle</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. ADD MORE ITEMS BUTTON */}
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
