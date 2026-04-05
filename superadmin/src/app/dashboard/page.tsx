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
    <span className="px-3 py-1 bg-[#C0272D1A] text-[#ffb3ae] border border-[#C0272D33] text-[10px] font-bold uppercase tracking-tighter rounded-full">Enterprise</span>
  )
  if (p === 'pro') return (
    <span className="px-3 py-1 bg-[#353534] text-[#e3bebb] border border-[#2A2A2A] text-[10px] font-bold uppercase tracking-tighter rounded-full">Pro</span>
  )
  return (
    <span className="px-3 py-1 bg-[#0e0e0e] text-[#555555] border border-[#2A2A2A] text-[10px] font-bold uppercase tracking-tighter rounded-full">Starter</span>
  )
}

function StatusDot({ status }: { status: string }) {
  const s = status.toLowerCase()
  if (s === 'active') return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
      <span className="text-xs text-[#e3bebb]">Active</span>
    </div>
  )
  if (s === 'trial') return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-amber-500" />
      <span className="text-xs text-[#e3bebb]">Trial</span>
    </div>
  )
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-[#ffb4ab]" />
      <span className="text-xs text-[#e3bebb]">Suspended</span>
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
    <div className="px-8 py-8 pb-12">

      {/* Notification bell — fixed top right */}
      <div className="fixed top-0 right-0 z-50 h-16 flex items-center pr-8">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(v => !v)}
            className="relative w-10 h-10 flex items-center justify-center rounded-[10px] hover:bg-[#2A2A2A] transition-colors"
          >
            <span className="material-symbols-outlined text-[#e3bebb]">notifications</span>
            {activity.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-[#C0272D] rounded-full" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 w-96 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2A2A]">
                <p className="text-sm font-bold text-[#F5F5F5]">Recent Activity</p>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-[#2A2A2A]">
                {activity.length === 0 && <p className="px-4 py-4 text-xs text-[#555]">No recent activity</p>}
                {activity.map((a: any, i: number) => (
                  <div key={i} className="px-4 py-3 hover:bg-[#2A2A2A] transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#C0272D]/10 border border-[#C0272D]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs">{a.type === 'new_tenant' ? '🍽️' : '📦'}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#F5F5F5]">{a.title}</p>
                        <p className="text-[11px] text-[#555] mt-0.5">{a.message}</p>
                        <p className="text-[10px] text-[#333] mt-1">
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
      </div>

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
        <div className="bg-[#201f1f] rounded-[10px] p-6 border border-[#2A2A2A] relative overflow-hidden group hover:bg-[#2a2a2a] transition-all">
          <p className="text-[0.6875rem] font-bold text-[#555555] uppercase tracking-widest mb-4">Total Restaurants</p>
          <div className="flex items-end gap-2">
            <h2 className="text-[48px] font-bold font-mono text-[#e5e2e1] leading-none">
              {loading ? '—' : formatCount(metrics?.total_tenants ?? 0)}
            </h2>
            <span className="text-xs text-emerald-500 font-mono mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">arrow_upward</span>+{metrics?.new_tenants_this_month ?? 0}
            </span>
          </div>
          <p className="text-[10px] text-[#555555] mt-2">
            {loading ? '—' : `${metrics?.active_tenants ?? 0} active · ${metrics?.new_tenants_this_month ?? 0} new this month`}
          </p>
          <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[120px] opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">store</span>
        </div>

        {/* Platform MRR */}
        <div className="bg-[#201f1f] rounded-[10px] p-6 border border-[#C0272D]/30 relative overflow-hidden group hover:bg-[#2a2a2a] transition-all shadow-[0_0_40px_rgba(192,39,45,0.08)]">
          <div className="absolute inset-0 bg-linear-to-br from-[#C0272D1A] to-transparent pointer-events-none" />
          <p className="text-[0.6875rem] font-bold text-[#ffb3ae] tracking-widest uppercase mb-4">Platform MRR</p>
          <div className="flex items-end gap-2">
            <h2 className="text-[48px] font-bold font-mono text-[#e5e2e1] leading-none">
              {loading ? '—' : formatINR(metrics?.total_mrr ?? 0)}
            </h2>
          </div>
          <p className="text-[10px] font-mono text-[#555555] mt-2 italic">
            {loading ? '—' : `+${formatINR(metrics?.new_mrr_this_month ?? 0)} this month`}
          </p>
        </div>

        {/* Orders Today */}
        <div className="bg-[#201f1f] rounded-[10px] p-6 border border-[#2A2A2A] relative overflow-hidden group hover:bg-[#2a2a2a] transition-all">
          <p className="text-[0.6875rem] font-bold text-[#555555] uppercase tracking-widest mb-4">Orders Today</p>
          <div className="flex items-end gap-2">
            <h2 className="text-[48px] font-bold font-mono text-[#e5e2e1] leading-none">
              {loading ? '—' : formatCount(metrics?.orders_today ?? 0)}
            </h2>
            <span className="text-xs text-emerald-500 font-mono mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">trending_up</span>
            </span>
          </div>
          <p className="text-[10px] text-[#555555] mt-2">
            {loading ? '—' : `${metrics?.orders_this_week ?? 0} this week`}
          </p>
          <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-[120px] opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">receipt_long</span>
        </div>

        {/* System Health */}
        <div className="bg-[#201f1f] rounded-[10px] p-6 border border-[#2A2A2A] relative overflow-hidden group hover:bg-[#2a2a2a] transition-all">
          <div className="flex justify-between items-start mb-4">
            <p className="text-[0.6875rem] font-bold text-[#555555] uppercase tracking-widest">
              System Health
            </p>
            {health && (
              <span className="text-[9px] font-mono text-[#555] flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${health.overall === 'ok' ? 'bg-emerald-400 animate-pulse' : health.overall === 'degraded' ? 'bg-amber-400 animate-pulse' : 'bg-[#C0272D]'}`} />
                LIVE
              </span>
            )}
          </div>

          <h2 className={`text-[48px] font-bold font-mono leading-none ${
            healthLoading ? 'text-[#555]' :
            health?.overall === 'ok' ? 'text-emerald-400' :
            health?.overall === 'degraded' ? 'text-amber-400' : 'text-[#C0272D]'
          }`}>
            {healthLoading ? '—' : `${health?.percentage ?? 0}%`}
          </h2>

          {/* Service indicators */}
          <div className="mt-4 grid grid-cols-2 gap-y-2 gap-x-3">
            {health && ([
              { key: 'db',      label: 'Database' },
              { key: 'orders',  label: 'Orders'   },
              { key: 'auth',    label: 'Auth'     },
              { key: 'storage', label: 'Storage'  },
            ] as const).map(({ key, label }) => {
              const svc = health.services[key]
              const color = svc.status === 'ok' ? 'bg-emerald-400' : svc.status === 'degraded' ? 'bg-amber-400' : 'bg-[#C0272D]'
              const textColor = svc.status === 'ok' ? 'text-emerald-400' : svc.status === 'degraded' ? 'text-amber-400' : 'text-[#C0272D]'
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
                  <span className="text-[9px] font-mono text-[#555]">{label}</span>
                  <span className={`text-[9px] font-mono ml-auto ${textColor}`}>
                    {svc.status === 'down' ? 'DOWN' : `${svc.latencyMs}ms`}
                  </span>
                </div>
              )
            })}
          </div>

          {health && (
            <p className="text-[9px] font-mono text-[#333] mt-3">
              Last checked {new Date(health.checkedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* MRR Growth Chart */}
        <div className="lg:col-span-2 bg-[#201f1f] rounded-[10px] p-8 border border-[#2A2A2A]">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight text-[#e5e2e1]">MRR Growth</h3>
              <p className="text-xs text-[#555555]">Cumulative MRR across all tenants</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Range toggles */}
              <div className="flex gap-1">
                {(['1M','3M','6M','1Y'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setChartRange(r)}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-tighter rounded border transition-colors ${
                      chartRange === r
                        ? 'bg-[#C0272D] text-white border-[#C0272D]'
                        : 'bg-[#1c1b1b] text-[#555555] border-[#2A2A2A] hover:text-[#F5F5F5]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {/* Chart type toggles */}
              <div className="flex gap-1">
                {([
                  { type: 'area', icon: 'area_chart' },
                  { type: 'line', icon: 'show_chart' },
                  { type: 'bar',  icon: 'bar_chart'  },
                ] as const).map(({ type, icon }) => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    title={type}
                    className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
                      chartType === type
                        ? 'bg-[#C0272D]/20 text-[#ffb3ae] border-[#C0272D]/40'
                        : 'bg-[#1c1b1b] text-[#555555] border-[#2A2A2A] hover:text-[#F5F5F5]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{icon}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="h-[220px] w-full relative">
            <div className="flex h-full gap-3">
              {/* Y-axis */}
              <div className="flex flex-col justify-between pb-7 text-right shrink-0 w-14">
                {yLabels.map((v, i) => (
                  <span key={i} className="font-mono text-[9px] text-[#555555]">{formatINR(Math.round(v))}</span>
                ))}
              </div>
              {/* Chart area */}
              <div className="flex-1 flex flex-col min-w-0">
                <svg
                  ref={svgRef}
                  className="w-full flex-1 cursor-crosshair"
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  preserveAspectRatio="none"
                  onMouseMove={handleSvgMouseMove}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <defs>
                    <linearGradient id="mrrGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#C0272D" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#C0272D" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[0, 0.5, 1].map((v, i) => (
                    <line
                      key={i}
                      x1="0" y1={chartH - v * (chartH - 16) - 8}
                      x2={chartW} y2={chartH - v * (chartH - 16) - 8}
                      stroke="#2A2A2A" strokeWidth="1"
                    />
                  ))}

                  {/* Area chart */}
                  {chartType === 'area' && pts.length > 1 && (
                    <>
                      <path d={areaD} fill="url(#mrrGrad)" />
                      <path d={pathD} fill="none" stroke="#C0272D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  )}

                  {/* Line chart */}
                  {chartType === 'line' && pts.length > 1 && (
                    <path d={pathD} fill="none" stroke="#C0272D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
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
                        fillOpacity="0.7"
                        rx="3"
                      />
                    )
                  })}

                  {/* Hover dot */}
                  {tooltip && pts.length > 0 && (() => {
                    const nearest = filteredChart.findIndex((d) => d.label === tooltip.label)
                    if (nearest < 0) return null
                    return (
                      <>
                        <line x1={pts[nearest].x} y1="0" x2={pts[nearest].x} y2={chartH} stroke="#C0272D" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.5" />
                        <circle cx={pts[nearest].x} cy={pts[nearest].y} r="5" fill="#C0272D" stroke="#201f1f" strokeWidth="2" />
                      </>
                    )
                  })()}
                </svg>

                {/* X-axis labels */}
                <div className="flex justify-between mt-2 px-1">
                  {filteredChart.map((d, i) => (
                    <span key={i} className="font-mono text-[9px] text-[#555555]">{d.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Distribution Donut */}
        <div className="bg-[#201f1f] rounded-[10px] p-8 border border-[#2A2A2A] flex flex-col">
          <h3 className="text-lg font-bold tracking-tight text-[#e5e2e1] mb-1">Plan Distribution</h3>
          <p className="text-xs text-[#555555] mb-6">Subscriber tier analytics</p>
          <div className="flex-1 flex flex-col justify-center items-center relative">
            <svg className="w-44 h-44 transform -rotate-90">
              {donutSegs.map((seg, i) => (
                <circle
                  key={i}
                  cx="88" cy="88"
                  r="70"
                  fill="transparent"
                  stroke={hoveredPlan === seg.label ? '#ff4444' : seg.color}
                  strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                  strokeDashoffset={circumference - (donutSegs.slice(0, i).reduce((s, d) => s + d.dash, 0))}
                  strokeWidth={hoveredPlan === seg.label ? 28 : 22}
                  strokeLinecap="butt"
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredPlan(seg.label)}
                  onMouseLeave={() => setHoveredPlan(null)}
                />
              ))}
              {totalPlan === 0 && (
                <circle cx="88" cy="88" r="70" fill="transparent" stroke="#2A2A2A" strokeWidth="22" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {hoveredPlan ? (
                <>
                  <span className="text-2xl font-bold font-mono text-[#e5e2e1]">
                    {planData.find(p => p.label === hoveredPlan)?.value ?? 0}
                  </span>
                  <span className="text-[10px] text-[#ffb3ae] uppercase tracking-tighter font-bold">{hoveredPlan}</span>
                  <span className="text-[9px] text-[#555] mt-0.5">
                    {Math.round(((planData.find(p => p.label === hoveredPlan)?.value ?? 0) / totalPlan) * 100)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-bold font-mono text-[#e5e2e1]">
                    {loading ? '—' : formatCount(metrics?.total_tenants ?? 0)}
                  </span>
                  <span className="text-[10px] text-[#555555] uppercase tracking-tighter font-bold">Tenants</span>
                </>
              )}
            </div>
          </div>
          <div className="space-y-3 mt-6">
            {planData.map((d, i) => {
              const pct = totalPlan > 0 ? Math.round((d.value / totalPlan) * 100) : 0
              const colors = ['#555555', '#888888', '#C0272D']
              return (
                <div
                  key={i}
                  className={`flex justify-between items-center cursor-pointer rounded px-1 py-0.5 transition-colors ${hoveredPlan === d.label ? 'bg-[#2A2A2A]' : ''}`}
                  onMouseEnter={() => setHoveredPlan(d.label)}
                  onMouseLeave={() => setHoveredPlan(null)}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i] }} />
                    <span className="text-xs text-[#e3bebb]">{d.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[#555]">{d.value}</span>
                    <span className="font-mono text-xs text-[#e5e2e1]">{loading ? '—' : `${pct}%`}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Recent Tenants Table */}
      <section className="bg-[#201f1f] rounded-[10px] overflow-hidden border border-[#2A2A2A]">
        <div className="px-8 py-6 flex justify-between items-center">
          <h3 className="text-lg font-bold tracking-tight text-[#e5e2e1]">Recent Tenants</h3>
          <button
            onClick={() => router.push('/dashboard/tenants')}
            className="text-xs font-bold text-[#ffb3ae] uppercase tracking-widest hover:underline transition-all"
          >
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#1c1b1b] border-y border-[#2A2A2A]/50">
              <tr>
                {['Restaurant Name', 'Plan', 'MRR', 'Status', 'Joined', 'Actions'].map((h, i) => (
                  <th key={h} className={`px-8 py-4 text-[10px] font-bold text-[#555555] uppercase tracking-widest ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]/30">
              {loading && (
                <tr><td colSpan={6} className="px-8 py-8 text-xs text-[#555] text-center">Loading...</td></tr>
              )}
              {!loading && tenants.length === 0 && (
                <tr><td colSpan={6} className="px-8 py-8 text-xs text-[#555] text-center">No tenants found</td></tr>
              )}
              {tenants.map((t) => {
                const initials = t.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                const joined = new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
                return (
                  <tr key={t.id} className="hover:bg-[#2a2a2a] transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-[#2A2A2A] flex items-center justify-center text-xs font-bold text-[#e5e2e1]">
                          {initials}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-[#e5e2e1] capitalize">{t.name}</span>
                          <span className="text-[10px] font-mono text-[#555555]">{t.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5"><PlanBadge plan={t.plan} /></td>
                    <td className="px-8 py-5 font-mono text-sm text-emerald-500 font-bold">{formatINR(t.mrr)}</td>
                    <td className="px-8 py-5"><StatusDot status={t.status} /></td>
                    <td className="px-8 py-5 font-mono text-xs text-[#555555]">{joined}</td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end items-center gap-2 relative">
                        <button
                          onClick={() => router.push(`/dashboard/tenants/${t.id}`)}
                          className="px-3 py-1 text-[10px] font-bold uppercase text-[#e5e2e1] hover:bg-[#353534] transition-colors rounded border border-[#2A2A2A]"
                        >
                          View
                        </button>
                        <div
                          ref={el => { actionRefs.current[t.id] = el }}
                          className="relative"
                        >
                          <button
                            onClick={() => setActionMenu(prev => prev === t.id ? null : t.id)}
                            className="p-1 hover:bg-[#353534] rounded transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm text-[#555555]">more_vert</span>
                          </button>
                          {actionMenu === t.id && (
                            <div className="absolute right-0 top-8 w-40 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 overflow-hidden">
                              {[
                                { label: 'View Details', icon: 'open_in_new', action: () => router.push(`/dashboard/tenants/${t.id}`) },
                                { label: 'Edit Tenant',  icon: 'edit',        action: () => router.push(`/dashboard/tenants/${t.id}/edit`) },
                                { label: t.status === 'active' ? 'Suspend' : 'Activate', icon: t.status === 'active' ? 'block' : 'check_circle', action: () => {} },
                              ].map(item => (
                                <button
                                  key={item.label}
                                  onClick={() => { item.action(); setActionMenu(null) }}
                                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-[#e3bebb] hover:bg-[#2A2A2A] transition-colors text-left"
                                >
                                  <span className="material-symbols-outlined text-sm text-[#555]">{item.icon}</span>
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
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
