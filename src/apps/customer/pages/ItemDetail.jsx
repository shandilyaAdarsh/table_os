import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useCartStore } from '../../../store/index'
import { motion } from 'framer-motion'

export default function ItemDetail() {
  const { id: itemId } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState({})  // { [groupId]: { id, name, priceDelta } }
  const [note,     setNote]     = useState('')
  const [noteFocused, setNoteFocused] = useState(false)

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

  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#F8FAFC' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #D91A2A', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (!item) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16, background: '#F8FAFC' }}>
      <p style={{ color: '#64748B', fontSize: 16 }}>Item not found</p>
      <button 
        onClick={() => navigate('/menu/browse')}
        style={{ background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 24, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}
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
      style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#F8FAFC', overflowX: 'hidden', paddingBottom: 140, boxSizing: 'border-box' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top Banner / Image Wrapper */}
      <div style={{ position: 'relative', width: '100%', height: 260, background: '#F1F5F9' }}>
        <img
          src={item.image_url || `https://placehold.co/430x260?text=${encodeURIComponent(item.name)}`}
          alt={item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        
        {/* Close round icon top left */}
        <motion.button
          onClick={() => navigate(-1)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ position: 'absolute', top: 16, left: 16, width: 36, height: 36, background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 10 }}
          aria-label="Close"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#0F172A', fontWeight: 900 }}>close</span>
        </motion.button>

        {/* Popular Tag top right */}
        {item.is_popular !== false && (
          <motion.div 
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: 20, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.06)', zIndex: 10 }}
          >
            <span style={{ fontSize: 12, color: '#D91A2A' }}>❤</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#D91A2A', textTransform: 'uppercase' }}>Popular</span>
          </motion.div>
        )}
      </div>

      {/* Item info block */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #F1F5F9', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 10, marginTop: -20, borderRadius: '24px 24px 0 0', position: 'relative', zIndex: 5, boxShadow: '0 -6px 20px rgba(0,0,0,0.015)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 style={{ fontWeight: 800, fontSize: 24, color: '#0F172A', margin: 0, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.01em' }}>{item.name}</h1>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#D91A2A', fontFamily: 'Outfit, sans-serif' }}>₹{item.price.toFixed(2)}</span>
        </div>

        {item.description && (
          <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{item.description}</p>
        )}
      </div>

      {/* Modifiers List */}
      <div style={{ padding: '20px 20px 0' }}>
        {modifierGroups.map(group => (
          <div key={group.id} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>{group.name}</h3>
              {group.required ? (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#D91A2A', background: '#FEF2F2', padding: '3px 8px', borderRadius: 6, border: '1px solid #FEE2E2' }}>Required (Choose 1)</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 800, color: '#64748B', background: '#F1F5F9', padding: '3px 8px', borderRadius: 6 }}>Optional</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {group.options.map(opt => {
                const isSelected = selected[group.id]?.id === opt.id
                return (
                  <motion.button
                    key={opt.id}
                    onClick={() => handleSelect(group.id, opt)}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', borderRadius: 16, cursor: 'pointer', border: '1.5px solid',
                      backgroundColor: isSelected ? '#FEF2F2' : '#FFFFFF',
                      borderColor: isSelected ? '#D91A2A' : '#E2E8F0',
                      boxShadow: isSelected ? '0 4px 12px rgba(217, 26, 42, 0.04)' : 'none',
                      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: isSelected ? 800 : 600, color: isSelected ? '#D91A2A' : '#0F172A', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>{opt.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {opt.priceDelta > 0 && <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>+₹{opt.priceDelta.toFixed(2)}</span>}
                      
                      {/* Red circle check indicator */}
                      <div style={{ 
                        width: 20, height: 20, borderRadius: '50%', 
                        border: `2px solid ${isSelected ? '#D91A2A' : '#D1D5DB'}`, 
                        background: isSelected ? 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)' : 'transparent', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isSelected ? '0 2px 8px rgba(217, 26, 42, 0.3)' : 'none',
                        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}>
                        {isSelected && <span style={{ color: '#FFFFFF', fontSize: 11, fontWeight: 900 }}>✓</span>}
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Special Instructions */}
        <div style={{ marginBottom: 40 }}>
          <label style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', fontFamily: 'Outfit, sans-serif', display: 'block', marginBottom: 10 }}>Special Instructions</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            rows={3}
            placeholder="Add-on requests, allergy notes, etc."
            style={{ 
              width: '100%', 
              background: noteFocused ? '#FFFFFF' : '#FFFFFF', 
              border: noteFocused ? '1.5px solid #D91A2A' : '1px solid #E2E8F0', 
              borderRadius: 16, 
              padding: '14px', 
              fontSize: 14, 
              color: '#0F172A', 
              resize: 'none', 
              outline: 'none', 
              boxSizing: 'border-box', 
              fontFamily: 'Inter, sans-serif',
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: noteFocused ? '0 0 0 4px rgba(217, 26, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.02)' : 'none'
            }}
          />
        </div>
      </div>

      {/* Sticky Bottom Actions Bar */}
      <div style={{ 
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', 
        width: '100%', maxWidth: 430, 
        padding: '16px 20px calc(16px + env(safe-area-inset-bottom))', 
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(16px) saturate(120%)',
        WebkitBackdropFilter: 'blur(16px) saturate(120%)',
        borderTop: '1px solid rgba(241, 245, 249, 0.8)', 
        zIndex: 30, 
        boxShadow: '0 -10px 30px rgba(15, 23, 42, 0.04)', 
        boxSizing: 'border-box' 
      }}>
        <motion.button
          id="add-to-cart-btn"
          onClick={handleAddToCart}
          disabled={!canAdd || !item.is_available}
          whileHover={canAdd && item.is_available ? { scale: 1.02, boxShadow: '0 12px 30px rgba(217, 26, 42, 0.32)' } : {}}
          whileTap={canAdd && item.is_available ? { scale: 0.98 } : {}}
          style={{
            width: '100%', height: 52, background: canAdd && item.is_available ? 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)' : '#CBD5E1',
            color: 'white', border: 'none', borderRadius: 24, fontSize: 15, fontWeight: 700,
            cursor: canAdd && item.is_available ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            boxShadow: canAdd && item.is_available ? '0 8px 24px rgba(217, 26, 42, 0.2)' : 'none'
          }}
        >
          {item.is_available
            ? (
              <>
                <span>Add to Cart</span>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.3)' }} />
                <span>₹{finalPrice.toFixed(2)}</span>
              </>
            )
            : 'Currently Unavailable'
          }
        </motion.button>
      </div>
    </motion.div>
  )
}
