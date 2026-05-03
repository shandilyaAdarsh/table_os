'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatINR } from '@/lib/formatINR'

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
}

type FilterKey = 'all' | 'active' | 'trial' | 'suspended' | 'pro' | 'enterprise' | 'starter'

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return (
    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Active
    </span>
  )
  if (status === 'trial') return (
    <span className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />Trial
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Suspended
    </span>
  )
}

function PlanBadge({ plan }: { plan: string }) {
  const p = plan?.toLowerCase()
  if (p === 'enterprise') return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#C0272D15] text-[#ffb3ae] border border-[#C0272D33] mt-1">ENTERPRISE</span>
  )
  if (p === 'pro') return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#2A2A2A] text-[#c8c6c5] border border-[#353534] mt-1">PRO</span>
  )
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#2A2A2A] text-[#555555] border border-[#2A2A2A] mt-1">STARTER</span>
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
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null)

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

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',        label: 'ALL'        },
    { key: 'active',     label: 'ACTIVE'     },
    { key: 'trial',      label: 'TRIAL'      },
    { key: 'suspended',  label: 'SUSPENDED'  },
    { key: 'pro',        label: 'PRO'        },
    { key: 'enterprise', label: 'ENTERPRISE' },
    { key: 'starter',    label: 'STARTER'    },
  ]

  return (
    <div className="p-8 max-w-7xl w-full mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight text-[#e5e2e1]">Tenants Management</h2>
          <p className="text-[#c8c6c5] text-sm">
            {loading ? 'Loading...' : `${total} restaurant${total !== 1 ? 's' : ''} on the platform`}
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/onboard')}
          className="bg-[#C0272D] hover:bg-[#A31D23] text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all active:scale-95 text-sm"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Onboard New Restaurant
        </button>
      </div>

      {/* Search + Filters */}
      <div className="space-y-4">
        <div className="relative group">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#555555] group-focus-within:text-[#ffb3ae] transition-colors">search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#141414] border border-[#2A2A2A] rounded-[10px] py-4 pl-12 pr-16 text-[#e5e2e1] focus:outline-none focus:ring-1 focus:ring-[#ffb3ae] focus:border-[#ffb3ae] transition-all placeholder:text-[#555555]"
            placeholder="Search by restaurant name, location, or slug..."
            type="text"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#e5e2e1] transition-colors"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                activeFilter === f.key
                  ? 'bg-[#C0272D] text-white'
                  : 'bg-[#1A1A1A] text-[#888888] hover:text-[#e5e2e1]'
              }`}
            >
              {f.label} <span className="ml-1 opacity-60 font-mono">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tenant Grid */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-[#141414] border border-[#2A2A2A] rounded-[12px] p-6 animate-pulse h-52" />
          ))}
        </div>
      ) : tenants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="material-symbols-outlined text-[#555] text-5xl mb-4">store_off</span>
          <p className="text-[#555] text-sm">No tenants found</p>
          {search && <p className="text-[#333] text-xs mt-1">Try clearing the search</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {tenants.map((t) => (
            <div
              key={t.id}
              className="bg-[#141414] border border-[#2A2A2A] rounded-[12px] p-6 hover:border-[#C0272D66] transition-all duration-300 group relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-[3px] h-0 bg-[#C0272D] group-hover:h-full transition-all duration-300" />

              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0 ${
                    t.status === 'active' ? 'bg-[#C0272D] text-white shadow-lg shadow-[#C0272D1A]' : 'bg-[#353534] text-[#c8c6c5]'
                  }`}>
                    {t.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-lg font-bold text-white truncate">{t.name}</h3>
                    <div className="flex items-center gap-1 text-[#555555] text-xs">
                      <span className="material-symbols-outlined text-sm">location_on</span>
                      <span className="truncate">{t.location || '—'}</span>
                    </div>
                    <PlanBadge plan={t.plan} />
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </div>

              <div className="grid grid-cols-3 gap-4 py-5 border-y border-[#2A2A2A]/50">
                <div className="space-y-1">
                  <p className="text-[10px] text-[#555555] uppercase tracking-tighter font-semibold">Orders Today</p>
                  <p className={`font-mono text-lg font-bold ${t.orders_today === 0 ? 'text-[#555555]' : 'text-[#e5e2e1]'}`}>
                    {t.orders_today}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-[#555555] uppercase tracking-tighter font-semibold">MRR</p>
                  <p className={`font-mono text-lg font-bold ${t.status === 'suspended' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatINR(t.mrr)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-[#555555] uppercase tracking-tighter font-semibold">Tables</p>
                  <p className="font-mono text-lg font-bold text-[#e5e2e1]">
                    {t.total_tables > 0 ? `${t.occupied_tables}/${t.total_tables}` : '—'}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-between items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/dashboard/tenants/${t.id}`)}
                    className="px-4 py-2 text-xs font-bold text-[#c8c6c5] hover:text-white hover:bg-[#2A2A2A] rounded-lg transition-colors border border-[#2A2A2A]"
                  >
                    View Details
                  </button>
                  {t.id !== currentTenantId && (
                    <button
                      disabled={deletingId === t.id}
                      onClick={() => handleDelete(t)}
                      className="w-9 h-9 flex items-center justify-center text-red-500 hover:text-white hover:bg-red-600 rounded-lg transition-all border border-red-900/30 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                      title="Delete Tenant"
                    >
                      {deletingId === t.id ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="material-symbols-outlined text-lg">delete</span>
                      )}
                    </button>
                  )}
                </div>
                <span className="text-[10px] font-mono text-[#333]">
                  {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex justify-between items-center pt-8 border-t border-[#2A2A2A]/50">
          <p className="text-xs font-mono text-[#555555]">
            SHOWING {Math.min((page - 1) * 6 + 1, total)}–{Math.min(page * 6, total)} OF {total} TENANTS
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded bg-[#201f1f] text-[#555555] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`p-2 rounded font-mono text-xs px-4 transition-colors ${
                  page === p
                    ? 'bg-[#C0272D] text-white'
                    : 'bg-[#201f1f] text-[#555555] hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="p-2 rounded bg-[#201f1f] text-[#555555] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
