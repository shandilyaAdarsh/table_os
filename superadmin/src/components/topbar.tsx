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
    <header className="fixed top-0 right-0 z-40 w-[calc(100%-240px)] h-16 bg-[#131313]/80 backdrop-blur-xl border-b border-[#2A2A2A]/50 flex justify-between items-center px-8">
      <h1 className="text-xl font-semibold tracking-tight text-[#e5e2e1]">{title}</h1>
      <div className="flex items-center gap-6">
        <div className="text-right hidden md:block">
          <p className="font-mono text-xs text-[#555555] uppercase tracking-widest">System Operational</p>
          <p className="font-mono text-xs text-[#e3bebb]">{dateTime}</p>
        </div>
        <div className="pl-6 border-l border-[#2A2A2A]" />
      </div>
    </header>
  )
}
