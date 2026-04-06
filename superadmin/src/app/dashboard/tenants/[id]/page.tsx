'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid
} from 'recharts'

// ─── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`
  return `₹${n}`
}
function fmtFull(n: number) {
  return `₹${n.toLocaleString('en-IN')}`
}
function ago(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const d = Math.floor(diff / 86400000)
  const m = Math.floor(diff / 2592000000)
  const y = Math.floor(diff / 31536000000)
  if (y > 0) return `${y}y ago`
  if (m > 0) return `${m}mo ago`
  if (d > 0) return `${d}d ago`
  return 'Today'
}

// ─── sub-components ─────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color = 'text-[#e5e2e1]', icon }: any) {
  return (
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-[12px] p-5 space-y-2 hover:border-[#C0272D44] transition-colors group">
      <div className="flex justify-between items-start">
        <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest">{label}</p>
        <span className="material-symbols-outlined text-[#333] group-hover:text-[#C0272D] transition-colors text-base">{icon}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#333]">{sub}</p>}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending:  '#F59E0B',
  cooking:  '#3B82F6',
  ready:    '#8B5CF6',
  served:   '#10B981',
  cancelled:'#EF4444',
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1c1b1b] border border-[#2A2A2A] rounded-lg p-3 text-xs shadow-xl">
      <p className="text-[#555] mb-1 font-mono">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-bold">
          {p.name === 'revenue' ? fmt(p.value) : p.value} {p.name}
        </p>
      ))}
    </div>
  )
}

// ─── main page ───────────────────────────────────────────────────────────────
export default function TenantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeChart, setActiveChart] = useState<'revenue' | 'orders'>('revenue')
  const [chartType, setChartType] = useState<'area' | 'bar'>('area')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', location: '', plan: '', status: '' })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = () => {
    if (!id) return
    fetch(`/api/tenants/${id}`)
      .then(r => { if (!r.ok) { setNotFound(true); setLoading(false); return null } return r.json() })
      .then(d => {
        if (d) {
          setData(d)
          setEditForm({ name: d.tenant.name, location: d.tenant.location || '', plan: d.tenant.plan, status: d.tenant.status })
          setLoading(false)
        }
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  if (loading) return (
    <div className="p-8 flex flex-col items-center justify-center h-96 gap-4">
      <div className="w-8 h-8 border-2 border-[#C0272D] border-t-transparent rounded-full animate-spin" />
      <p className="text-[#555] text-xs font-mono animate-pulse">LOADING TENANT DATA...</p>
    </div>
  )

  if (notFound || !data) return (
    <div className="p-8 flex flex-col items-center justify-center h-64 gap-4">
      <span className="material-symbols-outlined text-5xl text-[#555]">store_off</span>
      <p className="text-[#555] text-sm">Tenant not found</p>
      <button onClick={() => router.push('/dashboard/tenants')} className="text-xs text-[#ffb3ae] hover:underline">← Back to tenants</button>
    </div>
  )

  const {
    tenant, recentOrders, tables, staff,
    ordersToday, revenueToday, dailyChart,
    statusBreakdown, totalRevenue30, totalOrders30,
    avgOrderValue, topItems,
  } = data

  const initials = tenant.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const occupiedTables = tables.filter((t: any) => t.status === 'occupied').length
  const onboardedDate = new Date(tenant.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  const daysOnPlatform = Math.floor((Date.now() - new Date(tenant.created_at).getTime()) / 86400000)
  const occupancyRate = tables.length > 0 ? Math.round((occupiedTables / tables.length) * 100) : 0

  // MRR projected annual
  const annualRun = (tenant.mrr ?? 0) * 12

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">

      {/* ── Back ─────────────────────────────────────────────────────────── */}
      <button
        onClick={() => router.push('/dashboard/tenants')}
        className="flex items-center gap-2 text-[10px] text-[#555] hover:text-[#e5e2e1] transition-colors font-mono tracking-widest"
      >
        <span className="material-symbols-outlined text-sm">arrow_back</span>
        BACK TO TENANTS
      </button>

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] p-8 relative overflow-hidden">
        {/* Red left accent */}
        <div className="absolute top-0 left-0 w-[3px] h-full bg-linear-to-b from-[#C0272D] via-[#C0272D88] to-transparent" />
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />

        <div className="relative flex flex-wrap gap-8 justify-between items-start">
          {/* Left: identity */}
          <div className="flex gap-6 items-center">
            <div className="w-20 h-20 rounded-2xl bg-linear-to-br from-[#C0272D] to-[#8B0000] flex items-center justify-center text-3xl font-black text-white shadow-2xl shadow-[#C0272D30] shrink-0">
              {initials}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-black text-[#e5e2e1] tracking-tight">{tenant.name}</h1>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1 text-[#555]">
                  <span className="material-symbols-outlined text-sm">location_on</span>
                  {tenant.location || '—'}
                </span>
                <span className="text-[#2A2A2A]">·</span>
                <span className="text-[#555]">/{tenant.slug}</span>
                <span className="text-[#2A2A2A]">·</span>
                <span className={`font-bold ${tenant.status === 'active' ? 'text-emerald-400' : tenant.status === 'trial' ? 'text-amber-400' : 'text-red-400'}`}>
                  ● {tenant.status.toUpperCase()}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 items-center mt-1">
                {/* Plan badge */}
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                  tenant.plan === 'enterprise' ? 'bg-[#C0272D20] text-[#ffb3ae] border border-[#C0272D40]' :
                  tenant.plan === 'pro'        ? 'bg-[#1c2a1c] text-emerald-400 border border-emerald-900/50' :
                                                 'bg-[#2A2A2A] text-[#555] border border-[#333]'
                }`}>{tenant.plan}</span>
                {/* Onboarded */}
                <span className="text-[10px] font-mono text-[#444]">
                  Onboarded {onboardedDate} · {daysOnPlatform} days on platform
                </span>
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setEditOpen(true)}
              className="px-5 py-2.5 text-xs font-bold border border-[#2A2A2A] text-[#c8c6c5] rounded-xl hover:bg-[#2A2A2A] hover:border-[#444] transition-all"
            >
              Edit Tenant
            </button>
            <button
              onClick={() => router.push(`/dashboard/tenants/${id}/manage`)}
              className="px-5 py-2.5 text-xs font-bold bg-[#C0272D] hover:bg-[#A31D23] text-white rounded-xl transition-all shadow-lg shadow-[#C0272D30] active:scale-95"
            >
              Manage Access
            </button>
          </div>
        </div>

        {/* Quick stats strip */}
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#2A2A2A] rounded-xl mt-8 overflow-hidden">
          {[
            { label: 'Monthly MRR',    value: fmt(tenant.mrr ?? 0),     color: 'text-emerald-400' },
            { label: 'Annual Run Rate', value: fmt(annualRun),           color: 'text-emerald-300' },
            { label: 'Avg Order Value', value: fmt(avgOrderValue),       color: 'text-[#e5e2e1]'  },
            { label: 'Occupancy Now',   value: `${occupancyRate}%`,      color: occupancyRate > 50 ? 'text-amber-400' : 'text-[#e5e2e1]' },
          ].map(s => (
            <div key={s.label} className="bg-[#141414] px-5 py-4">
              <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest">{s.label}</p>
              <p className={`text-xl font-black font-mono mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Revenue Today"   value={fmt(revenueToday)}          sub="since midnight"          color="text-emerald-400" icon="payments"       />
        <KPICard label="Orders Today"    value={String(ordersToday)}        sub="since midnight"          color="text-[#e5e2e1]"  icon="receipt_long"   />
        <KPICard label="30-Day Revenue"  value={fmt(totalRevenue30)}        sub={`${totalOrders30} orders`} color="text-emerald-300" icon="trending_up"  />
        <KPICard label="Active Staff"    value={String(staff.length)}       sub={`${tables.length} tables total`} color="text-[#e5e2e1]" icon="group"   />
      </div>

      {/* ── Revenue / Orders Chart ────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#2A2A2A] flex flex-wrap gap-4 justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-[#e5e2e1]">Performance — Last 30 Days</h3>
            <p className="text-[10px] text-[#555] mt-0.5 font-mono">
              {activeChart === 'revenue' ? `Total: ${fmt(totalRevenue30)}` : `Total: ${totalOrders30} orders`}
            </p>
          </div>
          <div className="flex gap-2">
            {/* Toggle data */}
            <div className="flex bg-[#1c1b1b] rounded-lg p-1 gap-1">
              {(['revenue', 'orders'] as const).map(k => (
                <button key={k} onClick={() => setActiveChart(k)}
                  className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${activeChart === k ? 'bg-[#C0272D] text-white' : 'text-[#555] hover:text-[#e5e2e1]'}`}
                >{k}</button>
              ))}
            </div>
            {/* Toggle chart type */}
            <div className="flex bg-[#1c1b1b] rounded-lg p-1 gap-1">
              {(['area', 'bar'] as const).map(k => (
                <button key={k} onClick={() => setChartType(k)}
                  className={`p-1 rounded transition-colors ${chartType === k ? 'text-[#ffb3ae]' : 'text-[#555] hover:text-[#e5e2e1]'}`}
                >
                  <span className="material-symbols-outlined text-sm">{k === 'area' ? 'show_chart' : 'bar_chart'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6">
          <ResponsiveContainer width="100%" height={240}>
            {chartType === 'area' ? (
              <AreaChart data={dailyChart} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C0272D" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#C0272D" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ordGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1b1b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: '#555', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false}
                  tickFormatter={v => activeChart === 'revenue' ? fmt(v) : String(v)} width={45} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey={activeChart} stroke={activeChart === 'revenue' ? '#C0272D' : '#3B82F6'}
                  strokeWidth={2} fill={activeChart === 'revenue' ? 'url(#revGrad)' : 'url(#ordGrad)'} dot={false} activeDot={{ r: 4, fill: '#fff' }} />
              </AreaChart>
            ) : (
              <BarChart data={dailyChart} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1b1b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: '#555', fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false}
                  tickFormatter={v => activeChart === 'revenue' ? fmt(v) : String(v)} width={45} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey={activeChart} fill={activeChart === 'revenue' ? '#C0272D' : '#3B82F6'} radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Status Breakdown + Top Items ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Order Status Donut */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] p-6">
          <h3 className="text-sm font-bold text-[#e5e2e1] mb-1">Order Status Breakdown</h3>
          <p className="text-[10px] text-[#555] font-mono mb-5">Last 30 days · {totalOrders30} total</p>
          {statusBreakdown.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-xs text-[#555]">No orders yet</div>
          ) : (
            <div className="flex gap-6 items-center">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="count" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}>
                    {statusBreakdown.map((entry: any, i: number) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.status] ?? '#555'} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {statusBreakdown.map((s: any) => (
                  <div key={s.status} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] ?? '#555' }} />
                      <span className="text-[11px] text-[#c8c6c5] capitalize font-mono">{s.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#e5e2e1]">{s.count}</span>
                      <span className="text-[10px] text-[#555]">{totalOrders30 > 0 ? Math.round(s.count / totalOrders30 * 100) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Items */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2A2A2A] flex justify-between">
            <h3 className="text-sm font-bold text-[#e5e2e1]">Top Selling Items</h3>
            <span className="text-[10px] font-mono text-[#555]">BY QUANTITY</span>
          </div>
          {topItems.length === 0 ? (
            <div className="px-6 py-10 text-center text-xs text-[#555]">No sales data yet</div>
          ) : (
            <div className="divide-y divide-[#2A2A2A]/40">
              {topItems.map((item: any, i: number) => {
                const maxQty = topItems[0]?.qty ?? 1
                return (
                  <div key={item.name} className="px-6 py-3 hover:bg-[#1c1b1b] transition-colors">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#555] w-4">{i + 1}</span>
                        <span className="text-xs font-medium text-[#e5e2e1] truncate max-w-[180px]">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <span className="text-[10px] font-mono text-emerald-400">{fmt(item.revenue)}</span>
                        <span className="text-[10px] font-bold text-[#c8c6c5]">×{item.qty}</span>
                      </div>
                    </div>
                    <div className="h-1 bg-[#2A2A2A] rounded-full overflow-hidden">
                      <div className="h-full bg-linear-to-r from-[#C0272D] to-[#ff6b6b] rounded-full transition-all"
                        style={{ width: `${Math.round((item.qty / maxQty) * 100)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Orders ─────────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2A2A2A] flex justify-between items-center">
          <h3 className="text-sm font-bold text-[#e5e2e1]">Recent Orders</h3>
          <span className="text-[10px] font-mono text-[#555]">LAST 10</span>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#555]">No orders yet</div>
        ) : (
          <div className="divide-y divide-[#2A2A2A]/40">
            {recentOrders.map((o: any) => (
              <div key={o.id} className="px-6 py-4 hover:bg-[#1c1b1b] transition-colors grid grid-cols-4 items-center gap-4">
                <div>
                  <p className="text-xs font-mono font-bold text-[#e5e2e1]">Table {o.table_num || '—'}</p>
                  <p className="text-[10px] text-[#555] font-mono mt-0.5">
                    {new Date(o.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase font-mono">Items</p>
                  <p className="text-xs text-[#c8c6c5]">{o.order_items?.length ?? 0} items</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase font-mono">Amount</p>
                  <p className="text-sm font-bold font-mono text-emerald-400">{fmtFull(o.total_amount ?? 0)}</p>
                </div>
                <div className="flex justify-end">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                    o.status === 'served'    ? 'bg-emerald-900/30 text-emerald-400' :
                    o.status === 'cooking'   ? 'bg-blue-900/30 text-blue-400' :
                    o.status === 'pending'   ? 'bg-amber-900/30 text-amber-400' :
                    o.status === 'ready'     ? 'bg-purple-900/30 text-purple-400' :
                                               'bg-[#2A2A2A] text-[#555]'
                  }`}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Staff + Table Layout ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Staff */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2A2A2A] flex justify-between">
            <h3 className="text-sm font-bold text-[#e5e2e1]">Active Staff</h3>
            <span className="text-[10px] font-mono text-[#555]">{staff.length} MEMBERS</span>
          </div>
          {staff.length === 0 ? (
            <div className="px-6 py-10 text-center text-xs text-[#555]">No staff added yet</div>
          ) : (
            <div className="divide-y divide-[#2A2A2A]/40">
              {staff.map((s: any) => (
                <div key={s.id} className="px-6 py-3.5 flex justify-between items-center hover:bg-[#1c1b1b] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#2A2A2A] flex items-center justify-center text-[10px] font-bold text-[#e5e2e1]">
                      {s.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-[#e5e2e1]">{s.name}</p>
                      <p className="text-[10px] font-mono text-[#555] mt-0.5">PIN: {s.pin}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                    s.role === 'owner'   ? 'bg-[#C0272D20] text-[#ffb3ae]' :
                    s.role === 'manager' ? 'bg-[#1A2A1A] text-emerald-400' :
                    s.role === 'kitchen' ? 'bg-[#1a1a2a] text-blue-400' :
                                           'bg-[#2A2A2A] text-[#555]'
                  }`}>{s.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tables */}
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-[#e5e2e1]">Table Layout</h3>
            <span className="text-[10px] font-mono text-[#555]">{occupiedTables}/{tables.length} OCCUPIED</span>
          </div>
          {tables.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#555]">No tables configured</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {tables.map((t: any) => (
                  <div key={t.id} className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center text-center border transition-all ${
                    t.status === 'occupied'        ? 'bg-[#C0272D20] border-[#C0272D50] text-[#ffb3ae]' :
                    t.status === 'payment_pending' ? 'bg-amber-900/20 border-amber-900/40 text-amber-400' :
                    t.status === 'needs_bussing'   ? 'bg-blue-900/20 border-blue-900/40 text-blue-400' :
                                                      'bg-[#1c1b1b] border-[#2A2A2A] text-[#555]'
                  }`}>
                    <span className="text-[9px] font-mono font-bold">{t.table_num}</span>
                    <span className="text-[8px] opacity-60">{t.capacity}p</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 mt-4">
                {[
                  { label: 'Occupied',        color: 'bg-[#C0272D50]', count: tables.filter((t:any) => t.status === 'occupied').length },
                  { label: 'Available',       color: 'bg-[#2A2A2A]',   count: tables.filter((t:any) => t.status === 'vacant').length },
                  { label: 'Bill Pending',    color: 'bg-amber-900/40', count: tables.filter((t:any) => t.status === 'payment_pending').length },
                  { label: 'Needs Bussing',   color: 'bg-blue-900/40',  count: tables.filter((t:any) => t.status === 'needs_bussing').length },
                ].filter(s => s.count > 0).map(s => (
                  <div key={s.label} className="flex items-center gap-1.5 text-[10px] text-[#555]">
                    <div className={`w-2 h-2 rounded ${s.color}`} />
                    {s.label} ({s.count})
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Tenant Info Card ──────────────────────────────────────────────── */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-[16px] p-6">
        <h3 className="text-sm font-bold text-[#e5e2e1] mb-5">Tenant Information</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {[
            {
              label: 'Tenant ID',
              value: (
                <div className="flex items-center gap-2 bg-[#1c1b1b] rounded px-2 py-1 mt-1 border border-[#2A2A2A]">
                  <code className="text-[10px] font-mono text-[#c8c6c5] break-all select-all">
                    {tenant.id}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(tenant.id)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="shrink-0 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors font-bold"
                  >
                    {copied ? 'COPIED!' : 'COPY'}
                  </button>
                </div>
              )
            },
            { label: 'Slug',            value: '/' + tenant.slug },
            { label: 'Plan',            value: tenant.plan?.toUpperCase() },
            { label: 'Status',          value: tenant.status?.toUpperCase() },
            { label: 'Onboarded',       value: onboardedDate },
            { label: 'Days on Platform',value: `${daysOnPlatform} days` },
            { label: 'MRR',             value: fmtFull(tenant.mrr ?? 0) },
            { label: 'Annual Run Rate', value: fmtFull(annualRun) },
          ].map(row => (
            <div key={row.label}>
              <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest">{row.label}</p>
              {typeof row.value === 'string' ? (
                <p className="text-xs font-mono text-[#c8c6c5] mt-1">{row.value}</p>
              ) : (
                row.value
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141414] border border-[#2A2A2A] rounded-[20px] p-8 w-full max-w-md space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-[#e5e2e1]">Edit Tenant</h2>
              <button onClick={() => setEditOpen(false)} className="text-[#555] hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="space-y-4">
              {[
                { key: 'name',     label: 'Restaurant Name', type: 'text'   },
                { key: 'location', label: 'Location',        type: 'text'   },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-bold text-[#555] uppercase tracking-widest block mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={(editForm as any)[f.key]}
                    onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-[#1c1b1b] border border-[#2A2A2A] rounded-xl px-4 py-2.5 text-sm text-[#e5e2e1] focus:outline-none focus:border-[#ffb3ae] transition-colors"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-[#555] uppercase tracking-widest block mb-1.5">Plan</label>
                  <select value={editForm.plan} onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}
                    className="w-full bg-[#1c1b1b] border border-[#2A2A2A] rounded-xl px-4 py-2.5 text-sm text-[#e5e2e1] focus:outline-none focus:border-[#ffb3ae] transition-colors">
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#555] uppercase tracking-widest block mb-1.5">Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-[#1c1b1b] border border-[#2A2A2A] rounded-xl px-4 py-2.5 text-sm text-[#e5e2e1] focus:outline-none focus:border-[#ffb3ae] transition-colors">
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditOpen(false)}
                className="flex-1 py-2.5 text-xs font-bold border border-[#2A2A2A] text-[#c8c6c5] rounded-xl hover:bg-[#2A2A2A] transition-colors">
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true)
                  await fetch(`/api/tenants/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(editForm),
                  })
                  setSaving(false)
                  setEditOpen(false)
                  load()
                }}
                className="flex-1 py-2.5 text-xs font-bold bg-[#C0272D] hover:bg-[#A31D23] text-white rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
