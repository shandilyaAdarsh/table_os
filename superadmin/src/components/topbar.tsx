'use client'

import { useEffect, useState } from 'react'

interface TopbarProps {
  title: string
}

export default function Topbar({ title }: TopbarProps) {
  const [dateTime, setDateTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setDateTime(now.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
      }) + ' · ' + now.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC'
      }) + ' UTC')
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <header className="fixed top-0 right-0 z-40 w-[calc(100%-260px)] h-16 bg-[#131313]/80 backdrop-blur-xl border-b border-[#2A2A2A]/50 flex justify-between items-center px-10">
      <div className="flex items-center gap-4">
         <div className="w-1.5 h-1.5 bg-[#C0272D] rounded-full shadow-[0_0_8px_rgba(192,39,45,0.6)]" />
         <h1 className="text-xs font-black uppercase tracking-[0.3em] text-[#F5F5F5]">{title}</h1>
      </div>
      
      <div className="flex items-center gap-8">
        <div className="text-right hidden md:block">
          <p className="text-[9px] font-black text-[#C0272D] uppercase tracking-[0.2em] mb-0.5">Uplink Stable</p>
          <p className="font-mono text-[10px] font-bold text-[#555]">{dateTime}</p>
        </div>
        <div className="h-8 w-px bg-[#2A2A2A]" />
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#555] text-lg">notifications</span>
           </div>
           <div className="w-8 h-8 rounded-lg bg-[#C0272D1A] border border-[#C0272D33] flex items-center justify-center">
              <span className="material-symbols-outlined text-[#C0272D] text-lg">shield_person</span>
           </div>
        </div>
      </div>
    </header>
  )
}
