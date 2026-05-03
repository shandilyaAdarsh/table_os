'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Tenant {
  id: string
  name: string
  plan: string
  mrr: number
  status: string
  created_at: string
}

export default function BillingPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTenants() {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (!error && data) {
        setTenants(data)
      }
      setLoading(false)
    }
    fetchTenants()
  }, [])

  const totalMRR = tenants.reduce((acc, tenant) => acc + (tenant.mrr || 0), 0)

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header & Stats */}
      <div className="flex justify-between items-end border-b border-[#2A2A2A] pb-8">
        <div>
          <h2 className="text-3xl font-black text-[#e5e2e1] tracking-tight">Billing Management</h2>
          <p className="text-[#555555] text-sm font-mono mt-1 uppercase tracking-widest">Revenue Oversight — v4.2</p>
        </div>
        <div className="bg-[#131212] border border-[#2A2A2A] rounded-xl px-6 py-4 flex flex-col items-end">
          <span className="text-[10px] font-bold text-[#555555] uppercase tracking-widest mb-1">Total Portfolio MRR</span>
          <span className="text-2xl font-black text-[#e5e2e1]">₹{totalMRR.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-[#131212] border border-[#2A2A2A] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2A2A2A] bg-[#0d0d0d]">
                <th className="px-6 py-4 text-[10px] font-bold text-[#555555] uppercase tracking-widest">Restaurant Name</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[#555555] uppercase tracking-widest">Plan</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[#555555] uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[#555555] uppercase tracking-widest">Joined Date</th>
                <th className="px-6 py-4 text-[10px] font-bold text-[#555555] uppercase tracking-widest text-right">MRR (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#555555] font-mono text-xs italic">
                    Fetching financial data...
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#555555] font-mono text-xs italic">
                    No active tenants found.
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-[#1c1b1b] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-[#e5e2e1] group-hover:text-white transition-colors">{tenant.name}</div>
                      <div className="text-[10px] font-mono text-[#555555] mt-0.5">ID: {tenant.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-[#e5e2e1] bg-[#2A2A2A] px-2 py-1 rounded border border-[#333] capitalize">
                        {tenant.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-yellow-500'}`} />
                        <span className="text-xs font-medium text-[#e5e2e1] capitalize">{tenant.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-[#555555] font-mono">
                      {new Date(tenant.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-mono font-bold text-[#e5e2e1]">₹{(tenant.mrr || 0).toLocaleString('en-IN')}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
