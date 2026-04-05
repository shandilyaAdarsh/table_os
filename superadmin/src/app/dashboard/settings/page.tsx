'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('SuperAdmin')
  const [email] = useState('admin@tableos.com')
  const [isSaving, setIsSaving] = useState(false)
  const [showToast, setShowToast] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsSaving(false)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-12">
      {/* Header */}
      <div className="border-b border-[#2A2A2A] pb-8">
        <h2 className="text-3xl font-black text-[#e5e2e1] tracking-tight">System Settings</h2>
        <p className="text-[#555555] text-sm font-mono mt-1 uppercase tracking-widest">Global Configuration — v4.2</p>
      </div>

      <form onSubmit={handleSave} className="space-y-10">
        {/* Profile Section */}
        <section className="bg-[#131212] border border-[#2A2A2A] rounded-xl p-8 space-y-6 transition-all hover:border-[#333]">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
            <h3 className="text-lg font-bold text-[#e5e2e1]">SuperAdmin Profile</h3>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold font-mono">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-[#1c1b1b] border-2 border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#e5e2e1] focus:outline-none focus:border-primary-container transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold font-mono">Email Address (Read-only)</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full bg-[#0d0d0d] border border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#555555] font-mono cursor-not-allowed"
              />
            </div>
          </div>
        </section>

        {/* Password Section */}
        <section className="bg-[#131212] border border-[#2A2A2A] rounded-xl p-8 space-y-6 transition-all hover:border-[#333]">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
            <h3 className="text-lg font-bold text-[#e5e2e1]">Security & Password</h3>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold font-mono">Current Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-[#1c1b1b] border-2 border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#e5e2e1] focus:outline-none focus:border-primary-container transition-all placeholder:text-[#333]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold font-mono">New Password</label>
                <input
                  type="password"
                  placeholder="Minimum 8 characters"
                  className="w-full bg-[#1c1b1b] border-2 border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#e5e2e1] focus:outline-none focus:border-primary-container transition-all placeholder:text-[#333]"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#555555] mb-2 font-bold font-mono">Confirm New</label>
                <input
                  type="password"
                  placeholder="Re-type password"
                  className="w-full bg-[#1c1b1b] border-2 border-[#2A2A2A] rounded-lg px-4 py-3 text-sm text-[#e5e2e1] focus:outline-none focus:border-primary-container transition-all placeholder:text-[#333]"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-4 pt-4">
          <button
            type="button"
            className="px-6 py-2.5 rounded-lg text-xs font-bold text-[#555555] bg-transparent border border-[#2A2A2A] hover:text-[#e5e2e1] hover:bg-[#1C1B1B] transition-all"
          >
            Discard Changes
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-8 py-2.5 rounded-lg text-xs font-bold text-white bg-primary-container hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(192,39,45,0.3)] disabled:opacity-60 flex items-center gap-2"
          >
            {isSaving ? 'Processing...' : 'Save Configuration'}
            {!isSaving && <span className="material-symbols-outlined text-[14px]">save</span>}
          </button>
        </div>
      </form>

      {/* Success Notification */}
      {showToast && (
        <div className="fixed bottom-10 right-10 flex items-center gap-3 bg-[#131212] border-2 border-green-500/50 rounded-xl px-6 py-4 shadow-[0_0_50px_rgba(34,197,94,0.15)] animate-in fade-in slide-in-from-bottom-5 duration-300">
          <span className="material-symbols-outlined text-green-500" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
          <span className="text-xs font-bold text-[#e5e2e1]">Settings Updated! Environment configuration sync successful.</span>
        </div>
      )}
    </div>
  )
}
