'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/formatINR'

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
    <div className="p-8 max-w-[1440px] w-full mx-auto space-y-12 pb-24 bg-[#131313] min-h-screen">
      
      {/* Header & Stats */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter text-[#F5F5F5]">Financial Oversight</h1>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#C0272D] rounded-full" />
            <p className="text-[10px] font-bold text-[#555555] uppercase tracking-[0.2em]">Revenue analysis and portfolio billing status</p>
          </div>
        </div>
        
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-8 flex flex-col items-end relative overflow-hidden group shadow-[0_0_30px_rgba(0,0,0,0.3)]">
          <div className="absolute top-0 right-0 w-1 h-full bg-[#C0272D] opacity-40 group-hover:opacity-100 transition-opacity" />
          <span className="text-[9px] font-black text-[#555] uppercase tracking-[0.3em] mb-2">Aggregate Portfolio MRR</span>
          <span className="text-3xl font-black text-[#F5F5F5] tracking-tight">{formatINR(totalMRR)}</span>
        </div>
      </div>

      {/* Main Registry Table */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.2)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2A2A2A] bg-[#0D0D0D]">
                <th className="px-8 py-5 text-[9px] font-black text-[#333] uppercase tracking-[0.3em]">Restaurant Entity</th>
                <th className="px-8 py-5 text-[9px] font-black text-[#333] uppercase tracking-[0.3em]">Allocation Tier</th>
                <th className="px-8 py-5 text-[9px] font-black text-[#333] uppercase tracking-[0.3em]">Node Status</th>
                <th className="px-8 py-5 text-[9px] font-black text-[#333] uppercase tracking-[0.3em]">Deployment Date</th>
                <th className="px-8 py-5 text-[9px] font-black text-[#333] uppercase tracking-[0.3em] text-right">MRR Yield</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A2A2A]/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-6 h-6 border-2 border-[#C0272D]/30 border-t-[#C0272D] rounded-full animate-spin" />
                      <span className="text-[9px] font-black text-[#333] uppercase tracking-[0.2em]">Synchronizing Financial Records...</span>
                    </div>
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
                      <span className="text-[9px] font-black text-[#555] uppercase tracking-[0.2em]">Zero Active Contracts in Registry</span>
                    </div>
                  </td>
                </tr>
              ) : (
                tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-[#131313] transition-all group border-l-[3px] border-l-transparent hover:border-l-[#C0272D]">
                    <td className="px-8 py-6">
                      <div className="font-black text-[#F5F5F5] group-hover:text-[#C0272D] transition-colors tracking-tight">{tenant.name.toUpperCase()}</div>
                      <div className="text-[9px] font-mono font-bold text-[#333] mt-1 tracking-tighter">UID: {tenant.id.toUpperCase()}</div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[9px] font-black text-[#F5F5F5] bg-[#0D0D0D] px-3 py-1 rounded border border-[#2A2A2A] uppercase tracking-widest group-hover:border-[#C0272D]/30 transition-all">
                        {tenant.plan}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${tenant.status === 'active' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-amber-500'}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${tenant.status === 'active' ? 'text-emerald-500/80' : 'text-amber-500/80'}`}>
                          {tenant.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-[10px] font-bold text-[#555] font-mono uppercase tracking-tighter">
                      {new Date(tenant.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      }).toUpperCase()}
                    </td>
                    <td className="px-8 py-6 text-right">
                      <span className="font-mono font-black text-[#F5F5F5] text-lg">{formatINR(tenant.mrr || 0)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Legend / Footer Note */}
      <div className="flex justify-between items-center text-[9px] font-black text-[#333] uppercase tracking-[0.3em] pt-8 border-t border-[#2A2A2A]/30">
        <p>© TABLEOS INFRASTRUCTURE CONTROL — REV. 2026.4.2</p>
        <div className="flex gap-6">
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#C0272D] rounded-full" /> HIGH YIELD</span>
          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#555] rounded-full" /> STANDARD LOAD</span>
        </div>
      </div>
    </div>
  )
}
