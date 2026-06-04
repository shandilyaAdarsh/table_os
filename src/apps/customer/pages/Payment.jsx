import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchWithRuntime, submitMutation } from '../../../lib/apiClient'
import { getQrSession } from '../utils/qrSession'

export default function PaymentScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [method, setMethod] = useState('card')
  const [paying, setPaying] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const { tenantId, tableId } = getQrSession()
        const params = new URLSearchParams()
        if (tenantId) params.set('tenantId', tenantId)
        if (tableId) params.set('tableId', tableId)
        const res = await fetchWithRuntime(`/api/v1/customer/orders/${id}?${params.toString()}`)
        if (!res.ok) throw new Error('Order not found')
        const { data } = await res.json()
        if (!data) throw new Error('Order not found')
        setOrder(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()
  }, [id])

  const handlePay = async () => {
    setPaying(true)
    setErrorMsg('')
    
    setTimeout(async () => {
      try {
        await submitMutation('/api/v1/runtime/mutations', {
          mutation_id: 'process_payment',
          idempotency_key: crypto.randomUUID(),
          payload: {
            order_id: id,
            table_num: order?.table_num || 'T03',
            tenant_id: '11111111-1111-1111-1111-111111111111',
            payment_id: `cash_${Date.now()}`
          }
        })
        
        setSuccess(true)
        setTimeout(() => {
          navigate(`/menu/receipt/${id}`)
        }, 500)
      } catch (err) {
         setErrorMsg('Payment failed, try again')
         setPaying(false)
      }
    }, 1500)
  }

  if (loading) {
     return (
       <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
         <div style={{ width: 32, height: 32, border: '4px solid #E5E7EB', borderTop: '4px solid #E31E24', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
         <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
       </div>
     )
  }

  if (!order) {
     return (
       <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
         <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E31E24', marginBottom: 8 }}>Order not found</h1>
         <button onClick={() => navigate('/menu/browse')} style={{ marginTop: 16, padding: '12px 32px', background: '#E31E24', color: 'white', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Back to Menu</button>
       </div>
     )
  }

  const itemCount = order.order_items?.reduce((acc, item) => acc + item.qty, 0) || 0

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', flexDirection: 'column', fontFamily: '"Plus Jakarta Sans", sans-serif', position: 'relative', margin: '0 auto', paddingBottom: 110, maxWidth: '430px' }}>
      
      {/* HEADER */}
      <header style={{ sticky: 'top', background: '#E31E24', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 10, width: '100%', height: 64, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 800 }}>Table {order.table_num}</h1>
        <div style={{ width: 44, display: 'flex', justifyContent: 'flex-end' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: 0.6 }}>lock</span>
        </div>
      </header>

      {/* HERO AMOUNT BLOCK */}
      <div style={{ background: '#E31E24', padding: '12px 24px 64px', textAlign: 'center', color: 'white' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.6, display: 'block', marginBottom: 8 }}>Total Payable</span>
        <span style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.02em', display: 'block', marginBottom: 12 }}>₹{order.total_amount}</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
          <span>{itemCount} Items</span>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
          <span>Table {order.table_num}</span>
        </div>
      </div>

      <main style={{ flex: 1, padding: '0 20px', zIndex: 2 }}>
        
       {/* ORDER SUMMARY CARD */}
       <section style={{ background: 'white', borderRadius: 20, boxShadow: '0 10px 40px rgba(27,43,75,0.08)', padding: 20, marginTop: -32, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontWeight: 800, fontSize: 16, color: '#E31E24', margin: 0 }}>Order Summary</h2>
            <span className="material-symbols-outlined" style={{ color: '#9CA3AF' }}>receipt_long</span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {order.order_items?.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#F3F4F6', color: '#E31E24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                    {item.qty}
                  </div>
                  <span style={{ color: '#4B5563', fontWeight: 600 }}>{item.name}</span>
                </div>
                <span style={{ fontWeight: 700, color: '#E31E24' }}>₹{item.unit_price * item.qty}</span>
              </div>
            ))}
            
            <div style={{ height: 1, background: '#F3F4F6', margin: '8px 0' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#E31E24', fontSize: 16 }}>Grand Total</span>
              <span style={{ fontWeight: 900, color: '#E31E24', fontSize: 22 }}>₹{order.total_amount}</span>
            </div>
          </div>
       </section>

       {/* PAYMENT METHOD CARD */}
       <section style={{ background: 'white', borderRadius: 20, border: '1px solid #F3F4F6', marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 8px' }}>
            <h2 style={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choose Payment Method</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Card */}
            <div 
              onClick={() => setMethod('card')}
              style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: method === 'card' ? 'rgba(27,43,75,0.02)' : 'transparent' }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(27,43,75,0.05)', color: '#E31E24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined">credit_card</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#E31E24', fontSize: 15 }}>Credit / Debit Card</div>
                  <div style={{ fontSize: 12, color: '#6C757D' }}>Visa, Mastercard, RuPay</div>
                </div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${method === 'card' ? '#E31E24' : '#E5E7EB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {method === 'card' && <div style={{ width: 12, height: 12, background: '#E31E24', borderRadius: '50%' }} />}
              </div>
            </div>

            {/* UPI */}
            <div 
              onClick={() => setMethod('upi')}
              style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', background: method === 'upi' ? 'rgba(27,43,75,0.02)' : 'transparent' }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(22,163,74,0.05)', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined">account_balance_wallet</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#E31E24', fontSize: 15 }}>UPI Payment</div>
                  <div style={{ fontSize: 12, color: '#6C757D' }}>GPay, PhonePe, Paytm</div>
                </div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${method === 'upi' ? '#E31E24' : '#E5E7EB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {method === 'upi' && <div style={{ width: 12, height: 12, background: '#E31E24', borderRadius: '50%' }} />}
              </div>
            </div>

            {/* Cash */}
            <div 
              onClick={() => setMethod('cash')}
              style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', padding: '16px 20px', cursor: 'pointer', background: method === 'cash' ? 'rgba(27,43,75,0.02)' : 'transparent' }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(249,115,22,0.05)', color: '#E31E24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined">payments</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#E31E24', fontSize: 15 }}>Pay at Counter</div>
                  <div style={{ fontSize: 12, color: '#6C757D' }}>Settlement by staff</div>
                </div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${method === 'cash' ? '#E31E24' : '#E5E7EB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {method === 'cash' && <div style={{ width: 12, height: 12, background: '#E31E24', borderRadius: '50%' }} />}
              </div>
            </div>
          </div>
       </section>
      </main>

      {/* FIXED PAY BUTTON */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #F3F4F6', padding: '16px 20px 32px', zIndex: 100, display: 'flex', justifyContent: 'center' }}>
        <button 
          disabled={paying || success}
          onClick={handlePay}
          style={{
            width: '100%', maxWidth: 430, height: 60, background: success ? '#16A34A' : '#E31E24', color: 'white',
            border: 'none', borderRadius: 16, fontSize: 17, fontWeight: 700, cursor: (paying || success) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: paying ? 'center' : 'space-between', padding: '0 24px', transition: 'all 0.3s',
            boxShadow: '0 10px 30px rgba(27,43,75,0.2)'
          }}
        >
          {paying ? (
             <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
               <div style={{ width: 20, height: 20, border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
               <span>Securely Processing...</span>
             </div>
          ) : success ? (
             <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
               <span className="material-symbols-outlined">check_circle</span>
               <span>Payment Successful</span>
             </div>
          ) : (
             <>
               <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', opacity: 0.8 }}>Confirm Payment</span>
               <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                 <span style={{ fontSize: 14, opacity: 0.4 }}>|</span>
                 <span style={{ fontSize: 20, fontWeight: 900 }}>₹{order.total_amount}</span>
                 <span className="material-symbols-outlined">arrow_forward</span>
               </div>
             </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: '#EF4444', color: 'white', padding: '12px 24px', borderRadius: 12, fontWeight: 700, zIndex: 200, boxShadow: '0 4px 20px rgba(239,68,68,0.3)' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}

export function ReceiptScreen() {
  const { orderId } = useParams()
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', fontFamily: '"Plus Jakarta Sans", sans-serif', maxWidth: 430, margin: '0 auto' }}>
      
      <div style={{ width: 90, height: 90, background: '#DCFCE7', color: '#16A34A', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 10px 40px rgba(34,197,94,0.15)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 44, fontWeight: 900 }}>check</span>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#E31E24', marginBottom: 8 }}>Order Paid!</h1>
      <p style={{ fontSize: 15, color: '#6C757D', marginBottom: 32 }}>Your transaction was successful. Thank you for dining with us!</p>

      {orderId && (
        <div style={{ background: '#F3F4F6', color: '#E31E24', borderRadius: 999, padding: '8px 20px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 40 }}>
          Order Reference: {orderId.substring(0, 8).toUpperCase()}
        </div>
      )}

      <div style={{ width: '100%', marginBottom: 48 }}>
        <p style={{ fontWeight: 800, color: '#E31E24', marginBottom: 16, fontSize: 15 }}>How was your meals today?</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(star => (
            <span key={star} style={{ fontSize: 32, color: '#E5E7EB', cursor: 'pointer' }}>
              ★
            </span>
          ))}
        </div>
      </div>

      <button 
        onClick={() => navigate('/menu/browse')}
        style={{ width: '100%', py: 18, background: '#E31E24', color: 'white', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 30px rgba(27,43,75,0.2)' }}
      >
        Explore More
      </button>

    </div>
  )
}
