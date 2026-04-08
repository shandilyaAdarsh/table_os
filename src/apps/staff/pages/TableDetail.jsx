import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStaffStore } from '../../../store/index'

export default function TableDetail() {
  const { tableId } = useParams()
  const { staff_user } = useStaffStore()
  const navigate = useNavigate()

  const [table, setTable] = useState(null)
  const [orders, setOrders] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!staff_user) {
      navigate('/staff')
      return
    }

    const fetchData = async () => {
      const tenantId = '11111111-1111-1111-1111-111111111111'
      
      const [tRes, oRes, aRes] = await Promise.all([
        supabase.from('restaurant_tables').select('*').eq('id', tableId).single(),
        supabase.from('orders')
          .select('*, order_items(*, menu_items(name, price))')
          .eq('table_id', tableId)
          .eq('tenant_id', tenantId)
          .in('status', ['pending', 'cooking', 'ready'])
          .order('created_at', { ascending: true }),
        supabase.from('assistance_requests')
          .select('*')
          .eq('table_id', tableId)
          .eq('tenant_id', tenantId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
      ])

      setTable(tRes.data)
      setOrders(oRes.data || [])
      setRequests(aRes.data || [])
      setLoading(false)
    }

    fetchData()

    const channel = supabase.channel(`table_detail_${tableId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders', 
        filter: 'table_id=eq.' + tableId 
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
           supabase.from('orders')
             .select('*, order_items(*, menu_items(name, price))')
             .eq('id', payload.new.id)
             .single()
             .then(({ data }) => setOrders(prev => [...prev, data]))
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => {
            if (payload.new.status === 'served' || payload.new.status === 'cancelled' || payload.new.status === 'rejected') {
              return prev.filter(o => o.id !== payload.new.id)
            }
            return prev.find(o => o.id === payload.new.id)
              ? prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
              : [...prev, payload.new]
          })
        }
      })
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'assistance_requests', 
        filter: 'table_id=eq.' + tableId 
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setRequests(prev => [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setRequests(prev => {
            if (payload.new.status === 'resolved') return prev.filter(r => r.id !== payload.new.id)
            return prev.map(r => r.id === payload.new.id ? payload.new : r)
          })
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [tableId, staff_user, navigate])

  const resolveRequest = async (requestId) => {
    try {
      await supabase.from('assistance_requests').update({ status: 'resolved' }).eq('id', requestId)
    } catch (err) {
      console.error('Failed to resolve request', err)
    }
  }

  const toggleItemStatus = async (itemId, currentStatus) => {
    try {
      const isAccepted = currentStatus === 'accepted'
      const newStatus = isAccepted ? 'pending' : 'accepted'
      const newDone = !isAccepted
      
      await supabase
        .from('order_items')
        .update({ status: newStatus, done: newDone })
        .eq('id', itemId)

      setOrders(prev => prev.map(order => ({
        ...order,
        order_items: order.order_items?.map(item => 
          item.id === itemId ? { ...item, status: newStatus, done: newDone } : item
        )
      })))
    } catch (err) {
      console.error('Failed to toggle item status', err)
    }
  }

  const serveOrder = async (orderId) => {
    try {
      // Mark unticked items as out_of_stock
      await supabase
        .from('order_items')
        .update({ status: 'out_of_stock' })
        .eq('order_id', orderId)
        .eq('status', 'pending')

      await supabase.from('orders').update({ status: 'served' }).eq('id', orderId)
    } catch (err) {
      console.error('Failed to serve order', err)
    }
  }

  const handleCheckout = async () => {
    try {
      // 1. Resolve all pending requests
      if (requests.length > 0) {
        await supabase.from('assistance_requests')
          .update({ status: 'resolved' })
          .in('id', requests.map(r => r.id))
      }
      // 2. Mark all orders as served
      if (orders.length > 0) {
        await supabase.from('orders')
          .update({ status: 'served' })
          .in('id', orders.map(o => o.id))
      }
      navigate('/staff/tables')
    } catch (err) {
      console.error('Checkout failed', err)
    }
  }

  const acknowledgeRequest = async (requestId) => {
    try {
      await supabase.from('assistance_requests').update({ status: 'acknowledged' }).eq('id', requestId)
    } catch (err) {
      console.error('Failed to acknowledge request', err)
    }
  }

  if (loading) return <div style={{ background: '#0D1117', minHeight: '100vh' }} />

  return (
    <div style={{ minHeight: '100vh', background: '#0D1117', color: '#E6EDF3', fontFamily: 'Manrope, sans-serif', paddingBottom: 80 }}>
      {/* HEADER */}
      <header style={{ background: '#0D1117', padding: '16px 20px', borderBottom: '1px solid #30363D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            onClick={() => navigate('/staff/tables')}
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
          </button>
          <div>
            <h1 style={{ color: 'white', fontSize: 16, fontWeight: 700, margin: 0 }}>Table {table?.table_num}</h1>
            <p style={{ color: '#8B949E', fontSize: 12, margin: 0 }}>• SHIFT: 04:22:15</p>
          </div>
        </div>
        
        <button 
          onClick={handleCheckout}
          style={{ background: 'transparent', border: '1px solid #F85149', color: '#F85149', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          CLEAR TABLE
        </button>
      </header>

      {/* AUDIO ALERT BADGE */}
      <div style={{ padding: '12px 20px' }}>
        <div style={{ background: '#161B22', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EA043' }} />
          <span style={{ color: '#8B949E', fontSize: 12 }}>🔊 Audio Alerts Enabled</span>
        </div>
      </div>

      <main style={{ padding: '0 20px' }}>
        {/* ACTIVE REQUESTS */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ color: '#F85149', fontSize: 12, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            ACTIVE REQUESTS
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.length === 0 ? (
              <p style={{ color: '#8B949E', fontSize: 13, margin: 0 }}>No pending requests.</p>
            ) : (
              requests.map(req => (
                <div key={req.id} style={{ background: '#1C2128', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{req.request_type === 'drinks' ? '🍹' : req.request_type === 'bill' ? '💳' : '👋'}</span>
                    <div>
                      <p style={{ color: 'white', fontSize: 13, fontWeight: 700, margin: 0, textTransform: 'capitalize' }}>
                        {req.request_type.replace('_', ' ')}
                      </p>
                      <p style={{ color: '#8B949E', fontSize: 11, margin: 0 }}>2m ago</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {req.status !== 'acknowledged' && (
                       <button 
                        onClick={() => acknowledgeRequest(req.id)}
                        style={{ background: 'transparent', border: '1px solid #8B949E', color: '#8B949E', padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Acknowledge
                      </button>
                    )}
                    <button 
                      onClick={() => resolveRequest(req.id)}
                      style={{ background: '#2EA043', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ACTIVE ORDERS */}
        <section>
          <h2 style={{ color: '#8B949E', fontSize: 12, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            ACTIVE ORDERS
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orders.length === 0 ? (
              <p style={{ color: '#8B949E', fontSize: 13, margin: 0 }}>No active orders.</p>
            ) : (
              orders.map(order => (
                <div key={order.id} style={{ background: '#161B22', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ color: '#8B949E', fontSize: 12, fontWeight: 600 }}>ORDER #{order.id.split('-')[0].toUpperCase()}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {order.status === 'ready' ? (
                        <span style={{ color: '#2EA043', fontSize: 11, fontWeight: 800 }}>● READY</span>
                      ) : (
                        <span style={{ color: order.status === 'cooking' ? '#F0883E' : '#8B949E', fontSize: 11, fontWeight: 800 }}>
                          {order.status === 'cooking' ? 'PREPARING' : 'PREPARING'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    {order.order_items?.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button 
                            onClick={() => toggleItemStatus(item.id, item.status)}
                            style={{ 
                              width: 20, height: 20, borderRadius: '50%', padding: 0, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: item.status === 'accepted' ? '#2EA043' : 'transparent',
                              border: item.status === 'accepted' ? 'none' : '1px solid #8B949E'
                            }}
                          >
                            {item.status === 'accepted' && <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'white' }}>check</span>}
                          </button>
                          <div>
                            <p style={{ color: 'white', fontSize: 14, margin: 0 }}>{item.qty} × {item.name}</p>
                            {/* Assuming modifiers exist or based on item details */}
                            <p style={{ color: '#8B949E', fontSize: 12, margin: 0, fontStyle: 'italic' }}>no special note</p>
                          </div>
                        </div>
                        <span style={{ color: '#8B949E', fontSize: 12 }}>₹{item.price}</span>
                      </div>
                    ))}
                  </div>

                  {order.status === 'ready' && (
                    <button 
                      onClick={() => serveOrder(order.id)}
                      style={{ background: '#2EA043', border: 'none', color: 'white', padding: '12px', width: '100%', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: 6 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>
                      MARK AS SERVED
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* BOTTOM NAV */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 60, background: '#161B22', borderTop: '1px solid #30363D', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 }}>
        <div onClick={() => navigate('/staff/tables')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: 'white', cursor: 'pointer' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>grid_view</span>
          <span style={{ fontSize: 10, fontWeight: 600 }}>Floor</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: '#8B949E' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>close</span>
          <span style={{ fontSize: 10, fontWeight: 600 }}>Orders</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: '#8B949E' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>person</span>
          <span style={{ fontSize: 10, fontWeight: 600 }}>Service</span>
        </div>
      </nav>
    </div>
  )
}
