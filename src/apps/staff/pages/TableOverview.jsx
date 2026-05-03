import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStaffStore } from '../../../store/index'

export default function TableOverview() {
  const { staff_user, logout } = useStaffStore()
  const navigate = useNavigate()
  
  const [tables, setTables] = useState([])
  const [activeOrders, setActiveOrders] = useState([])
  const [activeRequests, setActiveRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [elapsedMap, setElapsedMap] = useState({})
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    const calcElapsed = () => {
      const map = {}
      const activeOrdersMap = activeOrders.filter(o => 
        ['pending','cooking','ready'].includes(o.status)
      )
      activeOrdersMap.forEach(order => {
        const mins = Math.floor(
          (Date.now() - new Date(order.created_at)) / 60000
        )
        if (!map[order.table_num] || mins > map[order.table_num]) {
          map[order.table_num] = mins
        }
      })
      setElapsedMap(map)
    }
    calcElapsed()
    const id = setInterval(calcElapsed, 60000)
    return () => clearInterval(id)
  }, [activeOrders])

  // Auth Guard
  useEffect(() => {
    if (!staff_user) navigate('/staff')
  }, [staff_user, navigate])

  const handleLogout = () => {
    logout()
    navigate('/staff')
  }

  // 1. Initial Fetch
  useEffect(() => {
    if (!staff_user) return

    const fetchData = async () => {
      const tenantId = import.meta.env.VITE_TENANT_ID
      
      const [tRes, oRes, aRes] = await Promise.all([
        supabase.from('restaurant_tables').select('*').eq('tenant_id', tenantId).order('table_num'),
        supabase.from('orders').select('*').eq('tenant_id', tenantId).neq('status', 'served').neq('status', 'cancelled'),
        supabase.from('assistance_requests').select('*').eq('tenant_id', tenantId).neq('status', 'resolved')
      ])

      setTables(tRes.data || [])
      setActiveOrders(oRes.data || [])
      setActiveRequests(aRes.data || [])
      setLoading(false)
    }

    fetchData()

    // 2. Setup Realtime Subscriptions
    const channel = supabase.channel('staff_dashboard')
      // Tables
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setTables(prev => prev.map(t => t.id === payload.new.id ? payload.new : t))
        }
      })
      // Orders
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setActiveOrders(prev => [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setActiveOrders(prev => {
            if (payload.new.status === 'served' || payload.new.status === 'cancelled') {
              return prev.filter(o => o.id !== payload.new.id) // Remove served
            }
            return prev.find(o => o.id === payload.new.id) 
              ? prev.map(o => o.id === payload.new.id ? payload.new : o) 
              : [...prev, payload.new]
          })
        }
      })
      // Requests
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assistance_requests' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setActiveRequests(prev => [...prev, payload.new])
          playAlertBeep()
        } else if (payload.eventType === 'UPDATE') {
           setActiveRequests(prev => {
             if (payload.new.status === 'resolved') return prev.filter(r => r.id !== payload.new.id)
             return prev.map(r => r.id === payload.new.id ? payload.new : r)
           })
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [staff_user])

  if (!staff_user || loading) return <div style={{ background: '#0F172A', minHeight: '100vh' }} />

  // Derived state map
  const getTableStatus = (tableId) => {
    const tableRequests = activeRequests.filter(r => r.table_id === tableId)
    const tableOrders = activeOrders.filter(o => o.table_id === tableId)

    if (tableRequests.length > 0) return { type: 'attention', requests: tableRequests }
    if (tableOrders.length > 0) return { type: 'dining', orders: tableOrders }
    return { type: 'available' }
  }

  const playAlertBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.frequency.value = 880
      osc1.type = 'sine'
      gain1.gain.setValueAtTime(0.3, ctx.currentTime)
      gain1.gain.exponentialRampToValueAtTime(
        0.001, ctx.currentTime + 0.3
      )
      osc1.start(ctx.currentTime)
      osc1.stop(ctx.currentTime + 0.3)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.frequency.value = 1100
      osc2.type = 'sine'
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.35)
      gain2.gain.exponentialRampToValueAtTime(
        0.001, ctx.currentTime + 0.65
      )
      osc2.start(ctx.currentTime + 0.35)
      osc2.stop(ctx.currentTime + 0.65)
    } catch (e) {
      // Silently fail — audio blocked by browser policy
    }
  }



  return (
    <div style={{ minHeight: '100vh', background: '#0D1117', color: '#E6EDF3', fontFamily: 'Manrope, sans-serif', paddingBottom: 80 }}>
      {/* HEADER */}
      <header style={{ background: '#0D1117', padding: '16px 20px', borderBottom: '1px solid #30363D' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1B2F1E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2EA043', fontWeight: 700, fontSize: 14 }}>
              {staff_user.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <p style={{ color: 'white', fontSize: 14, fontWeight: 600, margin: 0 }}>{staff_user.name}</p>
              <p style={{ color: '#8B949E', fontSize: 12, margin: 0, textTransform: 'capitalize' }}>{staff_user.role}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#8B949E', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>TABLEOS</span>
            <span className="material-symbols-outlined" style={{ color: '#8B949E', fontSize: 20 }}>grid_view</span>
          </div>
        </div>
        
        <div>
          <h1 style={{ color: 'white', fontSize: 18, fontWeight: 800, margin: '0 0 2px' }}>The Grand Spice</h1>
          <p style={{ color: '#8B949E', fontSize: 13, margin: 0 }}>Main Floor Section</p>
        </div>
      </header>

      {/* STATUS FILTER BAR */}
      <div style={{ padding: '16px 20px 8px', display: 'flex', gap: 10, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {['All', 'Needs Attention', 'Ready to Serve'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
              background: filter === f ? 'white' : '#161B22',
              color: filter === f ? '#0D1117' : '#8B949E'
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* STATS ROW */}
      <div style={{ padding: '8px 20px 16px', display: 'flex', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EA043' }} />
          <span style={{ color: '#8B949E', fontSize: 13 }}>{tables.length} Tables Ready</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F85149' }} />
          <span style={{ color: '#8B949E', fontSize: 13 }}>{activeRequests.length} Urgent</span>
        </div>
      </div>

      {/* TABLE GRID */}
      <main style={{ padding: '0 16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tables.map(table => {
          const status = getTableStatus(table.id)
          const mins = elapsedMap[table.table_num] || 0
          
          let cardStyle = {
            background: '#161B22', border: '1px solid #30363D', borderRadius: 12, padding: 12, 
            position: 'relative', minHeight: 90, cursor: 'pointer'
          }
          let tableNumColor = 'white'
          let statusText = 'VACANT'

          if (status.type === 'attention') {
            cardStyle.background = '#2D1B1B'
            cardStyle.border = '1px solid #F85149'
            statusText = 'ASSIST'
          } else if (status.type === 'dining') {
            const isReady = status.orders.some(o => o.status === 'ready')
            if (isReady) {
              cardStyle.background = '#1B2F1E'
              cardStyle.border = '1px solid #2EA043'
              statusText = 'READY TO SERVE'
            } else if (mins >= 30) {
              cardStyle.borderLeft = '3px solid #E3B341'
              statusText = 'PAYMENT'
            } else {
              cardStyle.borderLeft = '3px solid #2EA043'
              statusText = 'OCCUPIED'
            }
          }

          if (filter !== 'All') {
            if (filter === 'Needs Attention' && status.type !== 'attention') return null
            if (filter === 'Ready to Serve' && !status.orders?.some(o => o.status === 'ready')) return null
          }

          return (
            <div 
              key={table.id}
              onClick={() => navigate(`/staff/table/${table.id}`)}
              style={cardStyle}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: tableNumColor }}>{table.table_num}</span>
                
                {status.type === 'attention' ? (
                  <div style={{ background: '#F85149', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span>ASSIST</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                  </div>
                ) : status.type === 'dining' && status.orders.some(o => o.status === 'ready') ? (
                  <div style={{ background: '#2EA043', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>
                    READY TO SERVE
                  </div>
                ) : status.type === 'dining' ? (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: mins >= 30 ? '#E3B341' : '#2EA043', marginTop: 4 }} />
                ) : null}
              </div>

              <div style={{ marginTop: 8 }}>
                {status.type === 'attention' ? (
                  <p style={{ color: '#F85149', fontSize: 11, margin: 0, fontWeight: 600 }}>WAITER NEEDED</p>
                ) : status.type === 'dining' ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ color: '#2EA043', fontSize: 12, margin: 0, fontWeight: 600 }}>
                      {status.orders.length} Orders • ₹{status.orders.reduce((acc, o) => acc + o.total_amount, 0)}
                    </p>
                    {mins >= 30 && (
                      <div style={{ background: '#E3B341', color: '#0D1117', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>
                        {mins}m
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#8B949E', fontSize: 11, margin: 0, fontWeight: 600 }}>VACANT</p>
                )}
              </div>
            </div>
          )
        })}
      </main>

      {/* LEGEND ROW */}
      <div style={{ padding: '0 20px 20px', display: 'flex', gap: 12, justifyContent: 'center', opacity: 0.8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B949E' }} />
          <span style={{ color: '#8B949E', fontSize: 11 }}>vacant</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2EA043' }} />
          <span style={{ color: '#8B949E', fontSize: 11 }}>occupied</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3FB950' }} />
          <span style={{ color: '#8B949E', fontSize: 11 }}>ready</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F85149' }} />
          <span style={{ color: '#8B949E', fontSize: 11 }}>urgent</span>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: 60, background: '#161B22', borderTop: '1px solid #30363D', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: 'white' }}>
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
