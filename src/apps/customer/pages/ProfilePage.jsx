import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../../../store/index'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { session_id, name, phone, table_num, joinTable, leaveTable } = useSessionStore()
  
  const [inputName, setInputName] = useState('')
  const [inputPhone, setInputPhone] = useState('')

  const handleJoin = (e) => {
    e.preventDefault()
    if (!inputName.trim()) return
    joinTable(inputName, inputPhone, import.meta.env.VITE_DEMO_TABLE_NUM || 'T03')
  }

  const handleLeave = () => {
    if (confirm("Are you sure you want to log out of this table session? You will lose tracking and ordering capabilities for this session.")) {
      leaveTable()
      navigate('/customer/browse')
    }
  }

  if (session_id) {
    return (
      <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif', background: 'white', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1B2B4B', margin: '0 0 32px' }}>Profile</h1>
        
        <div style={{ background: 'white', borderRadius: 20, padding: 24, boxShadow: '0 10px 40px rgba(27,43,75,0.06)', border: '1px solid #F9FAFB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
             <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#1B2B4B' }}>
                {name[0].toUpperCase()}
             </div>
             <div>
                <span style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Diner Name</span>
                <p style={{ margin: 0, fontSize: 18, color: '#1B2B4B', fontWeight: 800 }}>{name}</p>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            <div>
              <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Phone</span>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: '#1B2B4B', fontWeight: 700 }}>{phone || '—'}</p>
            </div>
            <div>
              <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Current Table</span>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: '#1B2B4B', fontWeight: 700 }}>{table_num}</p>
            </div>
          </div>

          <div style={{ marginBottom: 40, padding: '12px 16px', background: '#F9FAFB', borderRadius: 12 }}>
            <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Session ID</span>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{session_id.substring(0, 16).toUpperCase()}...</p>
          </div>

          <button
            onClick={handleLeave}
            style={{ 
              width: '100%', padding: '16px', borderRadius: 14, 
              border: '2px solid #F3F4F6', background: 'transparent', 
              color: '#EF4444', fontWeight: 700, fontSize: 15, 
              cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
            Leave Table
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif', background: 'white', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1B2B4B', margin: '0 0 12px' }}>Welcome!</h1>
      <p style={{ margin: '0 0 40px', fontSize: 14, color: '#6B7280', lineHeight: 1.6, fontWeight: 500 }}>
        Please enter your details to start a session. This allows you to place orders and track them live for your table.
      </p>
      
      <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ position: 'relative' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#1B2B4B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name</label>
          <input
            autoFocus
            required
            type="text"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            style={{ width: '100%', padding: '16px 20px', borderRadius: 14, border: '1.5px solid #F3F4F6', fontSize: 16, outline: 'none', background: '#F9FAFB', boxSizing: 'border-box', color: '#1B2B4B', fontWeight: 500 }}
            placeholder="John Doe"
          />
        </div>

        <div>
           <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#1B2B4B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone Number <span style={{ color: '#9CA3AF', fontWeight: 500 }}>(Optional)</span></label>
           <input
            type="tel"
            value={inputPhone}
            onChange={(e) => setInputPhone(e.target.value)}
            style={{ width: '100%', padding: '16px 20px', borderRadius: 14, border: '1.5px solid #F3F4F6', fontSize: 16, outline: 'none', background: '#F9FAFB', boxSizing: 'border-box', color: '#1B2B4B', fontWeight: 500 }}
            placeholder="+91 99000 00000"
          />
        </div>

        <button
          type="submit"
          style={{ 
            width: '100%', padding: '18px', borderRadius: 16, 
            background: '#1B2B4B', color: 'white', fontWeight: 700, 
            fontSize: 16, cursor: 'pointer', border: 'none', 
            marginTop: 12, boxShadow: '0 10px 30px rgba(27,43,75,0.2)'
          }}
        >
          Check-in to Table {import.meta.env.VITE_DEMO_TABLE_NUM || 'T03'}
        </button>
      </form>
    </div>
  )
}
