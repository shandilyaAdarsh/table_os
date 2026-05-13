'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        return
      }

      // Check role via server-side API to bypass RLS issues
      const roleRes = await fetch('/api/check-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id })
      })

      const roleData = await roleRes.json()

      if (!roleRes.ok || roleData.role !== 'superadmin') {
        await supabase.auth.signOut()
        setError('Access denied. This portal is restricted to SuperAdmins only.')
        return
      }

      router.push('/dashboard')
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex w-full h-screen overflow-hidden bg-[#131313]">
      {/* Subtle red glow */}
      <div className="fixed inset-0 pointer-events-none" 
           style={{ background: 'radial-gradient(circle at 20% 50%, rgba(192, 39, 45, 0.05) 0%, transparent 50%)' }} />

      {/* LEFT: Editorial Branding (60%) */}
      <section className="hidden lg:flex lg:w-3/5 flex-col justify-between p-20 relative z-10">
        <div>
          {/* Editorial Typography */}
          <div className="space-y-0">
            <h1 className="text-[96px] font-extrabold leading-[0.9] tracking-tighter text-[#F5F5F5] block">
              Platform
            </h1>
            <h1 className="text-[96px] font-extrabold leading-[0.9] tracking-tighter text-[#F5F5F5] block">
              Control
            </h1>
            <h1 className="text-[96px] font-extrabold leading-[0.9] tracking-tighter text-[#C0272D] block">
              Center
            </h1>
          </div>

          {/* Stat Pills */}
          <div className="mt-12 flex gap-4">
            <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-full px-5 py-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-[#e5e2e1] uppercase tracking-wider">12 Restaurants</span>
            </div>
            <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-full px-5 py-2 flex items-center gap-2">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">₹1.2L MRR</span>
            </div>
            <div className="bg-[#1C1B1B] border border-[#2A2A2A] rounded-full px-5 py-2 flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#555555] uppercase tracking-wider">99.9% Uptime</span>
            </div>
          </div>
        </div>

        {/* Bottom footer metadata */}
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 bg-[#C0272D] rounded-full animate-pulse" />
          <p className="text-[11px] font-medium text-[#555555] uppercase tracking-[0.2em]">
            TableOS SuperAdmin · Restricted Access
          </p>
        </div>
      </section>

      {/* RIGHT: Login Terminal (40%) */}
      <section className="w-full lg:w-2/5 flex flex-col justify-center items-center px-8 lg:px-20 relative bg-[#131313]/40 backdrop-blur-sm">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-[#141414] border border-[#2A2A2A] p-8 rounded-xl relative overflow-hidden">
            {/* Red top border accent */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-[#C0272D]" />

            {/* Header */}
            <div className="flex flex-col items-start mb-10">
              <div className="w-10 h-10 bg-[#C0272D] rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(192,39,45,0.2)]">
                <span className="font-bold text-white text-sm tracking-tighter">TS</span>
              </div>
              <h2 className="text-2xl font-bold text-[#F5F5F5] tracking-tight">Welcome back</h2>
              <p className="text-xs font-semibold text-[#C0272D]/80 uppercase tracking-widest mt-1">
                Superadmin access only
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#555555] uppercase tracking-widest block ml-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="admin@tableos.in"
                  className="w-full h-[44px] bg-[#0E0E0E] border border-[#2A2A2A] rounded-xl px-4 text-sm text-[#F5F5F5] placeholder:text-[#333333] focus:outline-none focus:ring-1 focus:ring-[#C0272D]/50 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#555555] uppercase tracking-widest block ml-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full h-[44px] bg-[#0E0E0E] border border-[#2A2A2A] rounded-xl px-4 text-sm text-[#F5F5F5] placeholder:text-[#333333] focus:outline-none focus:ring-1 focus:ring-[#C0272D]/50 transition-all"
                />
              </div>

              {error && (
                <p className="text-xs text-[#C0272D] font-medium">{error}</p>
              )}

              <div className="pt-2 space-y-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[44px] bg-[#C0272D] hover:bg-[#A31D23] text-white font-bold text-sm rounded-xl transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(192,39,45,0.2)] disabled:opacity-60"
                >
                  {loading ? 'Authenticating...' : 'Access Terminal'}
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center space-y-4">
            <div className="flex justify-center gap-6">
              <a href="#" className="text-[10px] font-semibold text-[#555555] hover:text-[#C0272D] transition-colors uppercase tracking-widest">Privacy Policy</a>
              <a href="#" className="text-[10px] font-semibold text-[#555555] hover:text-[#C0272D] transition-colors uppercase tracking-widest">System Terms</a>
              <a href="#" className="text-[10px] font-semibold text-[#555555] hover:text-[#C0272D] transition-colors uppercase tracking-widest">Security Status</a>
            </div>
            <p className="text-[10px] text-[#333333] font-bold uppercase tracking-[0.2em]">
              Protected by 2FA · TableOS Inc.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
