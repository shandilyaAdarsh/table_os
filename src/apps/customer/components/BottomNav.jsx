import { useNavigate, useLocation } from 'react-router-dom'
import { useCartStore } from '../../../store/index'
import { motion } from 'framer-motion'

const NAV_ITEMS = [
  { label: 'Menu',    icon: 'restaurant_menu', path: '/menu/browse' },
  { label: 'Cart',    icon: 'shopping_cart',   path: '/menu/cart' },
  { label: 'Orders',  icon: 'receipt_long',    path: '/menu/orders' },
  { label: 'Profile', icon: 'person',          path: '/menu/profile' },
]

export function BottomNav({ visible = true }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const cartItems = useCartStore(state => state.items || [])
  const totalCartCount = cartItems.reduce((acc, item) => acc + (item.qty || 0), 0)

  return (
    <nav
      style={{
        position: 'fixed', bottom: 0, left: '50%',
        transform: `translateX(-50%) translateY(${visible ? '0' : '100%'})`,
        width: '100%', maxWidth: '430px',
        zIndex: 40,
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px) saturate(120%)',
        WebkitBackdropFilter: 'blur(16px) saturate(120%)',
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -10px 30px rgba(15, 23, 42, 0.04)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '12px 14px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        borderTop: '1px solid rgba(255, 255, 255, 0.6)',
        boxSizing: 'border-box'
      }}
    >
      {NAV_ITEMS.map(item => {
        const isActive = item.path ? location.pathname === item.path || (item.path === '/menu/browse' && location.pathname.startsWith('/menu/item')) : false
        return (
          <motion.button
            key={item.label}
            onClick={() => navigate(item.path)}
            whileTap={{ scale: 0.92 }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '4px 6px',
              minWidth: 72,
              borderRadius: 16, border: 'none', cursor: 'pointer',
              background: 'transparent',
              position: 'relative'
            }}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {/* Icon container */}
            <motion.div
              animate={{ 
                scale: isActive ? 1.05 : 1,
                boxShadow: isActive ? '0 8px 20px rgba(217, 26, 42, 0.25)' : 'none'
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive ? '#D91A2A' : 'transparent',
                color: isActive ? '#FFFFFF' : '#94A3B8',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                marginBottom: 4
              }}
            >
              <span 
                className="material-symbols-outlined" 
                style={{ 
                  fontSize: 22, 
                  fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" 
                }}
              >
                {item.icon}
              </span>
            </motion.div>

            {/* Badge for Cart count */}
            {item.label === 'Cart' && totalCartCount > 0 && !isActive && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 18,
                  backgroundColor: '#D91A2A',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 800,
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #FFFFFF',
                  boxShadow: '0 2px 6px rgba(217, 26, 42, 0.35)',
                  animation: 'pulse-ring 2.5s infinite ease-in-out'
                }}
              >
                {totalCartCount}
              </motion.span>
            )}

            <span 
              style={{ 
                fontSize: 10, 
                fontWeight: 700, 
                color: isActive ? '#D91A2A' : '#94A3B8',
                transition: 'color 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              {item.label}
            </span>
          </motion.button>
        )
      })}
    </nav>
  )
}

