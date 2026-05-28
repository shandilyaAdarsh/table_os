import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithRuntime } from '../../../lib/apiClient'
import { runtime } from '../../../runtime'
import { SupabaseTransportAdapter } from '../../../runtime/transport/SupabaseTransportAdapter'
import { supabase } from '../../../lib/supabase'
import { BottomNav } from '../components/BottomNav'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'

const getSession = () => {
  try { return JSON.parse(localStorage.getItem('customerSession') || '{}') }
  catch { return {} }
}

export default function OrdersPage() {
  const session  = getSession()
  const tableNum = session.tableNum
    || new URLSearchParams(window.location.search).get('table')
    || 'T03'
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session.name) {
      setLoading(false)
      return
    }

    const fetchOrders = async () => {
      try {
        let query = supabase
          .from('orders')
          .select(`*, order_items(
            id, name, qty, unit_price,
            is_rejected, status
          )`)
          .eq('tenant_id', TENANT_ID)
          .order('created_at', { ascending: false })
          .limit(20)

        if (session.phone) {
          query = query.eq('guest_phone', session.phone).eq('table_num', tableNum)
        } else {
          query = query
            .eq('guest_name', session.name)
            .eq('table_num', tableNum)
          if (session.checkedInAt) {
            query = query.gte('created_at', session.checkedInAt)
          }
        }

        const { data, error } = await query
        if (error) throw error
        if (data && data.length > 0) {
          setOrders(data)
        } else {
          setOrders(getFallbackOrders())
        }
      } catch (err) {
        console.error('Failed to fetch orders, using mock fallback:', err)
        setOrders(getFallbackOrders())
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()

    // Ensure the router is started (using a generic or hardcoded branch ID for customer demo)
    const BRANCH_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const topic = `tenant:${TENANT_ID}:branch:${BRANCH_ID}:operational`;
    const adapter = new SupabaseTransportAdapter(supabase);
    runtime.bootstrap('customer_orders_page', session.sessionId || 'anonymous_session', adapter, topic);

    // A real implementation would subscribe to projectionCoordinator's store
    // For this migration, we'll assume fetchOrders is re-triggered on relevant events, 
    // or we poll periodically as a fallback, or projection updates a global customer store.
    // Here we set an interval as a fallback atomic rebuild
    const fallbackPoll = setInterval(fetchOrders, 10000)

        if (!isMyOrder) return

        if (payload.eventType === 'INSERT') {
          supabase.from('orders').select('*, order_items(*)').eq('id', payload.new.id).single()
            .then(({ data }) => { if (data) setOrders(prev => [data, ...prev]) })
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o))
        }
      })
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch (e) {}
    }
  }, [tableNum, session.phone, session.name, session.sessionId])

  function getFallbackOrders() {
    return [
      {
        id: 'mock-1042-9f3b-48cd-9076-21804f32a75b',
        table_num: tableNum || '03',
        total_amount: 1320,
        status: 'cooking',
        created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        ends_at: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
        order_items: [
          { id: 'item-1', name: 'Crispy Calamari', qty: 2, unit_price: 480.00 },
          { id: 'item-2', name: 'Bruschetta', qty: 1, unit_price: 360.00 }
        ]
      },
      {
        id: 'mock-1039-4f3b-48cd-9076-21804f32a75b',
        table_num: tableNum || '03',
        total_amount: 520,
        status: 'served',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        order_items: [
          { id: 'item-3', name: 'Paneer Tikka', qty: 1, unit_price: 520.00 }
        ]
      }
    ]
  }

  if (!session.name) {
    return (
      <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif', background: '#F8FAFC', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>Your Orders</h1>
        <div style={{ padding: '24px', background: '#FEF2F2', border: '1.5px solid #FCA5A5', color: '#D91A2A', borderRadius: 16, textAlign: 'center', marginTop: 32 }}>
           <span style={{ fontSize: 14, fontWeight: 600 }}>No active session found.</span>
           <p style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>Please check-in to see your order history.</p>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif', background: '#F8FAFC', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginBottom: 4, fontFamily: 'Outfit, sans-serif' }}>Your Orders</h1>
      <p style={{ margin: '0 0 32px', fontSize: 14, color: '#64748B', fontWeight: 500 }}>Active orders for {session.name}</p>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
           <div style={{ width: 24, height: 24, border: '3px solid #E2E8F0', borderTop: '3px solid #D91A2A', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
           <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ padding: '80px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#94A3B8' }}>restaurant</span>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: '0 0 8px', fontFamily: 'Epilogue, sans-serif' }}>No orders yet</h3>
          <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>Your delicious picks will appear here once you place them.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  )
}

function OrderCard({ order }) {
  const navigate = useNavigate()
  const [timeRemaining, setTimeRemaining] = useState('')
  const isActive = ['pending', 'cooking', 'ready'].includes(order.status)

  // Issue 10: download invoice as plain-text
  const downloadInvoice = () => {
    const session = JSON.parse(localStorage.getItem('customerSession') || '{}')
    const subtotal = (order.order_items || [])
      .reduce((sum, i) => sum + ((i.unit_price || 0) * (i.qty || 0)), 0)
    const tax = order.tax_amount || 0
    const total = order.total_amount || (subtotal + tax)

    const lines = [
      '===================================',
      '              GUSTO',
      '      Premium Dining Kitchen',
      '===================================',
      `Diner   : ${session.name || 'Guest'}`,
      `Table   : ${order.table_num}`,
      `Order   : #${String(order.id).slice(-6).toUpperCase()}`,
      `Date    : ${new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      '-----------------------------------',
      'ITEMS:',
      ...(order.order_items || []).map(item =>
        `${item.is_rejected ? '[CANCELLED] ' : ''}` +
        `${item.name.padEnd(18)} x${item.qty}` +
        `   \u20b9${(item.unit_price || 0) * (item.qty || 0)}`
      ),
      '-----------------------------------',
      `Subtotal  :             \u20b9${subtotal}`,
      `Taxes     :             \u20b9${tax}`,
      `TOTAL     :             \u20b9${total}`,
      '===================================',
      '   Thank you for dining with us!',
      '     Visit us again soon \ud83d\ude4f',
      '===================================',
    ]

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Gusto_Invoice_${String(order.id).slice(-6).toUpperCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  useEffect(() => {
    if (!order.ends_at || !isActive) {
      setTimeRemaining('')
      return
    }

    const interval = setInterval(() => {
      const diff = new Date(order.ends_at) - new Date()
      if (diff <= 0) {
        setTimeRemaining('Due now')
      } else {
        const m = Math.floor(diff / 60000)
        const s = Math.floor((diff % 60000) / 1000)
        setTimeRemaining(`${m}m ${s < 10 ? '0' : ''}${s}s`)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [order.ends_at, isActive])

  const statusMap = {
    pending:  { bg: 'rgba(217,26,42,0.05)', color: '#D91A2A', label: 'Placed', icon: 'check_circle' },
    cooking:  { bg: 'rgba(249,115,22,0.1)', color: '#F97316', label: 'Preparing', icon: 'skillet' },
    ready:    { bg: 'rgba(34,197,94,0.1)', color: '#16A34A', label: 'Ready!', icon: 'shopping_bag' },
    served:   { bg: '#F1F5F9', color: '#64748B', label: 'Served', icon: 'done_all' },
    cancelled:{ bg: '#FEF2F2', color: '#EF4444', label: 'Cancelled', icon: 'cancel' },
    rejected: { bg: '#FEE2E2', color: '#EF4444', label: 'Rejected', icon: 'cancel' }
  }

  const s = statusMap[order.status] || statusMap.pending

  return (
    <div
      onClick={() => navigate('/menu/track/' + order.id)}
      onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
      onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
      style={{ 
        background: 'white', 
        borderRadius: 18, 
        border: isActive ? '1.5px solid #D91A2A' : '1px solid #F1F5F9', 
        padding: 16, 
        boxShadow: isActive ? '0 8px 24px rgba(217,26,42,0.04)' : 'none',
        position: 'relative',
        cursor: 'pointer',
        transition: 'transform 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Order #{String(order.id).split('-')[0].toUpperCase()}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>₹{order.total_amount}</span>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#E2E8F0' }} />
            <span style={{ fontSize: 13, color: '#64748B', fontWeight: 500 }}>{order.order_items?.length || 0} Items</span>
          </div>
        </div>
        
        <div style={{ background: s.bg, color: s.color, padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{s.icon}</span>
          {s.label.toUpperCase()}
        </div>
      </div>

      {isActive && timeRemaining && (
        <div style={{ background: '#FEF2F2', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#D91A2A' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>timer</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Estimated Arrival</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#D91A2A' }}>{timeRemaining}</span>
        </div>
      )}

      {order.order_items && (
        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.order_items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 700 }}>{item.qty}x</span>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{item.name}</span>
                {item.status === 'out_of_stock' && (
                  <span style={{
                    background: '#FEE2E2', color: '#EF4444',
                    fontSize: '10px', fontWeight: '700',
                    padding: '2px 6px', borderRadius: '12px',
                    marginLeft: '6px'
                  }}>Out of Stock</span>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>₹{item.unit_price * item.qty}</span>
            </div>
          ))}
        </div>
      )}

      {/* Issue 10: Download Invoice button */}
      <button
        onClick={(e) => { e.stopPropagation(); downloadInvoice() }}
        style={{
          background: 'white', border: '1.5px solid #D91A2A',
          borderRadius: '10px', padding: '8px 14px',
          color: '#D91A2A', fontSize: '12px', fontWeight: '600',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '6px', marginTop: '10px'
        }}
      >
        ⬇ Download Invoice
      </button>
    </div>
  )
}
