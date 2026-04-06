'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const navItems = [
  { href: '/dashboard', icon: 'bar_chart', label: 'Dashboard', badge: true },
  { href: '/dashboard/tenants', icon: 'store', label: 'Tenants' },
  { href: '/dashboard/onboard', icon: 'add_circle', label: 'Onboard New' },
  { href: '/dashboard/billing', icon: 'credit_card', label: 'Billing' },
  { href: '/dashboard/broadcast', icon: 'campaign', label: 'Broadcast' },
  { href: '/dashboard/settings', icon: 'settings', label: 'Settings' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-[240px] z-50 bg-[#0D0D0D] border-r border-[#2A2A2A] flex flex-col justify-between pb-6">
      <div>
        {/* Brand */}
        <div className="px-6 py-8 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C0272D] flex items-center justify-center rounded">
            <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              layers
            </span>
          </div>
          <div>
            <span className="text-[20px] font-bold text-[#C0272D] tracking-tighter">TableOS</span>
            <p className="text-[10px] font-mono text-[#555555] uppercase tracking-widest">SuperAdmin</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-2 flex flex-col">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-6 py-3 transition-all duration-200 group ${
                  isActive
                    ? 'text-[#F5F5F5] bg-[#C0272D08] border-l-[3px] border-[#C0272D]'
                    : 'text-[#555555] hover:text-[#F5F5F5] hover:bg-[#1C1B1B] border-l-[3px] border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  <span className="font-medium text-sm tracking-tight">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-[#ffb3ae] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ffb3ae]" />
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className="px-2">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 text-[#555555] hover:text-[#F5F5F5] hover:bg-[#1C1B1B] transition-all duration-300 cursor-pointer rounded-xl mx-2 w-[calc(100%-16px)]"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="font-medium text-sm tracking-tight">Logout</span>
        </button>
        <div className="mt-4 px-6 pt-4 border-t border-[#2A2A2A]/50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#C0272D] flex items-center justify-center text-white text-xs font-bold">
            SA
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#e5e2e1]">SuperAdmin</span>
            <span className="text-[10px] font-mono text-[#555555]">ID: 0042X_S</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
