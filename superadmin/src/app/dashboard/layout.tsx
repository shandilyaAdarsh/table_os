'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/sidebar'
import Topbar from '@/components/topbar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
  }, [router])

  return (
    <div className="flex min-h-screen bg-[#131313]">
      <Sidebar />
      <div className="flex-1 ml-[260px]">
        <Topbar title="Infrastructure Hub" />
        <main className="pt-16">{children}</main>
      </div>
    </div>
  )
}
