import { useNavigate } from 'react-router-dom'
import { getTableNum } from '../utils/tableNum'

// Read the session saved by CheckIn screen
const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem('customerSession') || '{}')
  } catch { return {} }
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const session = getSession()

  const displayName  = session.name     || 'Guest'
  const displayPhone = session.phone    || 'Not provided'
  const displayTable = session.tableNum || getTableNum()
  const displayDate  = session.checkedInAt
    ? new Date(session.checkedInAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
    : '—'
  const displaySid   = session.sessionId
    ? session.sessionId.slice(-8).toUpperCase()
    : '—'

  const handleLeave = () => {
    if (confirm('Are you sure you want to end this session? You will need to check in again.')) {
      localStorage.removeItem('customerSession')
      window.location.href = `/menu/browse?table=${getTableNum()}`
    }
  }

  if (session.name) {
    return (
      <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif', background: 'white', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1B2B4B', margin: '0 0 32px' }}>Profile</h1>

        <div style={{ background: 'white', borderRadius: 20, padding: 24, boxShadow: '0 10px 40px rgba(27,43,75,0.06)', border: '1px solid #F9FAFB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
             <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#1B2B4B' }}>
                {displayName[0].toUpperCase()}
             </div>
             <div>
                <span style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Diner Name</span>
                <p style={{ margin: 0, fontSize: 18, color: '#1B2B4B', fontWeight: 800 }}>{displayName}</p>
             </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div>
              <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Phone</span>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: '#1B2B4B', fontWeight: 700 }}>{displayPhone}</p>
            </div>
            <div>
              <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Current Table</span>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: '#1B2B4B', fontWeight: 700 }}>{displayTable}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            <div>
              <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Check-in Date</span>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#1B2B4B', fontWeight: 700 }}>{displayDate}</p>
            </div>
            <div>
              <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Session ID</span>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{displaySid}</p>
            </div>
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

  // No session — CheckIn handles full flow on next page load
  return (
    <div style={{ padding: '60px 24px 120px', maxWidth: '430px', margin: '0 auto', fontFamily: 'Inter, sans-serif', background: 'white', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1B2B4B', margin: '0 0 12px' }}>Profile</h1>
      <p style={{ margin: '0 0 32px', fontSize: 14, color: '#6B7280', lineHeight: 1.6, fontWeight: 500 }}>
        No active session. Please reload the page to check in.
      </p>
      <button
        onClick={() => { localStorage.removeItem('customerSession'); window.location.reload() }}
        style={{
          width: '100%', padding: '18px', borderRadius: 16,
          background: '#1B2B4B', color: 'white', fontWeight: 700,
          fontSize: 16, cursor: 'pointer', border: 'none',
          marginTop: 12, boxShadow: '0 10px 30px rgba(27,43,75,0.2)'
        }}
      >
        Check In Now
      </button>
    </div>
  )
}
