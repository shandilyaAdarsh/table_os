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
    <div style={{ minHeight: '100vh', background: '#0F172A', fontFamily: 'Manrope, sans-serif' }}>
      {/* Navbar */}
      <header style={{ background: '#1E293B', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
        <div>
          <h1 style={{ color: 'white', fontFamily: 'Epilogue, sans-serif', fontSize: 24, margin: '0 0 4px', fontWeight: 800 }}>TableOS <span style={{ color: '#38BDF8', fontWeight: 400 }}>Floor Map</span></h1>
          <p style={{ color: '#94A3B8', fontSize: 13, margin: 0, fontWeight: 600 }}>Logged in as <span style={{ color: 'white' }}>{staff_user.name}</span></p>
        </div>
        <button 
          onClick={handleLogout}
          style={{ background: 'transparent', border: '1px solid #334155', color: '#CBD5E1', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8 }}
          onPointerEnter={e => e.currentTarget.style.background = '#334155'}
          onPointerLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          Sign Out
        </button>
      </header>

      {/* Grid */}
      <main style={{ padding: 40, maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {tables.map(table => {
            const status = getTableStatus(table.id)
            let bg = '#1E293B'
            let border = '1px solid #334155'
            let glow = 'none'

            if (status.type === 'attention') {
              // Flashing dark red
              bg = '#450A0A'
              border = '1px solid #F87171'
              glow = '0 0 20px rgba(248, 113, 113, 0.4)'
            } else if (status.type === 'dining') {
              bg = '#083344'
              border = '1px solid #38BDF8'
            }

            if (elapsedMap[table.table_num] >= 30) {
              glow = '0 0 12px rgba(239,68,68,0.25)'
            }

            return (
              <div 
                key={table.id}
                onClick={() => navigate(`/staff/table/${table.id}`)}
                style={{ 
                  background: bg, border, boxShadow: glow, borderRadius: 24, padding: 24, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', minHeight: 180, transition: 'all 0.3s',
                  animation: status.type === 'attention' ? 'pulseRed 2s infinite' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'auto' }}>
                  <h2 style={{ fontFamily: 'Epilogue, sans-serif', fontSize: 32, margin: 0, color: 'white' }}>{table.table_num}</h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60%' }}>
                    {elapsedMap[table.table_num] !== undefined && (() => {
                      const mins = elapsedMap[table.table_num]
                      if (mins < 15) return (
                        <span className="rounded-full px-2 py-0.5 text-xs font-mono font-semibold bg-green-500/20 text-green-400">
                          {mins}m
                        </span>
                      )
                      if (mins < 30) return (
                        <span className="rounded-full px-2 py-0.5 text-xs font-mono font-semibold bg-amber-500/20 text-amber-400">
                          {mins}m ⚠
                        </span>
                      )
                      return (
                        <span className="rounded-full px-2 py-0.5 text-xs font-mono font-semibold bg-red-500/20 text-red-400">
                          {mins}m 🔴
                        </span>
                      )
                    })()}
                    {status.type === 'attention' && (
                      <div style={{ background: '#EF4444', color: 'white', padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>priority_high</span>
                        Waitstaff
                      </div>
                    )}
                    {status.type === 'dining' && (
                      <div style={{ background: '#0EA5E9', color: 'white', padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Eating
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer details */}
                <div style={{ marginTop: 24 }}>
                  {status.type === 'available' ? (
                    <p style={{ color: '#64748B', fontWeight: 600, margin: 0, fontSize: 15 }}>Empty Table</p>
                  ) : status.type === 'attention' ? (
                    <p style={{ color: '#FECACA', margin: 0, fontSize: 15, fontWeight: 500 }}>
                      <span style={{ fontWeight: 800, color: '#F87171' }}>{status.requests.length}</span> request{status.requests.length > 1 ? 's' : ''} pending
                    </p>
                  ) : (
                    <p style={{ color: '#BAE6FD', margin: 0, fontSize: 15, fontWeight: 500 }}>
                      <span style={{ fontWeight: 800, color: '#38BDF8' }}>{status.orders.length}</span> active order{status.orders.length > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </main>

      <style>{`
        @keyframes pulseRed {
          0%, 100% { box-shadow: 0 0 20px rgba(248, 113, 113, 0.4); }
          50%      { box-shadow: 0 0 40px rgba(248, 113, 113, 0.8); }
        }
      `}</style>
    </div>
  )
}
