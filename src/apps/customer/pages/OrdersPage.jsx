import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithRuntime } from '../../../lib/apiClient'
import { runtime } from '../../../runtime'
import { SupabaseTransportAdapter } from '../../../runtime/transport/SupabaseTransportAdapter'
import { supabase } from '../../../lib/supabase'
import { BottomNav } from '../components/BottomNav'
import { getQrSession } from '../utils/qrSession'

const TENANT_ID = '11111111-1111-1111-1111-111111111111'

const getSession = () => {
  try { return JSON.parse(localStorage.getItem('customerSession') || '{}') }
  catch { return {} }
}

export default function OrdersPage() {
  const session  = getSession()
  const { tenantId, tableId } = getQrSession()
  const activeTenantId = tenantId || TENANT_ID
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorState, setErrorState] = useState(null)

  useEffect(() => {
    if (!session.name) {
      setLoading(false)
      return
    }

    const fetchOrders = async () => {
      try {
        let query = supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', activeTenantId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (tableId) {
          query = query.eq('table_id', tableId)
        }
        
        if (session.checkedInAt) {
          query = query.gte('created_at', session.checkedInAt)
        }

        const { data: fetchedOrders, error: ordersError } = await query
        if (ordersError) throw ordersError

        if (fetchedOrders && fetchedOrders.length > 0) {
          const orderIds = fetchedOrders.map(o => o.id)
          
          // Fetch order_items separately to bypass PGRST200 missing FK relation
          const { data: itemsData, error: itemsError } = await supabase
            .from('order_items')
            .select('id, order_id, name, qty, unit_price, is_rejected, status')
            .in('order_id', orderIds)

          if (itemsError) {
            console.warn('[OrdersPage] Failed to fetch order items (table may not exist or RLS blocked):', itemsError.message)
          }

          // Merge items into orders
          const itemsByOrderId = (itemsData || []).reduce((acc, item) => {
            acc[item.order_id] = acc[item.order_id] || []
            acc[item.order_id].push(item)
            return acc
          }, {})

          const mergedOrders = fetchedOrders.map(order => ({
            ...order,
            order_items: itemsByOrderId[order.id] || []
          }))

          setOrders(mergedOrders)
        } else {
          setOrders([])
        }
      } catch (err) {
        console.error('[OrdersPage] Runtime Failure:', err);
        setErrorState(err.message || 'Failed to load your orders.')
      } finally {
        setLoading(false);
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

    return () => {
      clearInterval(fallbackPoll)
      runtime.transport.suspend()
    }
  }, [tableId, activeTenantId, session.checkedInAt, session.name, session.sessionId])

  if (!session.name) {
    return (
      <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: '"Plus Jakarta Sans", sans-serif', background: 'white', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#E31E24', marginBottom: 8 }}>Your Orders</h1>
        <div style={{ padding: '24px', background: '#FEF2F2', border: '1.5px solid #F87171', color: '#991B1B', borderRadius: 16, textAlign: 'center', marginTop: 32 }}>
           <span style={{ fontSize: 14, fontWeight: 600 }}>No active session found.</span>
           <p style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>Please check-in to see your order history.</p>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: '"Plus Jakarta Sans", sans-serif', background: 'white', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#E31E24', marginBottom: 4 }}>Your Orders</h1>
      <p style={{ margin: '0 0 32px', fontSize: 14, color: '#6C757D', fontWeight: 500 }}>Active orders for {session.name}</p>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
           <div style={{ width: 24, height: 24, border: '3px solid #F3F4F6', borderTop: '3px solid #E31E24', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
           <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : null}

      {errorState && (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
          <div className="bg-white p-4 shadow-sm mb-6 flex justify-between items-center sticky top-0 z-10">
            <h1 className="text-xl font-bold tracking-tight text-red-600">Sync Error</h1>
          </div>
          <div className="flex flex-col items-center justify-center p-8 mt-12 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">We couldn't load your orders</h3>
            <p className="text-gray-500 mb-6 text-sm">
              {errorState}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-black text-white px-6 py-3 rounded-xl font-medium w-full shadow active:scale-95 transition-transform"
            >
              Try Again
            </button>
          </div>
          <BottomNav active="orders" />
        </div>
      )}

      {!errorState && !loading && orders.length === 0 && (
        <div style={{ padding: '80px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#9CA3AF' }}>restaurant</span>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: '#E31E24', margin: '0 0 8px' }}>No orders yet</h3>
          <p style={{ fontSize: 14, color: '#6C757D', lineHeight: 1.5 }}>Your delicious picks will appear here once you place them.</p>
        </div>
      )}

      {!errorState && !loading && orders.length > 0 && (
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
      '        THE GRAND SPICE',
      '      A Rooftop Kitchen, Mumbai',
      '===================================',
      `Diner   : ${session.name || 'Guest'}`,
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
    a.download = `GrandSpice_Invoice_${String(order.id).slice(-6).toUpperCase()}.txt`
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
    pending:  { bg: 'rgba(27,43,75,0.05)', color: '#E31E24', label: 'Placed', icon: 'check_circle' },
    cooking:  { bg: 'rgba(249,115,22,0.1)', color: '#E31E24', label: 'Preparing', icon: 'skillet' },
    ready:    { bg: 'rgba(34,197,94,0.1)', color: '#16A34A', label: 'Ready!', icon: 'shopping_bag' },
    served:   { bg: '#F3F4F6', color: '#6C757D', label: 'Served', icon: 'done_all' },
    cancelled:{ bg: '#FEF2F2', color: '#EF4444', label: 'Cancelled', icon: 'cancel' },
    rejected: { bg: '#FEE2E2', color: '#EF4444', label: 'Rejected', icon: 'cancel' }
  }

  const s = statusMap[order.status] || statusMap.pending

  return (
    <div
      onClick={isActive ? () => navigate('/menu/track/' + order.id) : undefined}
      onTouchStart={isActive ? e => e.currentTarget.style.transform = 'scale(0.97)' : undefined}
      onTouchEnd={isActive ? e => e.currentTarget.style.transform = 'scale(1)' : undefined}
      style={{ 
        background: 'white', 
        borderRadius: 16, 
        border: isActive ? '1.5px solid #E31E24' : '1px solid #F3F4F6', 
        padding: 16, 
        boxShadow: isActive ? '0 8px 24px rgba(27,43,75,0.06)' : 'none',
        position: 'relative',
        cursor: isActive ? 'pointer' : 'default',
        transition: 'transform 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Order #{order.id.split('-')[0].toUpperCase()}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#E31E24' }}>₹{order.total_amount}</span>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#D1D5DB' }} />
            <span style={{ fontSize: 13, color: '#6C757D', fontWeight: 500 }}>{order.order_items?.length || 0} Items</span>
          </div>
        </div>
        
        <div style={{ background: s.bg, color: s.color, padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{s.icon}</span>
          {s.label.toUpperCase()}
        </div>
      </div>

      {isActive && timeRemaining && (
        <div style={{ background: '#FFF7ED', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E31E24' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>timer</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Estimated Arrival</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#E31E24' }}>{timeRemaining}</span>
        </div>
      )}

      {order.order_items && (
        <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.order_items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#E31E24', fontWeight: 700 }}>{item.qty}x</span>
                <span style={{ fontSize: 13, color: '#4B5563', fontWeight: 500 }}>{item.name}</span>
                {item.status === 'out_of_stock' && (
                  <span style={{
                    background: '#FEE2E2', color: '#EF4444',
                    fontSize: '10px', fontWeight: '700',
                    padding: '2px 6px', borderRadius: '12px',
                    marginLeft: '6px'
                  }}>Out of Stock</span>
                )}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E31E24' }}>₹{item.unit_price * item.qty}</span>
            </div>
          ))}
        </div>
      )}

      {/* Issue 10: Download Invoice button */}
      <button
        onClick={(e) => { e.stopPropagation(); downloadInvoice() }}
        style={{
          background: 'white', border: '1.5px solid #E31E24',
          borderRadius: '10px', padding: '8px 14px',
          color: '#E31E24', fontSize: '12px', fontWeight: '600',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '6px', marginTop: '10px'
        }}
      >
        ⬇ Download Invoice
      </button>
    </div>
  )
}
