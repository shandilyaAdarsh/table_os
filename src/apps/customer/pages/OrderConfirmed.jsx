import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { fetchWithRuntime } from '../../../lib/apiClient'
import { motion } from 'framer-motion'

export default function OrderConfirmed() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const resolvedOrderId = orderId || location?.state?.orderId
  
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showCheck, setShowCheck] = useState(false)

  useEffect(() => {
    if (!resolvedOrderId) {
      navigate('/menu/browse')
      return
    }

    const fetchOrder = async () => {
      try {
        const res = await fetchWithRuntime(`/api/v1/customer/orders/${resolvedOrderId}`)
        if (!res.ok) throw new Error('Not found')
        const { data } = await res.json()
        if (!data) throw new Error('Not found')
        
        setOrder(data)
        
        // Trigger checkmark animation
        setTimeout(() => setShowCheck(true), 100)
        
        // Trigger confetti 700ms after checkmark starts
        setTimeout(() => {
          confetti({
            particleCount: 120,
            spread: 70,
            colors: ['#D91A2A', '#FF4D4D', '#ffffff'],
            origin: { y: 0.6 }
          })
        }, 800)

      } catch (err) {
        console.error(err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [resolvedOrderId])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: '#F8FAFC' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #D91A2A', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: 24, textAlign: 'center', background: '#F8FAFC' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>Order Not Found</h1>
        <p style={{ color: '#64748B', marginBottom: 32, fontSize: 14, fontWeight: 500 }}>We couldn't retrieve the details for this order.</p>
        <motion.button 
          onClick={() => navigate('/menu/browse')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ width: '100%', maxWidth: 342, background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', color: 'white', height: 52, borderRadius: 24, fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(217, 26, 42, 0.2)' }}
        >
          Back to Menu
        </motion.button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px', maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}>
      
      {/* 1. GREEN CHECKMARK CIRCLE */}
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
        style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', width: 90, height: 90, background: '#ECFDF5', borderRadius: '50%', marginBottom: 16, marginTop: 32, boxShadow: '0 8px 20px rgba(16, 185, 129, 0.08)', border: '1.5px solid #A7F3D0' }}
      >
        <svg 
          className={showCheck ? 'animate-checkmark' : 'opacity-0'} 
          style={{ width: 44, height: 44, color: '#10B981', transition: 'opacity 0.2s' }}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth="3.5"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            d="M5 13l4 4L19 7" 
            className="check-path"
          />
        </svg>
      </motion.div>

      <style>{`
        .check-path { stroke-dasharray: 50; stroke-dashoffset: 50; }
        .animate-checkmark .check-path { animation: drawCheck 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards; }
        @keyframes drawCheck { to { stroke-dashoffset: 0; } }
      `}</style>

      {/* 2. TITLE */}
      <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', textAlign: 'center', fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em', margin: 0 }}>Order Placed!</h1>

      {/* 3. SUBTITLE */}
      <p style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginBottom: 20, marginTop: 6, fontWeight: 500 }}>Your order is with the kitchen</p>

      {/* 4. ORDER NUMBER BOX */}
      <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '10px 24px', marginBottom: 20, boxShadow: '0 4px 16px rgba(15, 23, 42, 0.015)', border: '1px solid #F1F5F9' }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', fontFamily: 'Outfit, sans-serif', letterSpacing: '0.02em' }}>
          ORDER #{order.id.substring(0, 8).toUpperCase()}
        </span>
      </div>

      {/* 5. ITEM LIST CARD */}
      <div style={{ width: '100%', background: '#FFFFFF', border: '1px solid #F1F5F9', borderRadius: 20, padding: 16, marginBottom: 16, boxShadow: '0 8px 24px rgba(15,23,42,0.015)' }}>
        {(() => {
          const orderItems = order.order_items || []
          const subtotal = orderItems.reduce((sum, item) =>
            sum + ((item.unit_price || 0) * (item.qty || 0)), 0)
          const tax = order.tax_amount || 0
          const total = order.total_amount || (subtotal + tax)
          return (
            <>
              {/* Item list */}
              <div style={{ width: '100%', marginBottom: 12 }}>
                {orderItems.map((item, index) => (
                  <div key={index} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: 10, paddingBottom: 10,
                    borderBottom: '0.5px solid #F1F5F9'
                  }}>
                    <span style={{ fontSize: 14, color: '#0F172A', fontWeight: 600 }}>
                      {item.name}
                      <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 700 }}> x{item.qty}</span>
                    </span>
                    <span style={{ fontSize: 14, color: '#D91A2A', fontWeight: 800 }}>
                      ₹{(item.unit_price * item.qty).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bill breakdown */}
              <div style={{
                width: '100%', background: '#F8FAFC', borderRadius: 16,
                padding: '12px 16px', marginBottom: 4, border: '1px dashed #E2E8F0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>Subtotal</span>
                  <span style={{ fontSize: 13, color: '#0F172A', fontWeight: 700 }}>₹{subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>GST (5%)</span>
                  <span style={{ fontSize: 13, color: '#0F172A', fontWeight: 700 }}>₹{gst.toFixed(2)}</span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  borderTop: '0.5px solid #E2E8F0', paddingTop: 10
                }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>Total</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#D91A2A' }}>₹{total.toFixed(2)}</span>
                </div>
              </div>
            </>
          )
        })()}
      </div>

      {/* 6. GREEN TIMER BADGE */}
      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 24, padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, boxShadow: '0 4px 12px rgba(16,185,129,0.02)' }}>
        <span style={{ fontSize: 14 }}>🕐</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#10B981' }}>Ready in approximately 12 mins</span>
      </div>

      {/* 7. TRACK MY ORDER BUTTON */}
      <motion.button 
        onClick={() => navigate(resolvedOrderId ? `/menu/track/${resolvedOrderId}` : '/menu/browse')}
        whileHover={{ scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' }}
        whileTap={{ scale: 0.98 }}
        style={{ width: '100%', height: 50, border: 'none', background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', color: 'white', borderRadius: 24, fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 8px 24px rgba(217, 26, 42, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        Track My Order
      </motion.button>

      {/* 8. BACK TO MENU */}
      <motion.button 
        onClick={() => navigate('/menu/browse')}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        style={{ marginTop: 18, background: 'transparent', border: 'none', color: '#64748B', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >
        Back to Menu
      </motion.button>

    </div>
  )
}
