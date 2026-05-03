// Ported from qr-restaurant-demo/src/components/CartBar.tsx
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../../../store/index'

export function CartBar({ visible = true, onOpen }) {
  const navigate   = useNavigate()
  const cartItems  = useCartStore(s => s.items)
  const totalQty   = cartItems.reduce((a, i) => a + i.qty, 0)
  const totalPrice = cartItems.reduce((a, i) => a + i.price * i.qty, 0)

  if (totalQty === 0) return null

  const handleClick = () => {
    if (onOpen) onOpen()
    else navigate('/customer/cart')
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))', left: '50%',
        transform: `translateX(-50%) translateY(${visible ? '0' : '150%'})`,
        width: 'calc(100% - 32px)', maxWidth: 400,
        zIndex: 50,
        transition: 'transform 0.35s cubic-bezier(0.32,0.72,0,1)',
      }}
    >
      <button
        onClick={handleClick}
        id="cart-fab-btn"
        style={{
          width: '100%',
          backgroundColor: '#1B2B4B',
          border: 'none',
          borderRadius: 16,
          padding: '12px 20px',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          transition: 'transform 0.15s',
          fontFamily: 'Inter, sans-serif',
        }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
        onMouseUp={e   => e.currentTarget.style.transform = 'scale(1)'}
        onTouchStart={e => e.currentTarget.style.transform = 'scale(0.97)'}
        onTouchEnd={e   => e.currentTarget.style.transform = 'scale(1)'}
        aria-label={`View cart — ${totalQty} items — ₹${totalPrice.toLocaleString('en-IN')}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: 'white' }}>{totalQty}</span>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>View Cart</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{totalQty} {totalQty === 1 ? 'Item' : 'Items'}</div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#F97316' }}>₹{totalPrice.toLocaleString('en-IN')}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explore more</div>
        </div>
      </button>
    </div>
  )
}
