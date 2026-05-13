'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { formatINR } from '@/lib/formatINR'

import type { CredentialInvite } from '@/lib/types'

type Tenant = {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  location: string
  mrr: number
  created_at: string
  orders_today: number
  total_tables: number
  occupied_tables: number
  credential_invite: CredentialInvite | null
}

type FilterKey = 'all' | 'active' | 'trial' | 'suspended' | 'pro' | 'enterprise' | 'starter'

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  if (s === 'active') return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse" />
      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Active</span>
    </div>
  )
  if (s === 'trial') return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Trial</span>
    </div>
  )
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#C0272D1A] border border-[#C0272D33]">
      <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Suspended</span>
    </div>
  )
}

function PlanBadge({ plan }: { plan: string }) {
  const p = plan?.toLowerCase()
  if (p === 'enterprise') return (
    <span className="inline-block px-2.5 py-0.5 rounded text-[9px] font-bold bg-[#C0272D1A] text-[#ffb3ae] border border-[#C0272D33] uppercase tracking-widest">Enterprise</span>
  )
  if (p === 'pro') return (
    <span className="inline-block px-2.5 py-0.5 rounded text-[9px] font-bold bg-[#1A1A1A] text-[#c8c6c5] border border-[#2A2A2A] uppercase tracking-widest">Pro</span>
  )
  return (
    <span className="inline-block px-2.5 py-0.5 rounded text-[9px] font-bold bg-[#0D0D0D] text-[#555555] border border-[#2A2A2A] uppercase tracking-widest">Starter</span>
  )
}

function DeliveryBadge({ status }: { status?: string }) {
  if (status === 'used') return (
    <div className="flex items-center gap-1.5 text-emerald-500/80" title="Admin logged in successfully">
      <span className="material-symbols-outlined text-[12px]">verified</span>
      <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">Verified</span>
    </div>
  )
  if (status === 'failed') return (
    <div className="flex items-center gap-1.5 text-[#C0272D]" title="Email delivery failed">
      <span className="material-symbols-outlined text-[12px]">error</span>
      <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">Failed</span>
    </div>
  )
  if (status === 'sent') return (
    <div className="flex items-center gap-1.5 text-amber-500/80" title="Credentials sent, waiting for login">
      <span className="material-symbols-outlined text-[12px]">forward_to_inbox</span>
      <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">Invited</span>
    </div>
  )
  return (
    <div className="flex items-center gap-1.5 text-[#333]" title="Preparing credentials">
      <span className="material-symbols-outlined text-[12px]">hourglass_bottom</span>
      <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">Pending</span>
    </div>
  )
}

export default function TenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [counts, setCounts] = useState({ all: 0, active: 0, trial: 0, suspended: 0, pro: 0, enterprise: 0, starter: 0 })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null)
  const [actionMenu, setActionMenu] = useState<string | null>(null)

  const actionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  // Get current session/profile for self-deletion protection
  useEffect(() => {
    import('@/lib/supabase').then(({ supabase }) => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          supabase.from('profiles').select('tenant_id').eq('id', user.id).single()
            .then(({ data }) => {
              if (data?.tenant_id) setCurrentTenantId(data.tenant_id)
            })
        }
      })
    })
  }, [])

  // Fetch tenant counts for filter badges
  useEffect(() => {
    Promise.all([
      fetch('/api/tenants?limit=1').then(r => r.json()),
      fetch('/api/tenants?status=active&limit=1').then(r => r.json()),
      fetch('/api/tenants?status=trial&limit=1').then(r => r.json()),
      fetch('/api/tenants?status=suspended&limit=1').then(r => r.json()),
      fetch('/api/tenants?plan=pro&limit=1').then(r => r.json()),
      fetch('/api/tenants?plan=enterprise&limit=1').then(r => r.json()),
      fetch('/api/tenants?plan=starter&limit=1').then(r => r.json()),
    ]).then(([all, active, trial, suspended, pro, enterprise, starter]) => {
      setCounts({
        all: all.total, active: active.total, trial: trial.total,
        suspended: suspended.total, pro: pro.total,
        enterprise: enterprise.total, starter: starter.total,
      })
    })
  }, [])

  // Fetch tenants
  const fetchTenants = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (debouncedSearch) params.set('q', debouncedSearch)
    if (['active','trial','suspended'].includes(activeFilter)) params.set('status', activeFilter)
    if (['pro','enterprise','starter'].includes(activeFilter)) params.set('plan', activeFilter)
    fetch(`/api/tenants?${params}`)
      .then(r => r.json())
      .then(data => {
        setTenants(data.tenants ?? [])
        setTotal(data.total ?? 0)
        setPages(data.pages ?? 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [page, debouncedSearch, activeFilter])

  useEffect(() => { fetchTenants() }, [fetchTenants])

  // Reset to page 1 when filter or search changes
  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilter])

  const handleDelete = async (t: Tenant) => {
    if (t.id === currentTenantId) {
      alert("You cannot delete your own tenant account.")
      return
    }

    const confirmMsg = `Delete ${t.name}? This will permanently remove ALL data including tables, orders, menu items, staff, and the admin account. This action is IRREVERSIBLE.`
    if (!confirm(confirmMsg)) return

    setDeletingId(t.id)
    try {
      const res = await fetch('/api/delete-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: t.id })
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to delete tenant')

      // Remove from UI
      setTenants(prev => prev.filter(item => item.id !== t.id))
      setTotal(prev => prev - 1)
      alert(`${t.name} has been successfully deleted.`)
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleResend = async (t: Tenant) => {
    if (!t.credential_invite) return
    const confirmMsg = `Regenerate password and resend credentials to ${t.credential_invite.email}?`
    if (!confirm(confirmMsg)) return

    try {
      const res = await fetch('/api/resend-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: t.id,
          email: t.credential_invite.email,
        })
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to resend credentials')
      
      alert(`Credentials regenerated and sent to ${t.credential_invite.email}`)
      fetchTenants() // refresh UI
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    }
  }

  const handleToggleStatus = async (t: Tenant) => {
    const isSuspended = t.status === 'suspended'
    const action = isSuspended ? 'reactivate' : 'suspend'
    const confirmMsg = `Are you sure you want to ${action} ${t.name}?`
    if (!confirm(confirmMsg)) return

    setTogglingId(t.id)
    try {
      const res = await fetch('/api/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: t.id, action })
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || `Failed to ${action} tenant`)
      
      alert(isSuspended ? `${t.name} has been reactivated.` : `${t.name} has been suspended.`)
      fetchTenants() // refresh UI
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setTogglingId(null)
    }
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',        label: 'Aggregated' },
    { key: 'active',     label: 'Active Nodes' },
    { key: 'trial',      label: 'Trial Phase' },
    { key: 'suspended',  label: 'Restricted' },
    { key: 'pro',        label: 'Pro Tier' },
    { key: 'enterprise', label: 'Enterprise Tier' },
    { key: 'starter',    label: 'Starter Tier' },
  ]

  return (
    <div className="p-8 max-w-[1440px] w-full mx-auto space-y-10 min-h-screen bg-[#131313]">
      
      {/* Header Section */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[#F5F5F5]">Restaurant Infrastructure</h1>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#C0272D] rounded-full" />
            <p className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em]">
              {loading ? 'Initializing Telemetry...' : `${total} active nodes currently deployed`}
            </p>
          </div>
        </div>
        <button
          onClick={() => router.push('/dashboard/onboard')}
          className="bg-[#C0272D] hover:bg-[#A31D23] text-white px-6 py-3 rounded-xl font-black flex items-center gap-3 transition-all active:scale-95 text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(192,39,45,0.2)]"
        >
          <span className="material-symbols-outlined text-lg">add_box</span>
          Deploy New Tenant
        </button>
      </div>

      {/* Control Panel: Search + Filters */}
      <div className="space-y-6">
        <div className="relative group">
          <span className="absolute left-5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#333] group-focus-within:text-[#C0272D] transition-colors">hub</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl py-5 pl-14 pr-16 text-[#F5F5F5] font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#C0272D]/50 focus:border-[#C0272D]/50 transition-all placeholder:text-[#333] placeholder:uppercase placeholder:tracking-widest"
            placeholder="Search Registry (Name, Location, UID)..."
            type="text"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-[#333] hover:text-[#C0272D] transition-colors"
            >
              <span className="material-symbols-outlined text-lg">cancel</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                activeFilter === f.key
                  ? 'bg-[#C0272D] text-white border-[#C0272D] shadow-[0_0_15px_rgba(192,39,45,0.25)]'
                  : 'bg-[#0D0D0D] text-[#555] border-[#2A2A2A] hover:text-[#F5F5F5] hover:border-[#C0272D]/30'
              }`}
            >
              {f.label} <span className={`ml-2 font-mono ${activeFilter === f.key ? 'text-white/60' : 'text-[#333]'}`}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Registry Grid */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-8 animate-pulse h-64" />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-[#0D0D0D] rounded-3xl border border-dashed border-[#2A2A2A]">
          <div className="w-16 h-16 bg-[#1A1A1A] rounded-2xl flex items-center justify-center mb-6 border border-[#2A2A2A]">
            <span className="material-symbols-outlined text-[#333] text-4xl">inventory_2</span>
          </div>
          <p className="text-[#555] text-[10px] font-black uppercase tracking-[0.2em]">Registry Search Terminated</p>
          <p className="text-[#333] text-[9px] mt-2 uppercase tracking-widest">No matching infrastructure found</p>
          {search && (
             <button onClick={() => setSearch('')} className="mt-8 text-[#C0272D] text-[9px] font-black uppercase tracking-widest hover:underline">Reset System Parameters</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {tenants.map((t) => (
            <div
              key={t.id}
              className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-8 hover:border-[#C0272D]/40 transition-all duration-500 group relative overflow-hidden"
            >
              {/* Subtle accent */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-[#C0272D] scale-x-0 group-hover:scale-x-100 transition-transform duration-700 origin-left opacity-60" />

              <div className="flex justify-between items-start mb-8">
                <div className="flex gap-5">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0 transition-all duration-500 ${
                    t.status === 'active' 
                      ? 'bg-[#C0272D] text-white shadow-[0_0_25px_rgba(192,39,45,0.2)]' 
                      : 'bg-[#0D0D0D] text-[#333] border border-[#2A2A2A]'
                  }`}>
                    {t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="space-y-1.5 min-w-0 pt-1">
                    <h3 className="text-xl font-black text-[#F5F5F5] tracking-tight truncate">{t.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-[#333] uppercase tracking-tighter">{t.slug}</span>
                      <div className="w-1 h-1 rounded-full bg-[#2A2A2A]" />
                      <div className="flex items-center gap-1.5 text-[#555] text-[10px] font-bold uppercase tracking-widest">
                        <span className="material-symbols-outlined text-[14px]">distance</span>
                        <span className="truncate">{t.location || 'GLOBAL_NODE'}</span>
                      </div>
                    </div>
                    <div className="pt-1">
                      <PlanBadge plan={t.plan} />
                    </div>
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <div className="grid grid-cols-3 gap-6 py-6 border-y border-[#2A2A2A]/40 mb-6">
                <div className="space-y-1">
                  <p className="text-[9px] text-[#333] uppercase tracking-[0.2em] font-black">Daily Volume</p>
                  <p className={`font-mono text-xl font-black ${t.orders_today === 0 ? 'text-[#333]' : 'text-[#F5F5F5]'}`}>
                    {t.orders_today}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-[#333] uppercase tracking-[0.2em] font-black">Contract Value</p>
                  <p className={`font-mono text-xl font-black ${t.status === 'suspended' ? 'text-red-900' : 'text-emerald-500'}`}>
                    {formatINR(t.mrr)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-[#333] uppercase tracking-[0.2em] font-black">Unit Utilization</p>
                  <p className="font-mono text-xl font-black text-[#F5F5F5]">
                    {t.total_tables > 0 ? `${t.occupied_tables}/${t.total_tables}` : '—'}
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex gap-3">
                  <button
                    onClick={() => router.push(`/dashboard/tenants/${t.id}`)}
                    className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#555] hover:text-[#F5F5F5] bg-[#0D0D0D] hover:bg-[#1A1A1A] rounded-xl border border-[#2A2A2A] transition-all"
                  >
                    System Profile
                  </button>
                  
                  {t.credential_invite?.delivery_status === 'failed' && (
                    <button
                      onClick={() => handleResend(t)}
                      className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#C0272D] hover:text-white bg-[#C0272D]/5 hover:bg-[#C0272D] rounded-xl border border-[#C0272D]/20 transition-all flex items-center gap-2"
                      title="Resend Access Tokens"
                    >
                      <span className="material-symbols-outlined text-[16px]">key</span> Overwrite
                    </button>
                  )}

                  {t.id !== currentTenantId && (
                    <div className="flex items-center gap-2 pl-2 border-l border-[#2A2A2A]/50">
                      <button
                        disabled={togglingId === t.id}
                        onClick={() => handleToggleStatus(t)}
                        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all border active:scale-95 disabled:opacity-30 ${
                          t.status === 'suspended'
                            ? 'text-emerald-500 bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500 hover:text-white'
                            : 'text-amber-500 bg-amber-500/5 border-amber-500/20 hover:bg-amber-500 hover:text-white'
                        }`}
                        title={t.status === 'suspended' ? 'Reactivate Node' : 'Initialize Suspension'}
                      >
                        {togglingId === t.id ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-lg">
                            {t.status === 'suspended' ? 'power_settings_new' : 'emergency_home'}
                          </span>
                        )}
                      </button>

                      <button
                        disabled={deletingId === t.id}
                        onClick={() => handleDelete(t)}
                        className="w-10 h-10 flex items-center justify-center text-[#C0272D] bg-[#C0272D1A] hover:bg-[#C0272D] hover:text-white rounded-xl border border-[#C0272D33] transition-all active:scale-95 disabled:opacity-30"
                        title="Decommission Node"
                      >
                        {deletingId === t.id ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-lg">delete_sweep</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col items-end">
                   <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-mono font-bold text-[#333] uppercase">Deployed:</span>
                      <span className="text-[9px] font-mono font-black text-[#555]">
                        {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                      </span>
                   </div>
                  <DeliveryBadge status={t.credential_invite?.delivery_status} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination: Terminal Style */}
      {!loading && total > 0 && (
        <div className="flex justify-between items-center py-10 border-t border-[#2A2A2A]/30">
          <p className="text-[9px] font-mono font-black text-[#333] uppercase tracking-[0.2em]">
            Displaying Indices {Math.min((page - 1) * 6 + 1, total)}—{Math.min(page * 6, total)} · Aggregate Count: {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#0D0D0D] border border-[#2A2A2A] text-[#333] hover:text-[#F5F5F5] hover:border-[#C0272D]/30 disabled:opacity-10 transition-all"
            >
              <span className="material-symbols-outlined">west</span>
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-10 h-10 rounded-xl font-mono text-[10px] font-black transition-all border ${
                  page === p
                    ? 'bg-[#C0272D] text-white border-[#C0272D] shadow-[0_0_15px_rgba(192,39,45,0.2)]'
                    : 'bg-[#0D0D0D] text-[#333] border-[#2A2A2A] hover:text-[#F5F5F5] hover:border-[#C0272D]/30'
                }`}
              >
                {String(p).padStart(2, '0')}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#0D0D0D] border border-[#2A2A2A] text-[#333] hover:text-[#F5F5F5] hover:border-[#C0272D]/30 disabled:opacity-10 transition-all"
            >
              <span className="material-symbols-outlined">east</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
