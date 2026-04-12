/**
 * MenuHome.jsx
 * Ported from qr-restaurant-demo/src/components/MenuClient.tsx
 * Adapted: Next.js → Vite/React-Router, TypeScript → JSX, CSS vars → inline tokens,
 * next/image → <img>, @/... → relative imports, MENU_ITEMS → Supabase fetch
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useMenuStore, useCartStore } from '../../../store/index'
import { CategoryBubbles } from '../components/CategoryBubbles'
import { CartBar } from '../components/CartBar'
import { BottomNav } from '../components/BottomNav'
import { SkeletonCard } from '../components/SkeletonCard'
import CartDrawer from './CartDrawer'
import { motion } from 'framer-motion'
import { getTableNum } from '../utils/tableNum'

const TENANT_ID  = '11111111-1111-1111-1111-111111111111'
const STICKY_TRIGGER = 280
const NAV_SCROLL_THRESHOLD = 8

// ── Particle +1 animation ─────────────────────────────────────────────────────
function Particle({ x, y }) {
  return (
    <div style={{
      position: 'fixed', left: x, top: y, pointerEvents: 'none', zIndex: 9999,
      fontWeight: 600, fontSize: 14, color: '#F97316', fontFamily: 'Inter, sans-serif',
      animation: 'flyUp 600ms ease forwards',
    }}>+1</div>
  )
}

// ── Inline +/stepper for each card ───────────────────────────────────────────
function AddButton({ item, onAdd, onCustomize, onAnimate }) {
  const cartItems = useCartStore(s => s.items)
  const [popping, setPopping] = useState(false)

  const inCart = cartItems.find(i => i.id === item.id)
  const qty    = inCart?.qty || 0

  const handleAdd = (e) => {
    e.stopPropagation()
    setPopping(true)
    setTimeout(() => setPopping(false), 400)
    onAnimate?.(e)
    onAdd(item)
  }

  const decrement = (e) => {
    e.stopPropagation()
    useCartStore.getState().updateQty(item.id, inCart?.modifiers, qty - 1)
  }

  const increment = (e) => {
    e.stopPropagation()
    useCartStore.getState().addItem({ ...item, qty: 1 })
  }

  const btnBase = {
    background: '#1B2B4B', color: 'white',
    minWidth: 32, minHeight: 32, borderRadius: 8, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, border: 'none', transition: 'transform 0.1s',
    transform: popping ? 'scale(0.85)' : 'scale(1)',
  }

  if (!item.is_available) {
    return (
      <div style={{ minWidth: 32, minHeight: 32, borderRadius: 8, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#D1D5DB', fontSize: 18 }}>+</span>
      </div>
    )
  }

  if (qty === 0) {
    return <button onClick={handleAdd} style={btnBase} aria-label={`Add ${item.name}`}>+</button>
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F3F4F6', padding: '4px', borderRadius: 10 }}>
      <button onClick={decrement} style={{ border: 'none', background: 'transparent', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1B2B4B', cursor: 'pointer', fontSize: 18 }}>−</button>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', minWidth: 12, textAlign: 'center' }}>{qty}</span>
      <button onClick={increment} style={{ border: 'none', background: 'transparent', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1B2B4B', cursor: 'pointer', fontSize: 18 }}>+</button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MenuHome() {
  const navigate    = useNavigate()
  const cartItems   = useCartStore(s => s.items)

  // Read checked-in session for personalised header
  const session = (() => { try { return JSON.parse(localStorage.getItem('customerSession') || '{}') } catch { return {} } })()

  const [items,           setItems]           = useState(null)  // null = loading, [] = loaded
  const [itemsLoading,    setItemsLoading]    = useState(true)

  const [searchQuery,     setSearchQuery]     = useState('')
  const [vegOnly,       setVegOnly]         = useState(false)
  const [activeCategory,  setActiveCategory]  = useState('all')
  const [isRecording,     setIsRecording]     = useState(false)
  const [particles,       setParticles]       = useState([])
  const [scrollY,         setScrollY]         = useState(0)
  const [lastScrollY,     setLastScrollY]     = useState(0)
  const [stickyVisible,   setStickyVisible]   = useState(false)
  const [searchInSticky,  setSearchInSticky]  = useState(false)
  const [navVisible,      setNavVisible]      = useState(true)
  const [lastScrollForNav,setLastScrollForNav]= useState(0)
  const [cartOpen,        setCartOpen]        = useState(false)

  const recognitionRef = useRef(null)

  // Direct Supabase fetch — bypasses store initialization guard
  useEffect(() => {
    const fetchItems = async () => {
      setItemsLoading(true)
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .order('sort_order', { ascending: true })
      if (error) {
        console.error('Menu fetch error:', error)
        setItems([])
      } else {
        console.log('Fetched items:', data?.length, data)
        setItems(data || [])
      }
      setItemsLoading(false)
    }
    fetchItems()
  }, [])

  // Scroll tracking — hide/show nav + sticky overlay (ported from MenuClient.tsx)
  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY
      const dir     = current > lastScrollY ? 'down' : 'up'
      setScrollY(current)
      setLastScrollY(current)
      setStickyVisible(current > STICKY_TRIGGER)
      if (current > STICKY_TRIGGER) setSearchInSticky(dir === 'up')

      const delta = current - lastScrollForNav
      if (Math.abs(delta) > NAV_SCROLL_THRESHOLD) {
        setNavVisible(delta <= 0 || current <= 100)
        setLastScrollForNav(current)
      }
      if (window.innerHeight + current >= document.body.scrollHeight - 60) setNavVisible(true)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [lastScrollY, lastScrollForNav])

  // Voice search (ported from MenuClient.tsx)
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SR = window.webkitSpeechRecognition || window.SpeechRecognition
      recognitionRef.current = new SR()
      recognitionRef.current.lang = 'en-IN'
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = false
      recognitionRef.current.onresult = (e) => { setSearchQuery(e.results[0][0].transcript); setIsRecording(false) }
      recognitionRef.current.onerror  = () => setIsRecording(false)
      recognitionRef.current.onend    = () => setIsRecording(false)
    }
  }, [])

  const startVoiceSearch = () => {
    if (!recognitionRef.current) return
    if (isRecording) { recognitionRef.current.stop(); return }
    setSearchQuery('')
    setIsRecording(true)
    recognitionRef.current.start()
  }

  // Particle +1 effect
  const spawnParticle = (e) => {
    const p = { id: Date.now(), x: e.clientX, y: e.clientY }
    setParticles(prev => [...prev, p])
    setTimeout(() => setParticles(prev => prev.filter(x => x.id !== p.id)), 600)
  }

  // Add to cart
  const handleItemAdd = (item) => {
    useCartStore.getState().addItem({ ...item, qty: 1, modifiers: [], note: '' })
  }

  // Categories derived from fetched items
  const categories = useMemo(() => [
    { id: 'all', name: 'All' },
    ...Array.from(new Set((items || []).map(i => i.category).filter(Boolean))).map(c => ({ id: c, name: c })),
  ], [items])

  // Filtered items — single computed array, all filters applied together
  const displayedItems = useMemo(() => {
    if (!items || items.length === 0) return []
    return items.filter(item => {
      const matchesCategory =
        !activeCategory ||
        activeCategory === 'all' ||
        item.category === activeCategory
      const matchesVeg = !vegOnly || !!item.is_veg
      const matchesSearch = !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesVeg && matchesSearch
    })
  }, [items, activeCategory, vegOnly, searchQuery])

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', backgroundColor: '#F8F8F8', position: 'relative', fontFamily: 'Inter, sans-serif', overflowX: 'hidden' }}
    >
      {/* Keyframe */}
      <style>{`@keyframes flyUp { to { transform: translateY(-40px); opacity: 0; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── HEADER ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#1B2B4B', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'white', lineHeight: 1.2, letterSpacing: '-0.02em' }}>The Grand Spice</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
            {session.name ? `Hi, ${session.name} · TABLE ${getTableNum()}` : 'Table 03 · Dine-in'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Voice mic */}
          <button
            onClick={startVoiceSearch}
            style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', background: isRecording ? '#EF4444' : '#FE932C', boxShadow: '0 2px 8px rgba(254,147,44,0.35)', transition: 'background 0.2s' }}
            aria-label={isRecording ? 'Stop recording' : 'Voice search'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'white' }}>
              {isRecording ? 'stop' : 'mic'}
            </span>
          </button>
          {/* Cart icon */}
          <button
            id="header-cart-btn"
            onClick={() => setCartOpen(true)}
            style={{ position: 'relative', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            aria-label="Open cart"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'white', fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
            {cartItems.length > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#FE932C', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #1A365D' }}>
                {cartItems.reduce((a, i) => a + i.qty, 0)}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── SEARCH & VEG ROW ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        background: '#F8F8F8',
      }}>
        {/* Search bar — takes remaining space */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'white',
          borderRadius: '12px',
          padding: '12px 16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#9CA3AF' }}>search</span>
          <input
            type="text"
            placeholder={isRecording ? 'Listening...' : 'Search for dishes...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '15px',
              width: '100%',
              color: '#111827',
              fontWeight: 500
            }}
          />
        </div>

        {/* Veg toggle — right side of search row */}
        <div 
          onClick={() => setVegOnly(!vegOnly)}
          style={{
            height: '48px',
            padding: '0 12px',
            borderRadius: '12px',
            background: vegOnly ? '#DCFCE7' : 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            border: `1.5px solid ${vegOnly ? '#22C55E' : '#E5E7EB'}`,
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <span style={{ fontSize: '14px' }}>🟢</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: vegOnly ? '#16A34A' : '#4B5563' }}>VEG</span>
        </div>
      </div>

      {/* ── CATEGORY PILLS ── */}
      <div style={{ position: 'sticky', top: 74, zIndex: 20, backgroundColor: '#F8F8F8', padding: '4px 0 12px' }}>
        <CategoryBubbles
          categories={categories}
          activeCategory={activeCategory}
          onSelectCategory={setActiveCategory}
          size="full"
        />
      </div>

      {/* ── ITEM LIST ── */}
      <main style={{ padding: '4px 16px 200px' }}>
        {itemsLoading || items === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : displayedItems.length === 0 && items.length > 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <span style={{ fontSize: '48px' }}>🔍</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1B2B4B', marginTop: '16px' }}>No items found</h3>
            <p style={{ color: '#6B7280', fontSize: '14px', marginTop: '4px' }}>Try adjusting your search or filters</p>
            <button onClick={() => { setSearchQuery(''); setVegOnly(false); setActiveCategory('all') }} style={{ marginTop: '20px', color: '#F97316', fontWeight: 700, border: 'none', background: 'transparent' }}>Clear all filters</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {displayedItems.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx, 8) * 0.05 }}
                onClick={() => navigate(`/customer/item/${item.id}`)}
                style={{
                  display: 'flex',
                  background: 'white',
                  borderRadius: 16,
                  padding: 14,
                  gap: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  border: '1px solid #F3F4F6',
                  opacity: item.is_available ? 1 : 0.6,
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 2, border: item.is_veg ? '2px solid #22C55E' : '2px solid #EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.is_veg ? '#22C55E' : '#EF4444' }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{item.name}</span>
                  </div>
                  {item.description && (
                    <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4, margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: '#F97316' }}>₹{item.price}</span>
                    <AddButton item={item} onAdd={handleItemAdd} onAnimate={spawnParticle} />
                  </div>
                </div>
                <div style={{ position: 'relative', width: 90, height: 90, borderRadius: 12, overflow: 'hidden', flexShrink: 0, backgroundColor: '#F3F4F6' }}>
                  <img
                    src={item.image_url || `https://placehold.co/90x90?text=${encodeURIComponent(item.name[0])}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    alt={item.name}
                  />
                  {!item.is_available && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: 'white', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Sold Out</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* ── STICKY OVERLAY ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #E5E7EB',
        opacity: stickyVisible ? 1 : 0,
        visibility: stickyVisible ? 'visible' : 'hidden',
        transform: stickyVisible ? 'translateY(0)' : 'translateY(-10px)',
        transition: 'all 0.3s ease',
        pointerEvents: stickyVisible ? 'auto' : 'none',
      }}>
        <div style={{ padding: '8px 0' }}>
          <CategoryBubbles categories={categories} activeCategory={activeCategory} onSelectCategory={setActiveCategory} size="compact" />
        </div>
      </div>

      {/* ── CART FAB ── */}
      <CartBar visible={navVisible} onOpen={() => setCartOpen(true)} />

      {/* ── BOTTOM NAV ── */}
      <BottomNav visible={navVisible} />

      {/* ── CART DRAWER OVERLAY ── */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />

      {/* ── PARTICLES ── */}
      {particles.map(p => <Particle key={p.id} x={p.x} y={p.y} />)}
    </div>
  )
}
