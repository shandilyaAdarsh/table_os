import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { setQrSession, getQrSession } from '../utils/qrSession'

import { QrResolutionService } from '../services/QrResolutionService'

export default function TableQrLanding() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    if (!token) {
      setError('QR_INVALID')
      return
    }

    const reservedNamespaces = ['kds', 'pos', 'admin']
    const normalizedToken = token.toLowerCase().trim()
    
    if (reservedNamespaces.includes(normalizedToken)) {
      navigate(`/${normalizedToken}`, { replace: true })
      return
    }

    QrResolutionService.resolveAndNormalizeToken(token)
      .then((normalizedSession) => {
        console.log('[QR]', 'saving_session');
        setQrSession(normalizedSession)
        
        // Boot up the formal runtime session for the customer surface
        import('../../../runtime').then(({ runtime }) => {
          runtime.bootstrap(
            `qr_table_${normalizedSession.table_id}`, 
            normalizedSession.guest_session_id || 'anonymous_session'
          );
        });

        console.log('[QR]', 'session_saved', getQrSession());
        console.log('[QR]', 'redirecting_to_menu');
        
        navigate(
          `/menu?tenantId=${normalizedSession.tenant_id}&branchId=${normalizedSession.branch_id}&tableId=${normalizedSession.table_id}`,
          { replace: true },
        )
      })
      .catch((err) => {
        console.error('[QR_BOOTSTRAP_FAILURE]', err);
        // err.message contains our structured error code (e.g. 'QR_INVALID', 'TABLE_UNAVAILABLE')
        setError(err.message)
        setErrorMessage(err.toString())
      })
  }, [token, navigate])

  if (error) {
    let title = 'Error'
    let message = 'An unknown error occurred.'

    switch (error) {
      case 'QR_NOT_FOUND':
        title = 'QR Code Invalid'
        message = 'Please scan a valid Orderlyy QR code on your table.'
        break
      case 'TABLE_NOT_FOUND':
        title = 'Table Not Available'
        message = 'This table is currently disabled or deleted. Please ask staff for help.'
        break
      case 'BRANCH_NOT_FOUND':
        title = 'Restaurant Configuration Error'
        message = 'This restaurant is not currently operational. Please ask staff for help.'
        break
      case 'RATE_LIMITED':
        title = 'Too Many Scans'
        message = 'Please wait a moment before trying again.'
        break
      case 'QR_RESOLUTION_FAILED':
      default:
        title = 'Unable to Connect'
        message = 'Could not connect to the restaurant. Please check your internet.'
        break
    }

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <p style={{ color: 'red', fontSize: 20, fontWeight: 'bold' }}>{title}</p>
        <p style={{ color: '#888', fontSize: 14 }}>{message}</p>
        {errorMessage && (
          <p style={{ color: '#d32f2f', fontSize: 12, marginTop: 16, maxWidth: 400, textAlign: 'center' }}>
            Diagnostic Details:<br/>
            {errorMessage}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid #e74c3c',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <p style={{ color: '#666' }}>Opening your menu...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
