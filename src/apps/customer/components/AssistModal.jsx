import { useState, useEffect } from 'react'
import { useSessionStore } from '../../../store/index'
import { submitMutation } from '../../../lib/apiClient'
import { getTableNum } from '../utils/tableNum'

export default function AssistModal({ open, onClose }) {
  const { session_id, table_num } = useSessionStore()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [customMsg, setCustomMsg] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [specialNote, setSpecialNote] = useState('')

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sendAssistRequest = async (requestType) => {
    setLoading(true)
    setError(null)

    try {
      await submitMutation('/api/v1/runtime/mutations', {
        mutation_id: 'create_assistance_request',
        idempotency_key: crypto.randomUUID(),
        payload: {
          tenant_id: '11111111-1111-1111-1111-111111111111',
          table_id: 'e719f4e5-b0f1-4c71-8e31-197041d71956',
          table_num: table_num || getTableNum(),
          table_session_id: session_id || '',
          request_type: requestType,
          message: specialNote.trim() || null,
        }
      })

      setSuccess('Request sent! Someone will be with you shortly.')
      setSpecialNote('')
      setTimeout(() => { setSuccess(''); onClose() }, 2000)

    } catch (err) {
      setError('Failed to send request. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,32,69,0.4)', backdropFilter: 'blur(2px)', transition: 'opacity 0.2s' }}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 70,
          width: '100%', maxWidth: '430px', maxHeight: '88vh',
          background: 'white', borderRadius: '2rem 2rem 0 0',
          boxShadow: '0 -20px 60px rgba(0,32,69,0.18)',
          animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1) forwards',
          display: 'flex', flexDirection: 'column'
        }}
      >
        <style>{`@keyframes slideUpAssist { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: '#EDEEEF', borderRadius: 2, margin: '14px auto 16px', flexShrink: 0 }} />

        <div style={{ padding: '0 24px 24px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'Epilogue, sans-serif', fontWeight: 800, fontSize: 22, color: '#002045', margin: 0 }}>How can we assist?</h2>
            <button onClick={onClose} style={{ border: 'none', background: '#F3F4F6', borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#43474E' }}>close</span>
            </button>
          </div>


          {error && <div style={{ color: '#EF4444', marginBottom: 16, fontSize: 14 }}>{error}</div>}
          
          {success ? (
            <div style={{ padding: '30px', textAlign: 'center', animation: 'slideUp 0.3s' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#22C55E', marginBottom: 12 }}>check_circle</span>
              <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 18, color: '#002045', fontWeight: 700, margin: 0 }}>Request Sent!</p>
              <p style={{ fontFamily: 'Manrope, sans-serif', fontSize: 14, color: '#8A8F98', marginTop: 8 }}>A waiter will be right with you.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button 
                onClick={() => sendAssistRequest('waiter')}
                disabled={loading}
                style={btnStyle}
              >
                <span className="material-symbols-outlined" style={{ color: '#FE932C' }}>pan_tool</span>
                Call Waiter
              </button>

              <button 
                onClick={() => sendAssistRequest('water')}
                disabled={loading}
                style={btnStyle}
              >
                <span className="material-symbols-outlined" style={{ color: '#3B82F6' }}>water_drop</span>
                Request Water
              </button>

              <button 
                onClick={() => sendAssistRequest('bill')}
                disabled={loading}
                style={btnStyle}
              >
                <span className="material-symbols-outlined" style={{ color: '#10B981' }}>receipt_long</span>
                Ask for Bill
              </button>

              <button 
                onClick={() => sendAssistRequest('special')}
                disabled={loading}
                style={btnStyle}
              >
                <span className="material-symbols-outlined" style={{ color: '#8B5CF6' }}>support_agent</span>
                Special Request...
              </button>

              {showCustom && (
                <div style={{ marginTop: 8, animation: 'slideUp 0.2s', display: 'flex', gap: 8 }}>
                  <input 
                    type="text"
                    value={customMsg}
                    onChange={e => setCustomMsg(e.target.value)}
                    placeholder="e.g. Need extra napkins"
                    style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 15, outline: 'none', background: '#F8F9FA' }}
                  />
                  <button 
                    onClick={() => sendAssistRequest('special')}
                    disabled={!customMsg.trim() || loading}
                    style={{ padding: '0 20px', borderRadius: 12, background: '#1A365D', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                  >
                    Send
                  </button>
                </div>
              )}

              {/* Special Request textarea (Issue 4) */}
              <div style={{ marginTop: '16px' }}>
                <label style={{
                  fontSize: '11px', fontWeight: '600', color: '#6B7280',
                  textTransform: 'uppercase', letterSpacing: '0.5px',
                  display: 'block', marginBottom: '6px'
                }}>
                  Special Request (optional)
                </label>
                <textarea
                  value={specialNote}
                  onChange={e => setSpecialNote(e.target.value)}
                  placeholder="e.g. Need extra napkins, high chair for baby, allergy alert..."
                  maxLength={200}
                  rows={3}
                  style={{
                    width: '100%', background: '#F9FAFB',
                    border: '1.5px solid #E5E7EB', borderRadius: '12px',
                    padding: '12px', fontSize: '14px', color: '#111827',
                    resize: 'none', outline: 'none', boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = '#1A365D'}
                  onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                />
                <div style={{ textAlign: 'right', fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
                  {specialNote.length}/200
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const btnStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '16px 20px',
  background: '#F8F9FA',
  border: '1px solid #EDEEEF',
  borderRadius: 16,
  fontSize: 16,
  fontWeight: 600,
  fontFamily: 'Manrope, sans-serif',
  color: '#002045',
  cursor: 'pointer',
  gap: 16,
  textAlign: 'left'
}
