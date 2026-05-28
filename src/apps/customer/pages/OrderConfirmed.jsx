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
            colors: ['#1B2B4B', '#F97316', '#ffffff'],
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#1B2B4B] border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-[#1B2B4B] mb-2">Order Not Found</h1>
        <p className="text-gray-500 mb-8">We couldn't retrieve the details for this order.</p>
        <button 
          onClick={() => navigate('/menu/browse')}
          className="w-full max-w-[342px] bg-[#1B2B4B] text-white h-[52px] rounded-xl font-bold"
        >
          Back to Menu
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-6" style={{ maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      
      {/* 1. GREEN CHECKMARK CIRCLE */}
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
        className="relative flex justify-center items-center w-[90px] h-[90px] bg-[#DCFCE7] rounded-full mb-4 mt-8"
      >
        <svg 
          className={`w-[44px] h-[44px] text-[#22C55E] ${showCheck ? 'animate-checkmark' : 'opacity-0'}`} 
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
      <h1 className="text-[28px] font-[800] text-[#111827] text-center">Order Placed!</h1>

      {/* 3. SUBTITLE */}
      <p className="text-[14px] text-[#6B7280] text-center mb-5 mt-1">Your order is with the kitchen</p>

      {/* 4. ORDER NUMBER BOX */}
      <div className="bg-[#F3F4F6] rounded-[12px] px-6 py-[10px] mb-5">
        <span className="text-[18px] font-[700] text-[#1B2B4B] font-mono">
          ORDER #{order.id.substring(0, 8).toUpperCase()}
        </span>
      </div>

      {/* 5. ITEM LIST CARD */}
      <div className="w-full bg-white rounded-[16px] p-4 mb-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        {(() => {
          const orderItems = order.order_items || []
          const subtotal = orderItems.reduce((sum, item) =>
            sum + ((item.unit_price || 0) * (item.qty || 0)), 0)
          const tax = order.tax_amount || 0
          const total = order.total_amount || (subtotal + tax)
          return (
            <>
              {/* Item list */}
              <div style={{ width: '100%', marginBottom: '12px' }}>
                {orderItems.map((item, index) => (
                  <div key={index} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: '10px', paddingBottom: '10px',
                    borderBottom: '0.5px solid #F3F4F6'
                  }}>
                    <span style={{ fontSize: '14px', color: '#374151', fontWeight: '400' }}>
                      {item.name}
                      <span style={{ color: '#9CA3AF', fontSize: '13px' }}> x{item.qty}</span>
                    </span>
                    <span style={{ fontSize: '14px', color: '#D97706', fontWeight: '500' }}>
                      ₹{item.unit_price * item.qty}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bill breakdown */}
              <div style={{
                width: '100%', background: '#F9FAFB', borderRadius: '12px',
                padding: '12px 16px', marginBottom: '4px'
              }}>
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
                  borderTop: '0.5px solid #E5E7EB', paddingTop: '10px'
                }}>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#111827' }}>Total</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#D97706' }}>₹{total}</span>
                </div>
              </div>
            </>
          )
        })()}
      </div>

      {/* 6. GREEN TIMER BADGE */}
      <div className="bg-[#DCFCE7] rounded-full px-4 py-2 flex items-center gap-2 mb-6">
        <span style={{ fontSize: '15px' }}>🕐</span>
        <span className="text-[13px] font-[600] text-[#16A34A]">Ready in approximately 12 mins</span>
      </div>

      {/* 7. TRACK MY ORDER BUTTON */}
      <button 
        onClick={() => navigate(resolvedOrderId ? `/menu/track/${resolvedOrderId}` : '/menu/browse')}
        className="w-full bg-[#1B2B4B] text-white h-[52px] rounded-[14px] font-[700] text-[16px]"
      >
        Track My Order
      </button>

      {/* 8. BACK TO MENU */}
      <button 
        onClick={() => navigate('/menu/browse')}
        className="mt-[12px] bg-transparent text-[#6B7280] text-[14px] font-medium"
      >
        Back to Menu
      </button>

    </div>
  )
}
