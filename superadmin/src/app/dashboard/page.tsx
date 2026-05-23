'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatINR, formatCount } from '@/lib/formatINR'

// ─── Types ────────────────────────────────────────────────────────────────
interface Tenant {
  id: string; name: string; slug: string; plan: string
  status: string; location: string; mrr: number; created_at: string
}
interface MrrPoint { label: string; month_date: string; cumulative_mrr: string; new_mrr: number }
interface TooltipState { x: number; y: number; label: string; value: number }

// ─── Sub-components ───────────────────────────────────────────────────────
function PlanBadge({ plan }: { plan: string }) {
  const p = plan.toLowerCase()
  if (p === 'enterprise') return (
    <span className="px-2.5 py-0.5 bg-[#C0272D1A] text-[#ffb3ae] border border-[#C0272D33] text-[9px] font-bold uppercase tracking-widest rounded-full">Enterprise</span>
  )
  if (p === 'pro') return (
    <span className="px-2.5 py-0.5 bg-[#1C1B1B] text-[#e3bebb] border border-[#2A2A2A] text-[9px] font-bold uppercase tracking-widest rounded-full">Pro</span>
  )
  return (
    <span className="px-2.5 py-0.5 bg-[#0e0e0e] text-[#555555] border border-[#2A2A2A] text-[9px] font-bold uppercase tracking-widest rounded-full">Starter</span>
  )
}

function StatusDot({ status }: { status: string }) {
  const s = status.toLowerCase()
  if (s === 'active') return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Active</span>
    </div>
  )
  if (s === 'trial') return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Trial</span>
    </div>
  )
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab]" />
      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Suspended</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()

  // Data state
  const [metrics, setMetrics] = useState<any>(null)
  const [mrrData, setMrrData] = useState<MrrPoint[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [notifOpen, setNotifOpen] = useState(false)
  const [chartRange, setChartRange] = useState<'1M' | '3M' | '6M' | '1Y'>('1Y')
  const [chartType, setChartType] = useState<'area' | 'line' | 'bar'>('area')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null)
  const [actionMenu, setActionMenu] = useState<string | null>(null)
  const [health, setHealth] = useState<{
    overall: 'ok' | 'degraded' | 'down'
    percentage: number
    services: {
      db:      { status: 'ok' | 'degraded' | 'down'; latencyMs: number }
      orders:  { status: 'ok' | 'degraded' | 'down'; latencyMs: number }
      auth:    { status: 'ok' | 'degraded' | 'down'; latencyMs: number }
      storage: { status: 'ok' | 'degraded' | 'down'; latencyMs: number }
    }
    checkedAt: string
  } | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  const notifRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const actionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Load dashboard data
  useEffect(() => {
    fetch('/api/dashboard/metrics')
      .then(r => r.json())
      .then(data => {
        setMetrics(data.metrics)
        setMrrData(data.mrrMonthly ?? [])
        setActivity(data.activity ?? [])
        setTenants(data.tenants ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      const clickedInMenu = Object.values(actionRefs.current).some(
        ref => ref && ref.contains(e.target as Node)
      )
      if (!clickedInMenu) setActionMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Health polling every 30s
  useEffect(() => {
    const fetchHealth = () => {
      fetch('/api/health')
        .then(r => r.json())
        .then(data => {
          setHealth(data)
          setHealthLoading(false)
        })
        .catch(() => setHealthLoading(false))
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  // ── Chart data filtered by range ──────────────────────────────────────
  const rangeCount = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[chartRange]
  const filteredChart = mrrData.slice(-rangeCount).map(m => ({
    label: m.label,
    value: Number(m.cumulative_mrr),
  }))

  // SVG chart dimensions
  const chartW = 800
  const chartH = 200
  const maxVal = filteredChart.length ? Math.max(...filteredChart.map(d => d.value), 1) : 1

  const pts = filteredChart.map((d, i) => ({
    x: filteredChart.length > 1 ? (i / (filteredChart.length - 1)) * chartW : chartW / 2,
    y: chartH - (d.value / maxVal) * (chartH - 16) - 8,
  }))

  const pathD = pts.length > 1
    ? `M${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ')
    : ''
  const areaD = pts.length > 1
    ? `M${pts[0].x},${chartH} L${pts[0].x},${pts[0].y} ` +
      pts.slice(1).map(p => `L${p.x},${p.y}`).join(' ') +
      ` L${pts[pts.length - 1].x},${chartH} Z`
    : ''

  const yLabels = [maxVal, maxVal / 2, 0]
  const barWidth = filteredChart.length > 0 ? (chartW / filteredChart.length) * 0.55 : 40

  // ── SVG hover tooltip ─────────────────────────────────────────────────
  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || filteredChart.length === 0) return
    const rect = svgRef.current.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * chartW
    let nearest = 0
    let minDist = Infinity
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - mouseX)
      if (d < minDist) { minDist = d; nearest = i }
    })
    const p = pts[nearest]
    const d = filteredChart[nearest]
    const screenX = rect.left + (p.x / chartW) * rect.width
    const screenY = rect.top + (p.y / chartH) * rect.height
    setTooltip({ x: screenX, y: screenY, label: d.label, value: d.value })
  }, [pts, filteredChart, chartW, chartH])

  // ── Donut chart ───────────────────────────────────────────────────────
  const planData = [
    { label: 'Starter',    value: metrics?.plan_starter    ?? 0, color: '#333333' },
    { label: 'Pro',        value: metrics?.plan_pro        ?? 0, color: '#2A2A2A' },
    { label: 'Enterprise', value: metrics?.plan_enterprise ?? 0, color: '#C0272D' },
  ]
  const totalPlan = planData.reduce((s, d) => s + d.value, 0) || 1
  const circumference = 2 * Math.PI * 70
  let cumOff = 0
  const donutSegs = planData.map(d => {
    const dash = (d.value / totalPlan) * circumference
    const seg = { ...d, dash, offset: circumference - dash, rotation: (cumOff / totalPlan) * 360 }
    cumOff += d.value
    return seg
  })

  return (
    <div className="px-8 py-8 pb-12 bg-[#131313] min-h-screen">

      {/* Header Section */}
      <header className="mb-10 flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-[#F5F5F5] tracking-tighter">Platform Control Center</h1>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <p className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em]">Live System Telemetry · {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase()}</p>
          </div>
        </div>
        
        {/* Top Actions */}
        <div className="flex items-center gap-4" ref={notifRef}>
           <button
            onClick={() => setNotifOpen(v => !v)}
            className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-[#1C1B1B] border border-[#2A2A2A] hover:border-[#C0272D]/50 transition-all group"
          >
            <span className="material-symbols-outlined text-[#555] group-hover:text-[#F5F5F5] transition-colors">notifications</span>
            {activity.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-[#C0272D] rounded-full shadow-[0_0_8px_rgba(192,39,45,0.4)]" />
            )}
          </button>
          
          {notifOpen && (
            <div className="absolute right-8 top-24 w-96 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2A2A] bg-[#1C1B1B]">
                <p className="text-xs font-bold text-[#F5F5F5] uppercase tracking-widest">System Alerts</p>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-[#2A2A2A]">
                {activity.length === 0 && <p className="px-4 py-4 text-[10px] text-[#555] text-center uppercase tracking-widest font-bold">No recent alerts</p>}
                {activity.map((a: any, i: number) => (
                  <div key={i} className="px-4 py-3 hover:bg-[#202020] transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#C0272D]/10 border border-[#C0272D]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs">{a.type === 'new_tenant' ? '🍽️' : '📦'}</span>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#F5F5F5] leading-tight">{a.title}</p>
                        <p className="text-[10px] text-[#555] mt-0.5 leading-relaxed">{a.message}</p>
                        <p className="text-[9px] font-mono text-[#333] mt-1.5 uppercase tracking-tighter">
                          {new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Tooltip — fixed overlay */}
      {tooltip && (
        <div
          className="fixed z-100 pointer-events-none bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 shadow-2xl"
          style={{ left: tooltip.x - 60, top: tooltip.y - 56 }}
        >
          <p className="text-[10px] text-[#555] font-mono">{tooltip.label}</p>
          <p className="text-sm font-bold text-[#F5F5F5] font-mono">{formatINR(tooltip.value)}</p>
        </div>
      )}

      {/* KPI Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Restaurants */}
        <div className="bg-[#1C1B1B] rounded-[14px] p-6 border border-[#2A2A2A] relative overflow-hidden group hover:border-[#C0272D]/30 transition-all duration-300">
          <p className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em] mb-4">Total Restaurants</p>
          <div className="flex items-end gap-3">
            <h2 className="text-5xl font-black text-[#F5F5F5] leading-none tracking-tighter">
              {loading ? '—' : formatCount(metrics?.total_tenants ?? 0)}
            </h2>
            <div className="mb-1">
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                <span className="material-symbols-outlined text-[10px] font-black">arrow_upward</span>{metrics?.new_tenants_this_month ?? 0}
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex -space-x-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-5 h-5 rounded-full border-2 border-[#1C1B1B] bg-[#2A2A2A] flex items-center justify-center text-[8px] font-bold text-[#555]">
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <p className="text-[10px] font-medium text-[#555555] uppercase tracking-wider">
               {metrics?.active_tenants ?? 0} Active Nodes
            </p>
          </div>
        </div>

        {/* Platform Revenue */}
        <div className="bg-[#1C1B1B] rounded-[14px] p-6 border border-[#C0272D]/40 relative overflow-hidden group hover:border-[#C0272D]/60 transition-all duration-300 shadow-[0_0_50px_rgba(192,39,45,0.05)]">
          <div className="absolute top-0 right-0 p-3">
            <span className="material-symbols-outlined text-[#C0272D] text-lg opacity-40">payments</span>
          </div>
          <p className="text-[10px] font-bold text-[#ffb3ae] uppercase tracking-[0.2em] mb-4">Platform MRR</p>
          <div className="flex flex-col">
            <h2 className="text-5xl font-black text-[#F5F5F5] leading-none tracking-tighter">
              {loading ? '—' : formatINR(metrics?.total_mrr ?? 0)}
            </h2>
            <div className="mt-4 flex items-center gap-2">
               <span className="text-[9px] font-bold text-[#ffb3ae] bg-[#C0272D1A] px-2 py-0.5 rounded uppercase tracking-wider">
                +{formatINR(metrics?.new_mrr_this_month ?? 0)} Target Delta
              </span>
            </div>
          </div>
        </div>

        {/* Orders Throughput */}
        <div className="bg-[#1C1B1B] rounded-[14px] p-6 border border-[#2A2A2A] relative overflow-hidden group hover:border-[#C0272D]/30 transition-all duration-300">
          <p className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em] mb-4">Daily Throughput</p>
          <div className="flex items-end gap-3">
            <h2 className="text-5xl font-black text-[#F5F5F5] leading-none tracking-tighter">
              {loading ? '—' : formatCount(metrics?.orders_today ?? 0)}
            </h2>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded mb-1 uppercase tracking-wider">Orders</span>
          </div>
          <div className="mt-4 h-1 w-full bg-[#2A2A2A] rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full w-[65%]" />
          </div>
          <p className="text-[9px] font-bold text-[#333] mt-2 uppercase tracking-widest">
            {metrics?.orders_this_week ?? 0} Cumulative (7D)
          </p>
        </div>

        {/* System Vitals */}
        <div className="bg-[#1C1B1B] rounded-[14px] p-6 border border-[#2A2A2A] relative overflow-hidden group hover:border-[#C0272D]/30 transition-all duration-300">
          <div className="flex justify-between items-center mb-4">
            <p className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em]">System Vitals</p>
            {health && (
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${health.overall === 'ok' ? 'text-emerald-500 border-emerald-500/30' : 'text-[#C0272D] border-[#C0272D]/30'}`}>
                {health.overall.toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1">
            <h2 className={`text-5xl font-black leading-none tracking-tighter ${
              healthLoading ? 'text-[#333]' :
              health?.overall === 'ok' ? 'text-emerald-400' : 'text-[#C0272D]'
            }`}>
              {healthLoading ? '—' : `${health?.percentage ?? 0}%`}
            </h2>
            <span className="text-[10px] font-bold text-[#555] uppercase">Uptime</span>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
            {health && ([
              { key: 'db',      icon: 'database' },
              { key: 'orders',  icon: 'sync'     },
              { key: 'auth',    icon: 'lock'     },
              { key: 'storage', icon: 'cloud'    },
            ] as const).map(({ key, icon }) => {
              const svc = health.services[key]
              const color = svc.status === 'ok' ? 'bg-emerald-500' : 'bg-[#C0272D]'
              return (
                <div key={key} className="flex flex-col items-center gap-1.5 p-1.5 bg-[#0D0D0D] rounded-lg border border-[#2A2A2A]" title={`${key.toUpperCase()}: ${svc.latencyMs}ms`}>
                  <span className="material-symbols-outlined text-[12px] text-[#555]">{icon}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${color} ${svc.status === 'ok' ? 'shadow-[0_0_5px_rgba(16,185,129,0.5)]' : ''}`} />
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* MRR Growth Chart */}
        <div className="lg:col-span-2 bg-[#1C1B1B] rounded-[14px] p-8 border border-[#2A2A2A]">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="text-xl font-black tracking-tight text-[#F5F5F5]">MRR Trajectory</h3>
              <p className="text-[10px] font-bold text-[#555555] uppercase tracking-widest mt-1">Platform-wide Revenue Accumulation</p>
            </div>
            <div className="flex items-center gap-2">
               <div className="flex bg-[#0D0D0D] rounded-lg p-1 border border-[#2A2A2A]">
                {(['1M','3M','6M','1Y'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setChartRange(r)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-tighter rounded-md transition-all ${
                      chartRange === r
                        ? 'bg-[#C0272D] text-white'
                        : 'text-[#555555] hover:text-[#F5F5F5]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="h-[240px] w-full relative">
            <div className="flex h-full gap-4">
              {/* Y-axis */}
              <div className="flex flex-col justify-between pb-7 text-right shrink-0 w-16">
                {yLabels.map((v, i) => (
                  <span key={i} className="font-mono text-[9px] font-bold text-[#333]">{formatINR(Math.round(v))}</span>
                ))}
              </div>
              {/* Chart area */}
              <div className="flex-1 flex flex-col min-w-0">
                <svg
                  ref={svgRef}
                  className="w-full flex-1 cursor-crosshair overflow-visible"
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  preserveAspectRatio="none"
                  onMouseMove={handleSvgMouseMove}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <defs>
                    <linearGradient id="mrrGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#C0272D" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#C0272D" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 0.5, 1].map((v, i) => (
                    <line
                      key={i}
                      x1="0" y1={chartH - v * (chartH - 16) - 8}
                      x2={chartW} y2={chartH - v * (chartH - 16) - 8}
                      stroke="#2A2A2A" strokeWidth="1" strokeDasharray="4 4"
                    />
                  ))}

                  {/* Area chart */}
                  {chartType === 'area' && pts.length > 1 && (
                    <>
                      <path d={areaD} fill="url(#mrrGrad)" className="transition-all duration-700" />
                      <path d={pathD} fill="none" stroke="#C0272D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  )}

                  {/* Line chart */}
                  {chartType === 'line' && pts.length > 1 && (
                    <path d={pathD} fill="none" stroke="#C0272D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  )}

                  {/* Bar chart */}
                  {chartType === 'bar' && filteredChart.map((d, i) => {
                    const bh = (d.value / maxVal) * (chartH - 16)
                    return (
                      <rect
                        key={i}
                        x={pts[i].x - barWidth / 2}
                        y={chartH - bh - 8}
                        width={barWidth}
                        height={bh}
                        fill="#C0272D"
                        fillOpacity="0.6"
                        rx="4"
                      />
                    )
                  })}

                  {/* Hover dot */}
                  {tooltip && pts.length > 0 && (() => {
                    const nearest = filteredChart.findIndex((d) => d.label === tooltip.label)
                    if (nearest < 0) return null
                    return (
                      <>
                        <line x1={pts[nearest].x} y1="0" x2={pts[nearest].x} y2={chartH} stroke="#C0272D" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.4" />
                        <circle cx={pts[nearest].x} cy={pts[nearest].y} r="6" fill="#C0272D" stroke="#1C1B1B" strokeWidth="3" style={{ filter: 'drop-shadow(0px 0px 10px rgba(192, 39, 45, 0.5))' }} />
                      </>
                    )
                  })()}
                </svg>

                {/* X-axis labels */}
                <div className="flex justify-between mt-4 px-1">
                  {filteredChart.map((d, i) => (
                    <span key={i} className="font-mono text-[9px] font-black text-[#555] uppercase">{d.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Distribution Donut */}
        <div className="bg-[#1C1B1B] rounded-[14px] p-8 border border-[#2A2A2A] flex flex-col">
          <h3 className="text-xl font-black tracking-tight text-[#F5F5F5] mb-1">Tier Segmentation</h3>
          <p className="text-[10px] font-bold text-[#555555] uppercase tracking-widest mb-8">Subscriber Composition</p>
          <div className="flex-1 flex flex-col justify-center items-center relative py-4">
            <svg className="w-48 h-48 transform -rotate-90">
              {donutSegs.map((seg, i) => (
                <circle
                  key={i}
                  cx="96" cy="96"
                  r="75"
                  fill="transparent"
                  stroke={hoveredPlan === seg.label ? '#ff4444' : seg.color}
                  strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                  strokeDashoffset={circumference - (donutSegs.slice(0, i).reduce((s, d) => s + d.dash, 0))}
                  strokeWidth={hoveredPlan === seg.label ? 26 : 20}
                  strokeLinecap="butt"
                  className="transition-all duration-300 cursor-pointer"
                  onMouseEnter={() => setHoveredPlan(seg.label)}
                  onMouseLeave={() => setHoveredPlan(null)}
                />
              ))}
              {totalPlan === 0 && (
                <circle cx="96" cy="96" r="75" fill="transparent" stroke="#2A2A2A" strokeWidth="20" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {hoveredPlan ? (
                <>
                  <span className="text-3xl font-black font-mono text-[#F5F5F5] tracking-tighter">
                    {planData.find(p => p.label === hoveredPlan)?.value ?? 0}
                  </span>
                  <span className="text-[9px] font-black text-[#C0272D] uppercase tracking-widest">{hoveredPlan}</span>
                  <span className="text-[10px] font-mono text-[#555] mt-1">
                    {Math.round(((planData.find(p => p.label === hoveredPlan)?.value ?? 0) / totalPlan) * 100)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-4xl font-black font-mono text-[#F5F5F5] tracking-tighter">
                    {loading ? '—' : formatCount(metrics?.total_tenants ?? 0)}
                  </span>
                  <span className="text-[9px] font-black text-[#555] uppercase tracking-widest mt-1">Aggregate</span>
                </>
              )}
            </div>
          </div>
          <div className="space-y-4 mt-8">
            {planData.map((d, i) => {
              const pct = totalPlan > 0 ? Math.round((d.value / totalPlan) * 100) : 0
              return (
                <div
                  key={i}
                  className={`flex justify-between items-center group cursor-pointer p-2 rounded-lg transition-all ${hoveredPlan === d.label ? 'bg-[#0D0D0D] border border-[#2A2A2A]' : 'border border-transparent'}`}
                  onMouseEnter={() => setHoveredPlan(d.label)}
                  onMouseLeave={() => setHoveredPlan(null)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${hoveredPlan === d.label ? 'text-[#F5F5F5]' : 'text-[#555]'}`}>{d.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] font-bold text-[#333]">{d.value}</span>
                    <span className="font-mono text-sm font-black text-[#F5F5F5]">{loading ? '—' : `${pct}%`}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Recent Activity Section */}
      <section className="bg-[#1C1B1B] rounded-[14px] overflow-hidden border border-[#2A2A2A]">
        <div className="px-8 py-6 border-b border-[#2A2A2A] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#C0272D]">rocket_launch</span>
            <h3 className="text-lg font-black tracking-tight text-[#F5F5F5]">Recent Operations</h3>
          </div>
          <button
            onClick={() => router.push('/dashboard/tenants')}
            className="px-4 py-2 bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg text-[10px] font-black uppercase tracking-widest text-[#555] hover:text-[#F5F5F5] hover:border-[#C0272D]/50 transition-all"
          >
            Full Audit Log
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#0D0D0D]/50">
              <tr>
                {['Restaurant Node', 'Tier', 'MRR Value', 'Status', 'Deployed', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-8 py-5 text-[9px] font-black text-[#333] uppercase tracking-[0.2em] ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]/40">
              {loading && (
                <tr><td colSpan={6} className="px-8 py-10 text-[10px] text-[#555] text-center uppercase tracking-widest font-bold animate-pulse">Initializing Data Stream...</td></tr>
              )}
              {!loading && tenants.length === 0 && (
                <tr><td colSpan={6} className="px-8 py-10 text-[10px] text-[#555] text-center uppercase tracking-widest font-bold">No data found</td></tr>
              )}
              {tenants.map((t) => {
                const initials = t.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                const joined = new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }).toUpperCase()
                return (
                  <tr key={t.id} className="hover:bg-[#202020] transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-[#0D0D0D] border border-[#2A2A2A] flex items-center justify-center text-xs font-black text-[#C0272D] group-hover:border-[#C0272D]/30 transition-all">
                          {initials}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-[#F5F5F5] tracking-tight">{t.name}</span>
                          <span className="text-[10px] font-mono font-bold text-[#333] uppercase">{t.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5"><PlanBadge plan={t.plan} /></td>
                    <td className="px-8 py-5 font-mono text-sm text-emerald-500 font-black">{formatINR(t.mrr)}</td>
                    <td className="px-8 py-5"><StatusDot status={t.status} /></td>
                    <td className="px-8 py-5 font-mono text-[10px] font-black text-[#333] uppercase">{joined}</td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => router.push(`/dashboard/tenants/${t.id}`)}
                          className="w-8 h-8 flex items-center justify-center bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg text-[#555] hover:text-[#C0272D] hover:border-[#C0272D]/50 transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                        </button>
                        <button
                           onClick={() => setActionMenu(prev => prev === t.id ? null : t.id)}
                           className="w-8 h-8 flex items-center justify-center bg-[#0D0D0D] border border-[#2A2A2A] rounded-lg text-[#555] hover:text-[#F5F5F5] hover:border-[#2A2A2A] transition-all"
                        >
                          <span className="material-symbols-outlined text-sm">more_horiz</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
