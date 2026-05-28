/**
 * MenuHome.jsx
 * Ported from qr-restaurant-demo/src/components/MenuClient.tsx
 * Adapted: Next.js → Vite/React-Router, TypeScript → JSX, CSS vars → inline tokens,
 * next/image → <img>, @/... → relative imports, MENU_ITEMS → Supabase fetch
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useCartStore } from '../../../store/index'
import { useAvailabilityStore } from '../../../store/availabilityStore'
import { useAvailabilityPolling } from '../../../hooks/useAvailabilityPolling'
import { CartBar } from '../components/CartBar'
import { BottomNav } from '../components/BottomNav'
import CartDrawer from './CartDrawer'
import { motion } from 'framer-motion'
import { getTableNum } from '../utils/tableNum'
import { menuItems as mockMenuItems } from '../../../mock/data'

const TENANT_ID  = '11111111-1111-1111-1111-111111111111'
const STICKY_TRIGGER = 280
const NAV_SCROLL_THRESHOLD = 8

const CATEGORY_ORDER = ['Starters', 'Mains', 'Sides', 'Desserts', 'Beverages']

// ── Fly-to-cart: RAF-based so it works on every browser without CSS custom property issues ──
function spawnFlyToCart(startX, startY) {
  // #cart-fab-btn only exists after first item is added (CartBar renders null on empty cart)
  // So for the FIRST item we use a fixed bottom-center estimate of where it will appear
  const target  = document.getElementById('cart-fab-btn')
  let endX, endY
  if (target) {
    const r = target.getBoundingClientRect()
    endX = r.left + r.width  / 2
    endY = r.top  + r.height / 2
  } else {
    // CartBar not mounted yet — estimate its position at bottom center
    endX = window.innerWidth  / 2
    endY = window.innerHeight - 120   // ~where the CartBar will appear
  }

  // Inject cartBounce keyframe once
  if (!document.getElementById('fly-to-cart-style')) {
    const s = document.createElement('style')
    s.id = 'fly-to-cart-style'
    s.textContent = `
      @keyframes cartBounce {
        0%,100% { transform:scale(1); }
        35%     { transform:scale(1.15); }
        65%     { transform:scale(0.92); }
      }
    `
    document.head.appendChild(s)
  }

  // Create the flying dot
  const dot = document.createElement('div')
  dot.style.cssText = `
    position:fixed; pointer-events:none; z-index:99999;
    width:16px; height:16px; border-radius:50%;
    background:#F97316; opacity:1;
    left:${startX - 8}px; top:${startY - 8}px;
  `
  document.body.appendChild(dot)

  // Arc: slight left/up jump, then sweep DOWN to the View Cart bar at bottom
  const cp1 = { x: startX - 60, y: startY - 80 }   // jump left + slightly up
  const cp2 = { x: endX - 40,   y: endY - 40   }   // approach bar from above-left

  const DURATION = 520  // ms
  const start = performance.now()

  function tick(now) {
    const raw = Math.min((now - start) / DURATION, 1)
    const t   = raw < 0.5 ? 2*raw*raw : -1 + (4 - 2*raw)*raw  // ease-in-out

    // Cubic bezier: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
    const u  = 1 - t
    const x  = u*u*u*startX + 3*u*u*t*cp1.x + 3*u*t*t*cp2.x + t*t*t*endX
    const y  = u*u*u*startY + 3*u*u*t*cp1.y + 3*u*t*t*cp2.y + t*t*t*endY

    dot.style.left = `${x - 8}px`
    dot.style.top  = `${y - 8}px`

    // Shrink as it approaches the cart
    if (raw > 0.7) dot.style.transform = `scale(${1 - ((raw - 0.7) / 0.3)})`
    if (raw > 0.8) dot.style.opacity   = String(1 - ((raw - 0.8) / 0.2))

    if (t < 1) {
      requestAnimationFrame(tick)
    } else {
      dot.remove()
      // Re-query at end: CartBar is mounted now (item was added before animation completes)
      const barEl = target || document.getElementById('cart-fab-btn')
      if (barEl) {
        barEl.style.animation = 'cartBounce 280ms ease'
        barEl.addEventListener('animationend', () => { barEl.style.animation = '' }, { once: true })
      }
    }
  }

  requestAnimationFrame(tick)
}
// ── Inline +/stepper for each card ───────────────────────────────────────────
function AddButton({ item, onAdd, onCustomize, onAnimate }) {
  const cartItems = useCartStore(s => s.items)
  const [popping, setPopping] = useState(false)
  const [hovered, setHovered] = useState(false)

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

  if (!item.is_available) {
    return (
      <div style={{ padding: '8px 16px', borderRadius: 20, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#94A3B8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Out of Stock</span>
      </div>
    )
  }

  if (qty === 0) {
    return (
      <motion.button 
        onClick={handleAdd} 
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        whileTap={{ scale: 0.94 }}
        whileHover={{ scale: 1.04 }}
        style={{
          padding: '10px 24px', borderRadius: 24,
          background: hovered ? 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)' : '#FFFFFF', 
          color: hovered ? '#FFFFFF' : '#D91A2A',
          border: hovered ? '1.5px solid transparent' : '1.5px solid #D91A2A', cursor: 'pointer',
          fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: hovered ? '0 8px 20px rgba(217, 26, 42, 0.22)' : '0 2px 8px rgba(217, 26, 42, 0.04)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        aria-label={`Add ${item.name}`}
      >
        <span style={{ fontSize: 16, fontWeight: 900 }}>+</span> Add to Cart
      </motion.button>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#FEF2F2', padding: '6px 8px', borderRadius: 24, border: '1.5px solid #FEE2E2', boxShadow: '0 2px 8px rgba(217,26,42,0.03)' }}>
      <motion.button whileTap={{ scale: 0.85 }} onClick={decrement} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0F172A', background: 'white', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, fontWeight: 900 }}>remove</span>
      </motion.button>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#D91A2A', minWidth: 20, textAlign: 'center' }}>{qty}</span>
      <motion.button whileTap={{ scale: 0.85 }} onClick={increment} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer', boxShadow: '0 3px 10px rgba(217,26,42,0.22)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, fontWeight: 900 }}>add</span>
      </motion.button>
    </div>
  )
}

// ── MenuItemCard with flying dot animation ───────────────────────────
function MenuItemCard({ item, idx, navigate, handleItemAdd }) {
  const getAvailability = useAvailabilityStore(s => s.getAvailability)
  const availability = getAvailability(item.id)
  const visibility = availability.visibility_state
  const [hovered, setHovered] = useState(false)

  if (visibility === 'HIDDEN') return null;

  const mergedItem = { ...item, is_available: availability.is_available }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(idx, 8) * 0.05 }}
      whileHover={mergedItem.is_available ? { y: -5 } : {}}
      onMouseEnter={() => mergedItem.is_available && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/menu/item/${mergedItem.id}`)}
      style={{
        display: 'flex', 
        flexDirection: 'column',
        background: '#FFFFFF',
        borderRadius: '24px',
        boxShadow: hovered ? '0 16px 40px rgba(15, 23, 42, 0.08)' : '0 8px 30px rgba(0,0,0,0.015)',
        border: hovered ? '1px solid rgba(217, 26, 42, 0.15)' : '1px solid #F1F5F9',
        cursor: 'pointer', 
        position: 'relative', 
        overflow: 'hidden',
        opacity: mergedItem.is_available ? 1 : 0.65,
        transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* Top Image Container */}
      <div style={{ position: 'relative', width: '100%', height: 200, background: '#F1F5F9', overflow: 'hidden' }}>
        <img
          src={mergedItem.image_url || `https://placehold.co/400x200?text=${encodeURIComponent(mergedItem.name)}`}
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          alt={mergedItem.name}
        />
        {/* Popular Tag Overlay */}
        {mergedItem.is_popular !== false && (
          <div style={{ 
            position: 'absolute', top: 12, right: 12, 
            background: 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)', 
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: 800,
            padding: '4px 10px',
            borderRadius: 12,
            boxShadow: '0 4px 10px rgba(217, 26, 42, 0.22)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Popular
          </div>
        )}
        {!mergedItem.is_available && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#0F172A', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Details Container */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>{mergedItem.name}</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#D91A2A', fontFamily: 'Outfit, sans-serif' }}>₹ {mergedItem.price.toFixed(2)}</span>
        </div>

        {mergedItem.description && (
          <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.4, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {mergedItem.description}
          </p>
        )}

        {/* Tags Row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {mergedItem.is_veg ? (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#ECFDF5', padding: '4px 8px', borderRadius: 8, border: '1px solid #A7F3D0' }}>Veg</span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 800, color: '#D91A2A', background: '#FEF2F2', padding: '4px 8px', borderRadius: 8, border: '1px solid #FEE2E2' }}>Non-Veg</span>
          )}
          {mergedItem.attributes?.map(attr => (
            <span key={attr} style={{ fontSize: 10, fontWeight: 800, color: '#64748B', background: '#F1F5F9', padding: '4px 8px', borderRadius: 8 }}>{attr}</span>
          ))}
        </div>

        {/* Add to Cart button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
          <AddButton item={mergedItem} onAdd={handleItemAdd} onAnimate={(e) => spawnFlyToCart(e.clientX, e.clientY)} />
        </div>
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MenuHome() {
  const navigate    = useNavigate()
  const cartItems   = useCartStore(s => s.items)

  // Hardcode Branch ID for testing purposes (since frontend demo isn't dynamically routing)
  const BRANCH_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

  // Initialize availability polling
  useAvailabilityPolling({ tenantId: TENANT_ID, branchId: BRANCH_ID, intervalMs: 15000 })

  // Read checked-in session for personalised header
  const session = (() => { try { return JSON.parse(localStorage.getItem('customerSession') || '{}') } catch { return {} } })()

  const [items,           setItems]           = useState(null)  // null = loading, [] = loaded
  const [itemsLoading,    setItemsLoading]    = useState(true)
  const [searchQuery,     setSearchQuery]     = useState('')
  const [vegOnly,         setVegOnly]         = useState(false)
  const [searchFocused,   setSearchFocused]   = useState(false)
  const [activeCategory,  setActiveCategory]  = useState('all')
  const [isRecording,     setIsRecording]     = useState(false)
  const [scrollY,         setScrollY]         = useState(0)
  const [lastScrollY,     setLastScrollY]     = useState(0)
  const [stickyVisible,   setStickyVisible]   = useState(false)
  const [searchInSticky,  setSearchInSticky]  = useState(false)
  const [navVisible,      setNavVisible]      = useState(true)
  const [lastScrollForNav,setLastScrollForNav]= useState(0)
  const [cartOpen,        setCartOpen]        = useState(false)
  const [showSearch,      setShowSearch]      = useState(true)

  const sectionRefs      = useRef({})   // section header DOM elements
  const activeTabRef     = useRef(null) // ref on the currently active tab button
  const pillsRef         = useRef(null) // ref on the horizontal pill container
  const isManualScroll   = useRef(false) // true while a tab-click scroll is in progress

  const recognitionRef = useRef(null)

  // Direct Supabase fetch — bypasses store initialization guard
  useEffect(() => {
    const fetchItems = async () => {
      setItemsLoading(true)
      try {
        const { data, error } = await supabase
          .from('menu_items')
          .select('*')
          .eq('tenant_id', TENANT_ID)
          .order('sort_order', { ascending: true })
        if (error || !data || data.length === 0) {
          console.error('Menu fetch error or empty, falling back to mock data')
          throw new Error('Fallback')
        }
        console.log('Fetched items:', data?.length, data)
        setItems(data)
      } catch (err) {
        // Fallback to mock data if backend fetch fails or returns empty
        const formattedMockData = mockMenuItems.map(item => ({
          ...item,
          image_url: item.image,
          is_veg: item.name.toLowerCase().includes('paneer') || item.name.toLowerCase().includes('mushroom') || item.category === 'Sides' || item.category === 'Desserts' || item.category === 'Beverages' || item.name.toLowerCase().includes('dal makhani'),
        }))
        setItems(formattedMockData)
      }
      setItemsLoading(false)
    }
    fetchItems()
  }, [])

  // Scroll tracking — hide/show nav + sticky overlay + search bar (Issues 5 & 6)
  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY
      const dir     = current > lastScrollY ? 'down' : 'up'
      setScrollY(current)

      // Issue 5: instant show on scroll-up, hide on scroll-down > 60px
      if (current < lastScrollY) {
        setShowSearch(true)
      } else if (current > lastScrollY + 60) {
        setShowSearch(false)
      }

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

  // Add to cart
  const handleItemAdd = (item) => {
    useCartStore.getState().addItem({ ...item, qty: 1, modifiers: [], note: '' })
  }

  // Categories derived from fetched items
  const categories = useMemo(() => [
    { id: 'all', name: 'All' },
    ...Array.from(new Set((items || []).map(i => i.category).filter(Boolean))).map(c => ({ id: c, name: c })),
  ], [items])

  // Filtered items — category tab does NOT filter; only veg + search filter items
  const displayedItems = useMemo(() => {
    if (!items || items.length === 0) return []
    return items.filter(item => {
      const matchesVeg    = !vegOnly || !!item.is_veg
      const matchesSearch = !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchQuery.toLowerCase())
      return matchesVeg && matchesSearch
    })
  }, [items, vegOnly, searchQuery])

  // Scroll spy — sort all passed sections by their top DESC to find the most-recently-scrolled-past one
  // [] deps: runs once, reads sectionRefs.current live every scroll event
  useEffect(() => {
    const STICKY_H = 190  // approx: header(70) + search(60) + pills(60)
    const onScrollSpy = () => {
      if (isManualScroll.current) return  // paused during programmatic scrolling
      const passed = Object.entries(sectionRefs.current)
        .filter(([, el]) => el != null)
        .map(([cat, el]) => ({ cat, top: el.getBoundingClientRect().top }))
        .filter(({ top }) => top < STICKY_H)  // sections that have scrolled above sticky bar
        .sort((a, b) => b.top - a.top)        // highest top = most recently scrolled past
      const nextCat = passed.length > 0 ? passed[0].cat : 'all'
      setActiveCategory(prev => prev === nextCat ? prev : nextCat)
    }
    window.addEventListener('scroll', onScrollSpy, { passive: true })
    return () => window.removeEventListener('scroll', onScrollSpy)
  }, [])

  // Scroll the active pill into view inside the pill bar ONLY — never touches window scroll
  useEffect(() => {
    const tab = activeTabRef.current
    const container = pillsRef.current
    if (!tab || !container) return
    // Center the active tab within the horizontal pill container
    const targetLeft = tab.offsetLeft - (container.offsetWidth - tab.offsetWidth) / 2
    container.scrollTo({ left: targetLeft, behavior: 'smooth' })
  }, [activeCategory])

  // ── EASTER EGG: type "antigravity" anywhere to float everything up ────────
  useEffect(() => {
    const TRIGGER = 'antigravity'
    let typed = ''
    let rafId = null
    let particles = []
    let isActive = false

    function activate() {
      if (isActive) return
      isActive = true

      // Collect every visible element on the page (excluding html/body wrappers)
      particles = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          if (el === document.documentElement || el === document.body) return false
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return r.width > 0 && r.height > 0 &&
                 s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
        })
        .map(el => ({
          el,
          y: 0, x: 0, rot: 0,
          vy: -(0.4 + Math.random() * 1.4),    // upward velocity px/frame (varied)
          vx: (Math.random() - 0.5) * 0.5,     // gentle horizontal drift
          vrot: (Math.random() - 0.5) * 0.35,  // rotation wobble
          delay: Math.floor(Math.random() * 80), // staggered start (frames)
          started: false,
          prevTransition: el.style.transition,
          prevTransform: el.style.transform,
        }))

      let frame = 0
      function tick() {
        frame++
        particles.forEach(p => {
          if (frame < p.delay) return   // staggered: not all start at once
          if (!p.started) {
            p.started = true
            p.el.style.transition = 'none'  // freeze CSS transitions during flight
          }
          p.vy -= 0.015             // gentle acceleration upward (reverse gravity)
          p.y  += p.vy
          p.x  += p.vx
          p.rot += p.vrot
          // Soft rotation bounce between -15deg and +15deg
          if (p.rot >  15) { p.rot =  15; p.vrot *= -0.7 }
          if (p.rot < -15) { p.rot = -15; p.vrot *= -0.7 }
          p.el.style.transform =
            `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) rotate(${p.rot.toFixed(2)}deg)`
        })
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }

    function deactivate() {
      if (!isActive) return
      isActive = false
      if (rafId) cancelAnimationFrame(rafId)
      // Smoothly return each element to its original position
      particles.forEach(p => {
        p.el.style.transition = 'transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        p.el.style.transform  = p.prevTransform || ''
      })
      setTimeout(() => {
        particles.forEach(p => { p.el.style.transition = p.prevTransition || '' })
        particles = []
      }, 850)
    }

    function onKey(e) {
      if (e.key === 'Escape') { deactivate(); typed = ''; return }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
      typed = (typed + e.key.toLowerCase()).slice(-TRIGGER.length)
      if (typed === TRIGGER) { activate(); typed = '' }
    }

    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); deactivate() }
  }, [])

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#F1F5F9', position: 'relative', fontFamily: 'Inter, sans-serif', overflowX: 'hidden', paddingBottom: 160 }}>
      {/* Premium CSS Styles */}
      <style>{`
        @keyframes flyUp { to { transform: translateY(-40px); opacity: 0; } } 
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .premium-header-bg {
          position: relative;
          background: #FFFFFF;
        }
        
        .premium-active-pill {
          position: relative;
          background: linear-gradient(135deg, #FF4D4D 0%, #E11D48 100%) !important;
          color: #FFFFFF !important;
        }
        
        /* Smooth category pill transition */
        .category-pill {
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .category-pill::after {
          content: '';
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
        }
      `}</style>
      
      {/* ── HEADER (Gusto White Theme) ── */}
      <motion.header 
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 120 }}
        style={{ 
          position: 'sticky', top: 0, zIndex: 30, 
          padding: '12px 20px', 
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(16px) saturate(120%)',
          WebkitBackdropFilter: 'blur(16px) saturate(120%)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
          borderBottom: '1px solid rgba(241, 245, 249, 0.8)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 20, color: '#D91A2A' }}>🍴</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#D91A2A', letterSpacing: '0.05em', fontFamily: 'Outfit, sans-serif' }}>GUSTO</span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Voice Mic Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startVoiceSearch}
              style={{ 
                width: 36, height: 36, borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                border: '1px solid #E2E8F0', cursor: 'pointer', 
                background: isRecording ? '#D91A2A' : '#F8FAFC', 
                color: isRecording ? '#FFFFFF' : '#64748B', 
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                animation: isRecording ? 'pulse-ring 2s infinite ease-in-out' : 'none',
                boxShadow: isRecording ? '0 0 0 8px rgba(217, 26, 42, 0.15)' : 'none'
              }}
              aria-label={isRecording ? 'Stop recording' : 'Voice search'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {isRecording ? 'stop' : 'mic'}
              </span>
            </motion.button>

            {/* Cart Icon Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              id="header-cart-btn"
              onClick={() => setCartOpen(true)}
              style={{ 
                position: 'relative', width: 36, height: 36, borderRadius: '50%', 
                background: '#F8FAFC', 
                color: '#64748B', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                border: '1px solid #E2E8F0', 
                cursor: 'pointer',
              }}
              aria-label="Open cart"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_cart</span>
              {cartItems.length > 0 && (
                <span style={{ 
                  position: 'absolute', top: -4, right: -4, 
                  minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, 
                  background: '#D91A2A', 
                  color: '#FFFFFF', fontSize: 9, fontWeight: 800, 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  border: '1.5px solid #FFFFFF', 
                  boxShadow: '0 2px 5px rgba(0,0,0,0.1)' 
                }}>
                  {cartItems.reduce((a, i) => a + i.qty, 0)}
                </span>
              )}
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* ── SEARCH & FILTER ROW ── */}
      <div style={{ 
        display: 'flex', alignItems: 'center', gap: 12, 
        padding: '16px 20px', 
        background: 'rgba(248, 250, 252, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky', top: 62, zIndex: 20, 
        transform: showSearch ? 'translateY(0)' : 'translateY(-120%)', 
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        boxShadow: showSearch ? '0 10px 20px rgba(0,0,0,0.01)' : 'none',
        borderBottom: '1px solid rgba(241, 245, 249, 0.5)'
      }}>
        <div style={{ 
          flex: 1, display: 'flex', alignItems: 'center', gap: 10, 
          background: '#FFFFFF', borderRadius: 24, padding: '10px 16px', 
          boxShadow: searchFocused ? '0 0 0 4px rgba(217, 26, 42, 0.06), 0 4px 18px rgba(0,0,0,0.02)' : '0 4px 18px rgba(0,0,0,0.01)', 
          border: searchFocused ? '1.5px solid #D91A2A' : '1px solid #E2E8F0',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: searchFocused ? '#D91A2A' : '#94A3B8', transition: 'color 0.2s' }}>search</span>
          <input
            type="text"
            placeholder={isRecording ? 'Listening...' : 'Search menu...'}
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 14, width: '100%', color: '#0F172A', fontWeight: 500 }}
          />
        </div>

        <button 
          onClick={() => setVegOnly(!vegOnly)}
          style={{ 
            width: 42, height: 42, borderRadius: '50%', 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', 
            background: vegOnly ? '#059669' : '#FFFFFF', 
            border: vegOnly ? 'none' : '1px solid #E2E8F0', 
            color: vegOnly ? 'white' : '#64748B', 
            boxShadow: vegOnly ? '0 6px 18px rgba(5, 150, 105, 0.3)' : '0 4px 18px rgba(0,0,0,0.01)' 
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>tune</span>
        </button>
      </div>

      {/* ── CATEGORY PILLS ── */}
      <div data-sticky style={{ 
        position: 'sticky', 
        top: 132, 
        zIndex: 20, 
        background: 'rgba(248, 250, 252, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        paddingBottom: 12,
        borderBottom: '1px solid rgba(241, 245, 249, 0.5)'
      }}>
        <div 
          ref={pillsRef} 
          className="hide-scrollbar"
          style={{ 
            display: 'flex', gap: 8, overflowX: 'auto', 
            padding: '0 20px', alignItems: 'center'
          }}
        >
          {categories.map(cat => {
            const isActive = activeCategory === cat.id
            return (
              <motion.button
                key={cat.id}
                ref={isActive ? activeTabRef : null}
                whileTap={{ scale: 0.94 }}
                whileHover={{ scale: 1.03 }}
                onClick={() => {
                  if (cat.id === 'all') {
                    isManualScroll.current = true
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                    setActiveCategory('all')
                    setTimeout(() => { isManualScroll.current = false }, 1200)
                  } else {
                    const el = sectionRefs.current[cat.id]
                    if (el) {
                      isManualScroll.current = true
                      const y = el.getBoundingClientRect().top + window.scrollY - 180
                      window.scrollTo({ top: y, behavior: 'smooth' })
                      setActiveCategory(cat.id)
                      setTimeout(() => { isManualScroll.current = false }, 1200)
                    }
                  }
                }}
                style={{
                  flexShrink: 0, 
                  padding: '8px 16px', 
                  borderRadius: 20, 
                  fontSize: 13, 
                  fontWeight: 800, 
                  cursor: 'pointer', 
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  background: isActive ? 'linear-gradient(135deg, #FF4D4D 0%, #D91A2A 100%)' : '#FFFFFF',
                  color: isActive ? '#FFFFFF' : '#64748B',
                  border: isActive ? 'none' : '1px solid #E2E8F0',
                  boxShadow: isActive ? '0 6px 16px rgba(217, 26, 42, 0.22)' : 'none',
                }}
              >
                <span style={{ position: 'relative', zIndex: 2 }}>{cat.name}</span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* ── ITEM LIST ── */}
      <main style={{ padding: '24px 24px 200px' }}>
        {itemsLoading || items === null ? (
          <>
            <style>{`
              @keyframes shimmerLight {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ padding: '16px', borderRadius: 20, display: 'flex', gap: 16, background: '#FFFFFF', border: '1px solid #F1F5F9' }}>
                  <div style={{ width: 84, height: 84, borderRadius: 16, flexShrink: 0, background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)', backgroundSize: '200% 100%', animation: 'shimmerLight 1.5s infinite' }}/>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ height: 16, background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)', borderRadius: 4, marginBottom: 8, width: '60%', backgroundSize: '200% 100%', animation: 'shimmerLight 1.5s infinite' }}/>
                    <div style={{ height: 12, background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)', borderRadius: 4, width: '100%', marginBottom: 12, backgroundSize: '200% 100%', animation: 'shimmerLight 1.5s infinite' }}/>
                    <div style={{ height: 16, background: 'linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%)', borderRadius: 4, width: '30%', backgroundSize: '200% 100%', animation: 'shimmerLight 1.5s infinite' }}/>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : displayedItems.length === 0 && items.length > 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ width: 80, height: 80, background: '#F1F5F9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#94A3B8' }}>search_off</span>
            </div>
            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>No dishes found</h3>
            <p style={{ color: '#64748B', fontSize: 14, margin: '0 0 24px' }}>Try adjusting your search or turning off the veg filter.</p>
            <button 
              onClick={() => { setSearchQuery(''); setVegOnly(false); setActiveCategory('all') }} 
              style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', color: '#FFFFFF', borderRadius: 24, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)' }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {(() => {
              const allCats = Array.from(new Set(displayedItems.map(i => i.category).filter(Boolean)))
              const ordered = [
                ...CATEGORY_ORDER.filter(c => allCats.includes(c)),
                ...allCats.filter(c => !CATEGORY_ORDER.includes(c))
              ]
              return ordered.map(cat => {
                const catItems = displayedItems.filter(i => i.category === cat)
                if (!catItems.length) return null
                return (
                  <motion.div key={cat} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <h2
                      ref={el => sectionRefs.current[cat] = el}
                      style={{ 
                        fontFamily: 'Outfit, sans-serif', 
                        fontSize: 20, 
                        fontWeight: 800, 
                        color: '#0F172A', 
                        paddingTop: 8, 
                        paddingBottom: 16, 
                        margin: 0,
                        letterSpacing: '-0.02em'
                      }}
                    >
                      {cat}
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {catItems.map((item, idx) => (
                        <MenuItemCard key={item.id} item={item} idx={idx} navigate={navigate} handleItemAdd={handleItemAdd} />
                      ))}
                    </div>
                  </motion.div>
                )
              })
            })()}
          </div>
        )}
      </main>

      {/* ── CART FAB ── */}
      <CartBar visible={navVisible} onOpen={() => setCartOpen(true)} />

      {/* ── BOTTOM NAV ── */}
      <BottomNav visible={navVisible} />

      {/* ── CART DRAWER OVERLAY ── */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}
