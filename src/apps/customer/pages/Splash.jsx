import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getQrSession } from '../utils/qrSession'

export default function Splash() {
  const navigate = useNavigate()
  const location = window.location
  const [searchParams] = useSearchParams()
  const { restaurantName } = getQrSession(searchParams)

  useEffect(() => {
    const timer = setTimeout(() => navigate(`/menu/checkin${location.search}`), 2000)
    return () => clearTimeout(timer)
  }, [navigate, location.search])

  return (
    <div style={{ minHeight: '100vh', background: '#E31E24', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 24, position: 'relative', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>

      {/* Logo circle */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ width: 100, height: 100, background: '#FFFFFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
      >
        <span style={{ color: '#E31E24', fontSize: 44, fontWeight: 900 }}>
          {(restaurantName || 'G')[0].toUpperCase()}
        </span>
      </motion.div>

      {/* Restaurant name */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        style={{ color: 'white', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', textAlign: 'center', margin: 0 }}
      >
        {restaurantName || 'Menu'}
      </motion.h1>

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 12, textAlign: 'center', fontWeight: 500 }}
      >
        Crafting flavors, stitching memories
      </motion.p>

      {/* Table badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{ position: 'absolute', bottom: 40, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '10px 24px' }}
      >
        <span style={{ color: 'white', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em' }}>TABLE {import.meta.env.VITE_DEMO_TABLE_NUM || 'T03'}</span>
      </motion.div>

      {/* Loading dots */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        style={{ position: 'absolute', bottom: 100, display: 'flex', gap: 8 }}
      >
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            style={{ width: 6, height: 6, background: '#E31E24', borderRadius: '50%' }}
          />
        ))}
      </motion.div>

    </div>
  )
}
