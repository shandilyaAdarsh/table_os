import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useStaffStore } from '../../../store/index'

export default function StaffLogin() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login, staff_user } = useStaffStore()

  // If already logged in, skip login
  useEffect(() => {
    if (staff_user) navigate('/pos/tables')
  }, [staff_user, navigate])

  const handlePress = async (num) => {
    if (loading || pin.length >= 4) return
    
    setError(false)
    const newPin = pin + num
    setPin(newPin)

    // Auto-submit on 4th digit
    if (newPin.length === 4) {
      setLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from('staff')
          .select('id, name, role, pin_code')
          .eq('pin_code', newPin)
          .eq('tenant_id', '11111111-1111-1111-1111-111111111111')
          .eq('is_active', true)
          .single()

        if (fetchError || !data) throw new Error('Invalid PIN')

        // Success
        login({ id: data.id, name: data.name, role: data.role })
        navigate('/pos/tables')
        
      } catch (err) {
        console.error(err)
        setError(true)
        setTimeout(() => setPin(''), 500) // Clear pin after shake animation
      } finally {
        setLoading(false)
      }
    }
  }

  const handleDelete = () => {
    if (loading) return
    setError(false)
    setPin(p => p.slice(0, -1))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0D1117', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 32, background: '#161B22', borderRadius: 16, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ color: 'white', fontFamily: 'Epilogue, sans-serif', fontSize: 24, margin: '0 0 8px', fontWeight: 800, letterSpacing: '0.05em' }}>TABLEOS</h1>
          <p style={{ color: '#8B949E', fontSize: 14, margin: 0 }}>Staff Login</p>
        </div>

        {/* PIN Dots Display */}
        <div 
          style={{ 
            display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 48,
            animation: error ? 'shake 0.4s ease-in-out' : 'none'
          }}
        >
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              20%, 60% { transform: translateX(-8px); }
              40%, 80% { transform: translateX(8px); }
            }
          `}</style>
          {[0, 1, 2, 3].map(i => (
            <div 
              key={i} 
              style={{
                width: 14, height: 14, borderRadius: '50%',
                background: i < pin.length ? 'white' : 'transparent',
                border: i < pin.length ? 'none' : '2px solid #30363D',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>

        {/* Numpad */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handlePress(num.toString())}
                disabled={loading}
                style={{
                  background: '#1C2128', border: 'none', borderRadius: 12, 
                  width: 64, height: 64,
                  color: 'white', fontSize: 22, fontWeight: 700, fontFamily: 'Epilogue, sans-serif',
                  cursor: loading ? 'default' : 'pointer', transition: 'background 0.1s'
                }}
                onPointerDown={e => e.currentTarget.style.background = '#30363D'}
                onPointerUp={e => e.currentTarget.style.background = '#1C2128'}
                onPointerLeave={e => e.currentTarget.style.background = '#1C2128'}
              >
                {num}
              </button>
            ))}
            
            <div /> {/* Empty spacer */}
            
            <button
              onClick={() => handlePress('0')}
              disabled={loading}
              style={{
                background: '#1C2128', border: 'none', borderRadius: 12,
                width: 64, height: 64,
                color: 'white', fontSize: 22, fontWeight: 700, fontFamily: 'Epilogue, sans-serif',
                cursor: loading ? 'default' : 'pointer', transition: 'background 0.1s'
              }}
              onPointerDown={e => e.currentTarget.style.background = '#30363D'}
              onPointerUp={e => e.currentTarget.style.background = '#1C2128'}
              onPointerLeave={e => e.currentTarget.style.background = '#1C2128'}
            >
              0
            </button>
            
            <button
              onClick={handleDelete}
              disabled={loading || pin.length === 0}
              style={{
                background: 'transparent', border: 'none', borderRadius: 12,
                width: 64, height: 64,
                color: '#8B949E', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: (loading || pin.length === 0) ? 'default' : 'pointer'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 28 }}>backspace</span>
            </button>
          </div>
        </div>
        
        {error && <div style={{ color: '#F85149', textAlign: 'center', marginTop: 24, fontSize: 13, fontWeight: 600 }}>Invalid PIN</div>}
        {loading && !error && <div style={{ color: '#white', textAlign: 'center', marginTop: 24, fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>VERIFYING...</div>}
      </div>
    </div>
  )
}
