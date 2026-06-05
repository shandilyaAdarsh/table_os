/**
 * MenuHome.jsx
 * Ported from qr-restaurant-demo/src/components/MenuClient.tsx
 * Adapted: Next.js → Vite/React-Router, TypeScript → JSX, CSS vars → inline tokens,
 * next/image → <img>, @/... → relative imports, MENU_ITEMS → Supabase fetch
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithRuntime } from '../../../lib/apiClient'
import { supabase } from '../../../lib/supabase'
import { useMenuStore, useCartStore } from '../../../store/index'
import { useAvailabilityStore } from '../../../store/availabilityStore'
import { useAvailabilityPolling } from '../../../hooks/useAvailabilityPolling'
import { CategoryBubbles } from '../components/CategoryBubbles'
import { CartBar } from '../components/CartBar'
import { BottomNav } from '../components/BottomNav'
import { SkeletonCard } from '../components/SkeletonCard'
import CartDrawer from './CartDrawer'
import { motion } from 'framer-motion'
import { getTableNum } from '../utils/tableNum'

const TENANT_ID = import.meta.env.VITE_TENANT_ID || '11111111-1111-1111-1111-111111111111'
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
    background:#E31E24; opacity:1;
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

// Legacy Particle component kept for compatibility — renders nothing (spawnFlyToCart handles it)
function Particle() { return null }

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
    background: '#E31E24', color: 'white',
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
      <button onClick={decrement} style={{ border: 'none', background: 'transparent', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E31E24', cursor: 'pointer', fontSize: 18 }}>−</button>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1C1E', minWidth: 12, textAlign: 'center' }}>{qty}</span>
      <button onClick={increment} style={{ border: 'none', background: 'transparent', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E31E24', cursor: 'pointer', fontSize: 18 }}>+</button>
    </div>
  )
}

// ── Issue 7: MenuItemCard with flying dot animation ───────────────────────────
function MenuItemCard({ item, idx, navigate, handleItemAdd }) {
  const getAvailability = useAvailabilityStore(s => s.getAvailability)
  const availability = getAvailability(item.id)
  const visibility = availability.visibility_state

  if (visibility === 'HIDDEN') return null;

  const mergedItem = { ...item, is_available: availability.is_available }

  const handleAdd = (e) => {
    e.stopPropagation()
    spawnFlyToCart(e.clientX, e.clientY)
    setTimeout(() => handleItemAdd(mergedItem), 100)
  }

  return (
    <div
      onClick={() => navigate(`/menu/item/${mergedItem.id}`)}
      style={{
        display: 'flex', background: 'white', borderRadius: 16, padding: 14, gap: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #F3F4F6',
        opacity: mergedItem.is_available ? 1 : 0.6, position: 'relative', cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, border: mergedItem.is_veg ? '2px solid #22C55E' : '2px solid #EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: mergedItem.is_veg ? '#22C55E' : '#EF4444' }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1C1E' }}>{mergedItem.name}</span>
        </div>
        {mergedItem.description && (
          <p style={{ fontSize: 12, color: '#6C757D', lineHeight: 1.4, margin: '0 0 10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {mergedItem.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#E31E24' }}>₹{mergedItem.price}</span>
          <AddButton item={mergedItem} onAdd={handleItemAdd} onAnimate={(e) => spawnFlyToCart(e.clientX, e.clientY)} />
        </div>
      </div>

      <div style={{ position: 'relative', width: 90, height: 90, borderRadius: 12, overflow: 'hidden', flexShrink: 0, backgroundColor: '#F3F4F6' }}>
        <img
          src={mergedItem.image_url || `https://placehold.co/90x90?text=${encodeURIComponent(mergedItem.name[0])}`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt={mergedItem.name}
        />
        {!mergedItem.is_available && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', textAlign: 'center', padding: '0 4px' }}>
              {visibility === 'SOLD_OUT' ? 'Sold Out' : 
               visibility === 'PAUSED' ? 'Paused' :
               visibility === 'SCHEDULE_RESTRICTED' ? 'Available Later' : 'Unavailable'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MenuHome() {
  const navigate    = useNavigate()
  const cartItems   = useCartStore(s => s.items)

  // Hardcode Branch ID for testing purposes (since frontend demo isn't dynamically routing)
  const BRANCH_ID = '24b06752-edde-4983-86d6-b869481e968d'

  // Initialize availability polling
  useAvailabilityPolling({ tenantId: TENANT_ID, branchId: BRANCH_ID, intervalMs: 15000 })

  // Read checked-in session for personalised header
  const session = (() => { try { return JSON.parse(localStorage.getItem('customerSession') || '{}') } catch { return {} } })()

  const [items,           setItems]           = useState(null)  // null = loading, [] = loaded
  const [itemsLoading,    setItemsLoading]    = useState(true)
  const [fetchError,      setFetchError]      = useState(null)

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
  const [showSearch,      setShowSearch]      = useState(true)

  const sectionRefs      = useRef({})   // section header DOM elements
  const activeTabRef     = useRef(null) // ref on the currently active tab button
  const pillsRef         = useRef(null) // ref on the horizontal pill container
  const isManualScroll   = useRef(false) // true while a tab-click scroll is in progress

  const recognitionRef = useRef(null)

  // Direct Supabase fetch — bypasses store initialization guard
  useEffect(() => {
    const fetchItems = async (showShimmer = true) => {
      if (showShimmer) setItemsLoading(true)
      setFetchError(null)
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Supabase request timed out after 15 seconds! (Network/Service worker latency?)')), 15000)
        )
        
        const fetchItemsPromise = supabase
          .from('menu_items')
          .select('*')
          .eq('tenant_id', TENANT_ID)
          .order('sort_order', { ascending: true })

        const fetchCatsPromise = supabase
          .from('menu_categories')
          .select('id, name')
          .eq('tenant_id', TENANT_ID)

        const [itemsRes, catsRes] = await Promise.all([
          Promise.race([fetchItemsPromise, timeoutPromise]),
          Promise.race([fetchCatsPromise, timeoutPromise])
        ])
        
        if (itemsRes.error || !itemsRes.data) {
          throw new Error(itemsRes.error?.message || 'Empty menu items data')
        }
        
        const catMap = {}
        if (catsRes.data) {
          catsRes.data.forEach(c => catMap[c.id] = c.name)
        }

        const transformedData = itemsRes.data.map(item => ({
          ...item,
          category: catMap[item.category_id] || 'Uncategorized',
          is_veg: item.dietary_tags?.includes('vegetarian') || false,
        }))
        
        console.log('Fetched items:', transformedData?.length, transformedData)
        setItems(transformedData || [])
      } catch (error) {
        console.error('Menu fetch error:', error)
        setFetchError(error.message)
        if (showShimmer) setItems([])
      }
      if (showShimmer) setItemsLoading(false)
    }
    
    fetchItems(true)

    // Subscribe to realtime database changes for automatic sync when admin adds/edits items
    const channel = supabase
      .channel('customer_menu_sync')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'menu_items',
        filter: `tenant_id=eq.${TENANT_ID}`,
      }, (payload) => {
        console.log('Realtime menu item update detected:', payload.eventType, payload.new, 'refetching...')
        fetchItems(false)
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'menu_categories',
        filter: `tenant_id=eq.${TENANT_ID}`,
      }, (payload) => {
        console.log('Realtime category update detected:', payload.eventType, payload.new, 'refetching...')
        fetchItems(false)
      })
      .subscribe((status, err) => {
        console.log(`[Realtime Sync] Channel status: ${status}`, err || '')
      })

    return () => {
      supabase.removeChannel(channel)
    }
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
      setActiveCategory(passed.length > 0 ? passed[0].cat : 'all')
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
    <div
      style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', backgroundColor: '#F8F8F8', position: 'relative', fontFamily: '"Plus Jakarta Sans", sans-serif', overflowX: 'hidden' }}
    >
      {/* Keyframe */}
      <style>{`@keyframes flyUp { to { transform: translateY(-40px); opacity: 0; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── HEADER ── */}
      <header data-sticky style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#E31E24', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', background: isRecording ? '#EF4444' : '#E31E24', boxShadow: '0 2px 8px rgba(254,147,44,0.35)', transition: 'background 0.2s' }}
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
              <span style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#E31E24', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #E31E24' }}>
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
        // Issue 5: instant show/hide based on scroll direction
        transform: showSearch ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.15s ease',
        position: 'sticky',
        top: 74,
        zIndex: 25,
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
              color: '#1A1C1E',
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
      <div data-sticky style={{ position: 'sticky', top: 122, zIndex: 20, backgroundColor: '#F8F8F8', padding: '4px 0 12px' }}>
        {/* Issue 6: render category tabs with activeTabRef on active tab */}
        <div ref={pillsRef} style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px', scrollbarWidth: 'none' }}>
          {categories.map(cat => {
            // activeCategory tracks which section is in view (scroll spy) or was tapped
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                ref={isActive ? activeTabRef : null}
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
                      const y = el.getBoundingClientRect().top + window.scrollY - 185
                      window.scrollTo({ top: y, behavior: 'smooth' })
                      setActiveCategory(cat.id)
                      setTimeout(() => { isManualScroll.current = false }, 1200)
                    }
                  }
                }}
                style={{
                  flexShrink: 0,
                  padding: '8px 18px',
                  borderRadius: 999,
                  border: 'none',
                  background: isActive ? '#E31E24' : 'white',
                  color: isActive ? 'white' : '#6C757D',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 2px 8px rgba(27,43,75,0.2)' : '0 1px 4px rgba(0,0,0,0.06)',
                  transition: 'all 0.2s',
                }}
              >
                {cat.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── ITEM LIST ── */}
      <main style={{ padding: '4px 16px 200px' }}>

        {itemsLoading || items === null ? (
          // Issue 8: inline shimmer skeleton
          <>
            <style>{`
              @keyframes shimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
            <div style={{ padding: '4px 0' }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{
                  background: 'white', borderRadius: '16px', padding: '16px',
                  marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center',
                  border: '1px solid #F3F4F6'
                }}>
                  <div style={{
                    width: '90px', height: '90px', borderRadius: '12px', flexShrink: 0,
                    background: 'linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite'
                  }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: '16px', background: 'linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)', borderRadius: '8px', marginBottom: '8px', width: '70%', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}/>
                    <div style={{ height: '12px', background: 'linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)', borderRadius: '8px', width: '90%', marginBottom: '8px', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}/>
                    <div style={{ height: '14px', background: 'linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)', borderRadius: '8px', width: '40%', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}/>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : fetchError ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <span style={{ fontSize: '48px' }}>⚠️</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#E31E24', marginTop: '16px' }}>Connection Issue</h3>
            <p style={{ color: '#6C757D', fontSize: '14px', marginTop: '4px' }}>{fetchError}</p>
            <button onClick={() => window.location.reload()} style={{ marginTop: '20px', background: '#E31E24', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <span style={{ fontSize: '48px' }}>🍽️</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#E31E24', marginTop: '16px' }}>No Menu Available</h3>
            <p style={{ color: '#6C757D', fontSize: '14px', marginTop: '4px' }}>There are currently no items on the menu for this branch.</p>
          </div>
        ) : displayedItems.length === 0 && items.length > 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <span style={{ fontSize: '48px' }}>🔍</span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#E31E24', marginTop: '16px' }}>No items found</h3>
            <p style={{ color: '#6C757D', fontSize: '14px', marginTop: '4px' }}>Try adjusting your search or filters</p>
            <button onClick={() => { setSearchQuery(''); setVegOnly(false); setActiveCategory('all') }} style={{ marginTop: '20px', color: '#E31E24', fontWeight: 700, border: 'none', background: 'transparent' }}>Clear all filters</button>
          </div>
        ) : (
          // Always render grouped — categories are scroll anchors, not filters
          <div style={{ display: 'flex', flexDirection: 'column' }}>
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
                  <div key={cat}>
                    <div
                      ref={el => sectionRefs.current[cat] = el}
                      style={{
                        fontSize: '11px', fontWeight: '600',
                        letterSpacing: '0.08em', color: '#6C757D',
                        textTransform: 'uppercase',
                        padding: '16px 0 8px', margin: '0'
                      }}
                    >
                      {cat}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {catItems.map((item, idx) => <MenuItemCard key={item.id} item={item} idx={idx} navigate={navigate} handleItemAdd={handleItemAdd} spawnParticle={spawnParticle} />)}
                    </div>
                  </div>
                )
              })
            })()}
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
