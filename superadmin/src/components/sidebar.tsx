'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/dashboard', icon: 'monitoring', label: 'Telemetry', badge: true },
  { href: '/dashboard/tenants', icon: 'hub', label: 'Node Registry' },
  { href: '/dashboard/onboard', icon: 'rocket_launch', label: 'Provisioning' },
  { href: '/dashboard/billing', icon: 'account_balance', label: 'Financials' },
  { href: '/dashboard/broadcast', icon: 'campaign', label: 'Global Comms' },
  { href: '/dashboard/settings', icon: 'settings_input_component', label: 'Core Config' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      const fingerprint = btoa(`${navigator.userAgent}-${navigator.language}-${screen.width}x${screen.height}`).substring(0, 32);
      const deviceSessionId = localStorage.getItem('device_session_id');
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      // 1. Get current session token
      const { data: { session } } = await supabase.auth.getSession();

      if (session && deviceSessionId) {
        // 2. Revoke in backend
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'X-Device-Fingerprint': fingerprint,
          },
          body: JSON.stringify({
            device_session_id: deviceSessionId,
          }),
        });
      }
    } catch (err) {
      console.error('Logout revocation failed:', err);
    } finally {
      // 3. Always clear local state
      localStorage.removeItem('device_session_id');
      await supabase.auth.signOut();
      router.push('/login');
    }
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] z-50 bg-[#0D0D0D] border-r border-[#2A2A2A] flex flex-col justify-between pb-8">
      <div>
        {/* Brand Container */}
        <div className="px-8 py-10 flex items-center gap-4 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-[#C0272D] opacity-40 group-hover:opacity-100 transition-opacity" />
          <div className="w-10 h-10 bg-[#C0272D] flex items-center justify-center rounded-xl shadow-[0_0_20px_rgba(192,39,45,0.3)] group-hover:scale-110 transition-transform duration-500">
            <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              layers
            </span>
          </div>
          <div>
            <span className="text-[22px] font-black text-[#F5F5F5] tracking-tighter leading-none block">TABLEOS</span>
            <p className="text-[9px] font-black text-[#C0272D] uppercase tracking-[0.3em] mt-1">Infrastructure</p>
          </div>
        </div>

        {/* System Navigation */}
        <div className="px-4 py-2">
           <p className="px-4 text-[9px] font-black text-[#333] uppercase tracking-[0.2em] mb-4">System Protocols</p>
          <nav className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group relative ${
                    isActive
                      ? 'text-[#F5F5F5] bg-[#1A1A1A] border border-[#2A2A2A] shadow-[0_0_20px_rgba(0,0,0,0.4)]'
                      : 'text-[#555] hover:text-[#F5F5F5] hover:bg-[#131313]'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-[#C0272D] rounded-r-full shadow-[0_0_10px_rgba(192,39,45,0.8)]" />
                  )}
                  <div className="flex items-center gap-3.5">
                    <span
                      className={`material-symbols-outlined text-xl transition-colors ${isActive ? 'text-[#C0272D]' : 'group-hover:text-[#F5F5F5]'}`}
                      style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {item.icon}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-[#F5F5F5]' : ''}`}>{item.label}</span>
                  </div>
                  {item.badge && (
                    <div className="flex h-1.5 w-1.5 relative">
                      <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C0272D] opacity-75" />
                      <div className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#C0272D]" />
                    </div>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Authority Control */}
      <div className="px-4 space-y-6">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3.5 px-4 py-3.5 text-[#555] hover:text-[#C0272D] hover:bg-[#C0272D11] transition-all duration-300 cursor-pointer rounded-xl group"
        >
          <span className="material-symbols-outlined text-xl group-hover:rotate-12 transition-transform">logout</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Terminate Session</span>
        </button>

        <div className="px-4 pt-6 border-t border-[#2A2A2A]/50 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#0D0D0D] border border-[#2A2A2A] flex items-center justify-center text-[#C0272D] text-xs font-black shadow-inner">
            SA
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-black text-[#F5F5F5] uppercase tracking-tighter truncate">SUPER ADMIN</span>
            <div className="flex items-center gap-2">
               <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
               <span className="text-[8px] font-mono font-bold text-[#333] uppercase tracking-widest">Authorized_lvl_4</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
