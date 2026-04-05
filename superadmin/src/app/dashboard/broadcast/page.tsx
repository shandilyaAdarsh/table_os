'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function BroadcastPage() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [tenantCount, setTenantCount] = useState(0)
  const [isSending, setIsSending] = useState(false)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    async function fetchTenantCount() {
      const { count } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
      setTenantCount(count || 0)
    }
    fetchTenantCount()
  }, [])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject || !message) return

    setIsSending(true)
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500))
    setIsSending(false)
    setShowToast(true)
    setSubject('')
    setMessage('')
    
    setTimeout(() => setShowToast(false), 5000)
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8 relative">
      {/* Header */}
      <div className="border-b border-[#2A2A2A] pb-8">
        <h2 className="text-3xl font-black text-[#e5e2e1] tracking-tight">System Broadcast</h2>
        <p className="text-[#555555] text-sm font-mono mt-1 uppercase tracking-widest">Global Communication Hub — v4.2</p>
      </div>

      {/* Broadcast Form */}
      <form onSubmit={handleSend} className="bg-[#131212] border border-[#2A2A2A] rounded-xl p-8 space-y-6">
        <div className="flex items-center gap-3 p-4 bg-primary-container/10 border border-primary-container/20 rounded-lg">
          <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
          <p className="text-xs text-[#e5e2e1] leading-relaxed">
            Your message will be broadcasted to all <span className="font-bold text-white">{tenantCount} active merchant admins</span> across the platform.
          </p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">Broadcast Subject</label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Scheduled System Maintenance"
            className="w-full bg-[#1c1b1b] border-2 border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#e5e2e1] focus:outline-none focus:border-primary-container transition-all placeholder:text-[#333333]"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold">Message Content</label>
          <textarea
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            className="w-full h-48 bg-[#1c1b1b] border-2 border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#e5e2e1] focus:outline-none focus:border-primary-container transition-all placeholder:text-[#333333] resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSending}
          className="w-full bg-primary-container text-white py-4 rounded-lg font-bold text-sm tracking-tight hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(192,39,45,0.3)] disabled:opacity-60 flex items-center justify-center gap-3"
        >
          {isSending ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Broadcasting...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">campaign</span>
              Send Broadcast to All Admins
            </>
          )}
        </button>
      </form>

      {/* Custom Toast */}
      {showToast && (
        <div className="fixed bottom-10 right-10 bg-[#131212] border-2 border-green-500/50 rounded-xl p-6 shadow-[0_0_50px_rgba(34,197,94,0.15)] flex items-start gap-4 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
            <span className="material-symbols-outlined text-green-500" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#e5e2e1]">Successfully Broadcasted</h4>
            <p className="text-xs text-[#555555] mt-1">Notification sent to {tenantCount} tenants across the network.</p>
          </div>
        </div>
      )}
    </div>
  )
}
