import './polyfill.js' // MUST BE FIRST
import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import './index.css'


// Core
import { supabase } from './lib/supabase.js'
import { useAuthStore } from './store/authStore'

// Shared
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'

// Removed Admin imports (now on Flutter)

// KDS
import KDSBoard from './apps/kds/pages/KDSBoard'
import KDSSettings from './apps/kds/pages/KDSSettings'
import { KDSLogin } from './apps/kds/pages/KDSLogin'
import { KdsGate } from './apps/kds/components/KdsGate'

// Customer Menu
import { 
  MenuSplash, 
  MenuHome, 
  ItemDetail, 
  OrderConfirmation, 
  OrderTracking, 
  PaymentScreen,
  OrdersPage,
  ProfilePage,
  CartPage,
  CheckIn
} from './apps/customer/index'
import TableQrLanding from './apps/customer/pages/TableQrLanding.jsx'

// Waiter / Staff App (Placeholder for real staff app)
import { 
  StaffLogin, 
  StaffTables, 
  StaffTableDetail 
} from './apps/staff/index'

// POS Runtime — now runs as standalone app (Orderlli/pos submodule)

// Runtime Observability Panel — DEV / QA / INTERNAL_PILOT only
// Stripped from production builds via import.meta.env.DEV guard at route level.
import RuntimeObservabilityPanel from './runtime/validation/RuntimeObservabilityPanel'
import RuntimeCertificationPanel from './runtime/validation/RuntimeCertificationPanel'



/**
 * AuthGate: Synchronizes Zustand with Supabase Auth state 
 * and manages hydration/initial loading.
 */
function AuthGate({ children }) {
  const isHydrated = useAuthStore(state => state.isHydrated)
  const resolveContext = useAuthStore(state => state.resolveContext)
  const logout = useAuthStore(state => state.logout)
  const [healthStatus, setHealthStatus] = React.useState('checking') // checking, ok, degraded

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const { resolveApiBaseUrl } = await import('./lib/apiClient.js')
        const url = resolveApiBaseUrl()
        const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          setHealthStatus('ok')
        } else {
          setHealthStatus('degraded')
        }
      } catch (err) {
        console.error('[AuthGate] Health check failed:', err)
        setHealthStatus('degraded')
      }
    }

    checkHealth().then(() => {
      // Initialize formal runtime session for Customer QR users if they refresh
      const qrToken = sessionStorage.getItem('qr_session_token');
      const tableId = sessionStorage.getItem('qr_table_id');
      if (qrToken && tableId) {
        import('./runtime').then(({ runtime }) => {
          runtime.bootstrap(`qr_table_${tableId}`, qrToken);
        });
      }

      if (supabase) {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log(`[AuthGate] Event: ${event}`)
          
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            await resolveContext()
          } else if (event === 'SIGNED_OUT') {
            logout()
          }
        })
  
        resolveContext();
  
        return () => subscription.unsubscribe()
      } else {
        console.warn('[AuthGate] Supabase client is null. Bypassing auth listener.');
        resolveContext();
      }
    });
  }, [resolveContext, logout])

  // Hydration control: Prevent indeterminate UI states before state is reloaded
  if (!isHydrated || healthStatus === 'checking') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] animate-pulse">
            System Initializing
          </p>
        </div>
      </div>
    )
  }

  if (healthStatus === 'degraded') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white p-6">
        <h1 className="text-xl font-bold text-red-500 mb-2">Network Degraded</h1>
        <p className="text-sm text-gray-400 text-center max-w-md">
          We are unable to connect to the local runtime server. Please check your WiFi connection or ensure the POS system is online.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-amber-500 text-black font-bold rounded-lg"
        >
          Retry Connection
        </button>
      </div>
    )
  }

  return children
}

function CheckInRoute() {
  const navigate = useNavigate()
  return <CheckIn onComplete={() => navigate(`/menu/browse${window.location.search}`)} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* KDS App Surface (Independent from Customer AuthGate) */}
        <Route path="/kds/*" element={<KdsGate />} />

        {/* Customer & Staff App Surfaces (Requires AuthGate for Profile Resolution) */}
        <Route path="*" element={
          <AuthGate>
            <Routes>
              <Route path="/" element={<Navigate to="/menu" replace />} />

              {/* Table QR scan entry (app.orderlyy.com/t/{token}) */}
              <Route path="/t/:token" element={<TableQrLanding />} />

              {/* Customer Menu */}
              <Route path="/menu" element={<MenuSplash />} />
              <Route path="/menu/browse" element={<MenuHome />} />
              <Route path="/menu/item/:id" element={<ItemDetail />} />
              <Route path="/menu/confirmed/:id" element={<OrderConfirmation />} />
              <Route path="/menu/track/:orderId" element={<OrderTracking />} />
              <Route path="/menu/pay" element={<PaymentScreen />} />
              <Route path="/menu/orders" element={<OrdersPage />} />
              <Route path="/menu/profile" element={<ProfilePage />} />
              <Route path="/menu/cart" element={<CartPage />} />
              <Route path="/menu/checkin" element={<CheckInRoute />} />

              {/* Admin App is handled natively in Flutter, no web routes here */}

              {/* Staff Runtime */}
              <Route path="/staff/login" element={<StaffLogin />} />
              <Route path="/staff/tables" element={
                <ProtectedRoute allowedRoles={['waiter', 'manager', 'owner']} redirectTo="/staff/login">
                  <StaffTables />
                </ProtectedRoute>
              } />
              <Route path="/staff/table/:id" element={
                <ProtectedRoute allowedRoles={['waiter', 'manager', 'owner']} redirectTo="/staff/login">
                  <StaffTableDetail />
                </ProtectedRoute>
              } />

              {/* POS Runtime — now runs as standalone app (Orderlli/pos submodule) */}

              {/* Runtime Observability — DEV / QA / INTERNAL_PILOT only */}
              {import.meta.env.DEV && (
                <>
                  <Route path="/runtime/panel" element={<RuntimeObservabilityPanel />} />
                  <Route path="/runtime/certify" element={<RuntimeCertificationPanel />} />
                </>
              )}

              <Route path="*" element={<Navigate to="/menu" replace />} />
            </Routes>
          </AuthGate>
        } />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)

