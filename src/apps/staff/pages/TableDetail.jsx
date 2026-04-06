import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStaffStore } from '../../../store/index'

export default function TableDetail() {
  const { id } = useParams()
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
      const [tRes, oRes, aRes] = await Promise.all([
        supabase.from('restaurant_tables').select('*').eq('id', id).single(),
        supabase.from('orders').select('*, order_items(*, menu_items(name, price))').eq('table_id', id).neq('status', 'served').neq('status', 'cancelled'),
        supabase.from('assistance_requests').select('*').eq('table_id', id).neq('status', 'resolved')
      ])

      setTable(tRes.data)
      setOrders(oRes.data || [])
      setRequests(aRes.data || [])
      setLoading(false)
    }

    fetchData()

    const channel = supabase.channel(`table_detail_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `table_id=eq.${id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
           supabase.from('orders').select('*, order_items(*, menu_items(name, price))').eq('id', payload.new.id).single()
             .then(({ data }) => setOrders(prev => [...prev, data]))
        } else if (payload.eventType === 'UPDATE') {
          setOrders(prev => {
            if (payload.new.status === 'served' || payload.new.status === 'cancelled') {
              return prev.filter(o => o.id !== payload.new.id)
            }
            return prev.find(o => o.id === payload.new.id)
              ? prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
              : [...prev, payload.new]
          })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assistance_requests', filter: `table_id=eq.${id}` }, (payload) => {
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
  }, [id, staff_user, navigate])

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

  if (loading) return <div style={{ background: '#0F172A', minHeight: '100vh' }} />

  return (
    <div className="min-h-screen bg-[#0F172A] w-full overflow-x-hidden" style={{ fontFamily: 'Manrope, sans-serif' }}>
      <header className="bg-[#1E293B] px-4 md:px-8 py-4 flex flex-wrap md:flex-nowrap justify-between items-center border-b border-[#334155] gap-4">
        <div className="flex items-center gap-4 md:gap-6">
          <button 
            onClick={() => navigate('/staff/tables')}
            className="bg-[#334155] border-none text-white w-10 h-10 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-white text-xl md:text-2xl font-extrabold m-0 pb-1" style={{ fontFamily: 'Epilogue, sans-serif' }}>Table {table?.table_num}</h1>
            <p className="text-[#94A3B8] text-xs md:text-[13px] font-semibold m-0">Manage orders and requests</p>
          </div>
        </div>
        
        <button 
          onClick={handleCheckout}
          disabled={orders.length === 0 && requests.length === 0}
          className={`border-none text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
             (orders.length === 0 && requests.length === 0) ? 'bg-[#334155] cursor-not-allowed' : 'bg-[#10B981] cursor-pointer'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] md:text-[20px]">done_all</span>
          Clear Table
        </button>
      </header>

      <main className="p-4 md:p-8 max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
        
        {/* Left Col: Requests */}
        <section>
          <h2 style={{ color: '#F87171', fontFamily: 'Epilogue, sans-serif', fontSize: 20, marginTop: 0, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-symbols-outlined">notifications_active</span>
            Active Requests {requests.length > 0 && <span style={{ background: '#F87171', color: '#450A0A', padding: '2px 8px', borderRadius: 99, fontSize: 13 }}>{requests.length}</span>}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {requests.length === 0 ? (
              <p style={{ color: '#64748B', fontSize: 15 }}>No pending requests.</p>
            ) : (
              requests.map(req => (
                <div key={req.id} style={{ background: '#450A0A', border: '1px solid #7F1D1D', padding: 20, borderRadius: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <p style={{ color: 'white', fontWeight: 800, margin: '0 0 4px', fontSize: 18, textTransform: 'capitalize' }}>
                        {req.request_type.replace('_', ' ')}
                      </p>
                      {req.message && <p style={{ color: '#FECACA', fontSize: 14, margin: '0 0 8px', fontStyle: 'italic' }}>"{req.message}"</p>}
                      <p style={{ color: '#991B1B', fontSize: 12, margin: 0 }}>ID: {req.table_session_id.substring(0,8)}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => resolveRequest(req.id)}
                    style={{ background: '#DC2626', border: 'none', color: 'white', padding: '10px', width: '100%', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Resolve Request
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Right Col: Orders */}
        <section>
          <h2 style={{ color: '#38BDF8', fontFamily: 'Epilogue, sans-serif', fontSize: 20, marginTop: 0, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-symbols-outlined">restaurant_menu</span>
            Active Orders {orders.length > 0 && <span style={{ background: '#38BDF8', color: '#082F49', padding: '2px 8px', borderRadius: 99, fontSize: 13 }}>{orders.length}</span>}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.length === 0 ? (
              <p style={{ color: '#64748B', fontSize: 15 }}>No active orders.</p>
            ) : (
              orders.map(order => (
                <div key={order.id} style={{ background: '#1E293B', border: '1px solid #334155', padding: 24, borderRadius: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, borderBottom: '1px solid #334155', paddingBottom: 16 }}>
                    <div>
                      <p style={{ color: '#94A3B8', fontSize: 12, fontWeight: 800, margin: '0 0 4px', letterSpacing: 1 }}>ORDER #{order.id.split('-')[0].toUpperCase()}</p>
                      <span style={{ 
                        background: order.status === 'ready' ? '#059669' : '#0284C7', 
                        color: 'white', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, textTransform: 'uppercase'
                      }}>
                        {order.status}
                      </span>
                    </div>
                    <p style={{ color: 'white', fontSize: 24, fontWeight: 800, margin: 0 }}>₹{order.total_amount}</p>
                  </div>

                  <div style={{ marginBottom: 24 }}>
                    {order.order_items?.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, color: '#E2E8F0', fontSize: 15 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <button 
                            onClick={() => toggleItemStatus(item.id, item.status)}
                            style={{ 
                              width: 24, height: 24, borderRadius: 6, border: '2px solid #334155',
                              background: item.status === 'accepted' ? '#EAB308' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0
                            }}
                          >
                            {item.status === 'accepted' && <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#002045', fontWeight: 800 }}>check</span>}
                          </button>
                          <span><span style={{ color: '#94A3B8', marginRight: 8 }}>{item.qty}x</span> {item.name}</span>
                        </div>
                        {item.status === 'out_of_stock' && (
                          <span style={{
                            background: '#FF3B30',
                            color: 'white',
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '20px'
                          }}>
                            Out of Stock
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => serveOrder(order.id)}
                    style={{ 
                      background: (order.status === 'ready' || order.status === 'pending' || order.status === 'cooking') ? '#10B981' : '#334155', 
                      color: 'white', 
                      border: 'none', padding: '14px', width: '100%', borderRadius: 12, fontWeight: 700, fontSize: 15,
                      cursor: 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', gap: 8
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>room_service</span>
                    {order.status === 'served' ? 'Served' : 'Confirm & Mark Served'}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

      </main>
    </div>
  )
}
