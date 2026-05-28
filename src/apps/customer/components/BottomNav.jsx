// Ported from qr-restaurant-demo/src/components/BottomNav.tsx
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import AssistModal from './AssistModal'

const NAV_ITEMS = [
  { label: 'Menu',    icon: 'restaurant_menu', path: '/menu/browse', isModal: false },
  { label: 'Assist',  icon: 'room_service',    path: null,           isModal: true },
  { label: 'Orders',  icon: 'receipt_long',    path: '/menu/orders', isModal: false },
  { label: 'Profile', icon: 'person',          path: '/menu/profile',isModal: false },
]

export function BottomNav({ visible = true }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [assistOpen, setAssistOpen] = useState(false)

  return (
    <>
      <nav
        style={{
          position: 'fixed', bottom: 0, left: '50%',
          transform: `translateX(-50%) translateY(${visible ? '0' : '100%'})`,
          width: '100%', maxWidth: '430px',
          zIndex: 40,
          backgroundColor: '#FFFFFF',
          borderRadius: '1.5rem 1.5rem 0 0',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          padding: '10px 16px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
        }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = item.path ? location.pathname.startsWith(item.path) : false
          return (
            <button
              key={item.label}
              onClick={() => item.isModal ? setAssistOpen(true) : navigate(item.path)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '8px 16px',
                minHeight: 44, minWidth: 44,
                borderRadius: 14, border: 'none', cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: isActive ? '#E31E24' : 'transparent',
                color: isActive ? 'white' : '#6C757D',
              }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: isActive ? "'FILL' 1" : "none" }}>{item.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
      <AssistModal open={assistOpen} onClose={() => setAssistOpen(false)} />
    </>
  )
}

