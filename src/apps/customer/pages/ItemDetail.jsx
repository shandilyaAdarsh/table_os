/**
 * ItemDetail.jsx — Item detail / modifier bottom sheet
 * Ported from qr-restaurant-demo/src/components/ModifierModal.tsx
 * Opens as a full bottom sheet from the item tap in MenuHome
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchWithRuntime } from '../../../lib/apiClient'
import { useMenuStore, useCartStore } from '../../../store/index'
import { motion } from 'framer-motion'

export default function ItemDetail() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState({})  // { [groupId]: { id, name, priceDelta } }
  const [note,     setNote]     = useState('')

  useEffect(() => {
    if (!itemId) return
    const fetchItem = async () => {
      setLoading(true)
      try {
        const res = await fetchWithRuntime(`/api/v1/runtime/menu/${itemId}`)
        if (!res.ok) throw new Error('Failed to fetch item')
        const { data } = await res.json()
        setItem(data)
      } catch (err) {
        console.error('Fetch catch:', err)
        setItem(null)
      } finally {
        setLoading(false)
      }
    }
    fetchItem()
  }, [itemId])

  // Scroll top on mount & lock body scroll
  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (loading) return <div>Loading...</div>
  if (!item) return (
    <div style={{ 
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh', gap: '16px'
    }}>
      <p style={{ color: '#6C757D', fontSize: '16px' }}>
        Item not found
      </p>
      <button 
        onClick={() => navigate('/menu/browse')}
        style={{
          background: '#E31E24', color: 'white',
          border: 'none', padding: '12px 24px',
          borderRadius: '12px', cursor: 'pointer',
          fontSize: '15px', fontWeight: '600'
        }}
      >
        Back to Menu
      </button>
    </div>
  )

  const modifierGroups = item.modifierGroups || []
  const extraCost = Object.values(selected).reduce((sum, o) => sum + (o.priceDelta || 0), 0)
  const finalPrice = item.price + extraCost
  const allRequiredMet = modifierGroups.filter(g => g.required).every(g => selected[g.id])
  const canAdd = modifierGroups.filter(g => g.required).length === 0 || allRequiredMet

  const handleSelect = (groupId, option) => {
    setSelected(prev => ({ ...prev, [groupId]: option }))
  }

  const handleAddToCart = () => {
    const modifierLabels = Object.values(selected).map(o => o.name)
    useCartStore.getState().addItem({
      ...item,
      price: finalPrice,
      modifiers: modifierLabels,
      note,
      qty: 1,
    })
    navigate(-1)
  }

  return (
    <motion.div 
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#FFFFFF', fontFamily: '"Plus Jakarta Sans", sans-serif', overflowX: 'hidden', paddingBottom: 120 }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header Container */}
      <div style={{ position: 'relative', padding: '16px' }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', borderRadius: 16, overflow: 'hidden', background: '#F3F4F6', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <img
            src={item.image_url || `https://placehold.co/430x430?text=${encodeURIComponent(item.name[0])}`}
            alt={item.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            style={{ position: 'absolute', top: 16, left: 16, width: 40, height: 40, background: '#FFFFFF', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10 }}
            aria-label="Go back"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#E31E24' }}>arrow_back</span>
          </button>

          {item.is_veg !== undefined && (
            <div style={{ position: 'absolute', bottom: 16, left: 16, background: '#FFFFFF', borderRadius: 6, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, border: item.is_veg ? '2px solid #22C55E' : '2px solid #EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: item.is_veg ? '#22C55E' : '#EF4444' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#E31E24', textTransform: 'uppercase' }}>{item.is_veg ? 'Veg' : 'Non-Veg'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h1 style={{ fontWeight: 800, fontSize: 24, color: '#E31E24', margin: 0, lineHeight: 1.2, flex: 1 }}>{item.name}</h1>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#E31E24' }}>₹{item.price}</span>
        </div>

        {item.description && (
          <p style={{ fontSize: 14, color: '#6C757D', lineHeight: 1.6, margin: '12px 0 24px' }}>{item.description}</p>
        )}

        <div style={{ height: '1px', background: '#F3F4F6', margin: '24px 0' }} />

        {/* Modifier groups */}
        {modifierGroups.map(group => (
          <div key={group.id} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#E31E24', margin: 0 }}>{group.name}</h3>
              {group.required && (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#E31E24', background: 'rgba(249,115,22,0.1)', padding: '2px 8px', borderRadius: 4 }}>REQUIRED</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {group.options.map(opt => {
                const isSelected = selected[group.id]?.id === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelect(group.id, opt)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '16px', borderRadius: 12, cursor: 'pointer', border: '1.5px solid',
                      backgroundColor: isSelected ? 'rgba(27,43,75,0.03)' : '#FFFFFF',
                      borderColor: isSelected ? '#E31E24' : '#F3F4F6',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#E31E24' : '#4B5563' }}>{opt.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {opt.priceDelta > 0 && <span style={{ fontSize: 13, color: '#6C757D' }}>+₹{opt.priceDelta}</span>}
                      <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${isSelected ? '#E31E24' : '#D1D5DB'}`, background: isSelected ? '#E31E24' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF' }} />}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Special requests */}
        <div style={{ marginBottom: 32 }}>
          <label style={{ fontSize: 13, fontWeight: 800, color: '#E31E24', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 12 }}>Special Requests</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Extra spicy, no onions..."
            style={{ width: '100%', background: '#F9FAFB', border: '1.5px solid #F3F4F6', borderRadius: 12, padding: '14px', fontSize: 15, color: '#E31E24', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Sticky Add to Cart */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, padding: '16px 20px 24px', background: 'white', borderTop: '1px solid #F3F4F6', zIndex: 30, boxShadow: '0 -4px 20px rgba(0,0,0,0.05)' }}>
        <button
          id="add-to-cart-btn"
          onClick={handleAddToCart}
          disabled={!canAdd || !item.is_available}
          style={{
            width: '100%', height: 56, background: canAdd && item.is_available ? '#E31E24' : '#E5E7EB',
            color: 'white', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 700,
            cursor: canAdd && item.is_available ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
          }}
        >
          {item.is_available
            ? (
              <>
                <span>Add to Cart</span>
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.2)' }} />
                <span style={{ color: '#E31E24' }}>₹{finalPrice}</span>
              </>
            )
            : 'Currently Unavailable'
          }
        </button>
      </div>
    </motion.div>
  )
}
