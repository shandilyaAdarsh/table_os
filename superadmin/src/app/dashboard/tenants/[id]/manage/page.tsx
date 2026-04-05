'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function ManageTenantPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    fetch(`/api/tenants/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="text-[#555] text-sm font-mono animate-pulse">Loading...</div>
    </div>
  )

  const { tenant, staff, tables } = data

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <button
        onClick={() => router.push(`/dashboard/tenants/${id}`)}
        className="flex items-center gap-2 text-xs text-[#555] hover:text-[#e5e2e1] transition-colors font-mono"
      >
        <span className="material-symbols-outlined text-sm">arrow_back</span>
        BACK TO {tenant.name.toUpperCase()}
      </button>

      <div>
        <h2 className="text-2xl font-bold text-[#e5e2e1]">Manage Access</h2>
        <p className="text-[#555] text-sm mt-1">{tenant.name} · Staff & permissions</p>
      </div>

      {/* Staff list */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-[12px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2A2A2A] flex justify-between items-center">
          <h3 className="text-sm font-bold text-[#e5e2e1]">Staff Members</h3>
          <span className="text-[10px] font-mono text-[#555]">{staff.length} TOTAL</span>
        </div>
        {staff.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#555]">No staff added yet</div>
        ) : (
          <div className="divide-y divide-[#2A2A2A]/50">
            {staff.map((s: any) => (
              <div key={s.id} className="px-6 py-4 flex justify-between items-center hover:bg-[#1c1b1b] transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#2A2A2A] flex items-center justify-center text-xs font-bold text-[#e5e2e1]">
                    {s.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#e5e2e1]">{s.name}</p>
                    <p className="text-[10px] font-mono text-[#555] mt-0.5">PIN: {s.pin}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                    s.role === 'owner' ? 'bg-[#C0272D20] text-[#ffb3ae]' :
                    s.role === 'manager' ? 'bg-[#1A2A1A] text-emerald-400' :
                    'bg-[#2A2A2A] text-[#555]'
                  }`}>{s.role}</span>
                  <button className="text-[#555] hover:text-red-400 transition-colors">
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-[#141414] border border-red-900/40 rounded-[12px] p-6">
        <h3 className="text-sm font-bold text-red-400 mb-4">Danger Zone</h3>
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs font-medium text-[#c8c6c5]">Suspend this restaurant</p>
            <p className="text-[10px] text-[#555] mt-0.5">Disables all access immediately. Reversible.</p>
          </div>
          <button
            onClick={async () => {
              if (!confirm('Suspend this restaurant?')) return
              await fetch(`/api/tenants/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: tenant.status === 'suspended' ? 'active' : 'suspended' }),
              })
              router.push('/dashboard/tenants')
            }}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              tenant.status === 'suspended'
                ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'
                : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
            }`}
          >
            {tenant.status === 'suspended' ? 'Reactivate' : 'Suspend'}
          </button>
        </div>
      </div>
    </div>
  )
}
