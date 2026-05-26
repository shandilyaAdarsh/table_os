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

// Waiter / Staff
import { 
  StaffLogin, 
  StaffTables, 
  StaffTableDetail 
} from './apps/staff/index'



/**
 * AuthGate: Synchronizes Zustand with Supabase Auth state 
 * and manages hydration/initial loading.
 */
function AuthGate({ children }) {
  const isHydrated = useAuthStore(state => state.isHydrated)
  const resolveContext = useAuthStore(state => state.resolveContext)
  const logout = useAuthStore(state => state.logout)

  useEffect(() => {
    // Listen for auth changes globally
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`[AuthGate] Event: ${event}`)
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          // Reresolve context on login or token rotation
          await resolveContext()
        } else if (event === 'SIGNED_OUT') {
          logout()
        }
      })

      return () => subscription.unsubscribe()
    } else {
      console.warn('[AuthGate] Supabase client is null. Bypassing auth listener.');
      // Proceed with hydration anyway so the UI can load
      resolveContext();
    }
  }, [resolveContext, logout])

  // Hydration control: Prevent indeterminate UI states before state is reloaded
  if (!isHydrated) {
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

  return children
}

function CheckInRoute() {
  const navigate = useNavigate()
  return <CheckIn onComplete={() => navigate('/menu/browse')} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/menu" replace />} />

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

          {/* KDS */}
          <Route path="/kds" element={<KDSBoard />} />
          <Route path="/kds/settings" element={<KDSSettings />} />

          {/* Waiter / Staff */}
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



          <Route path="*" element={<Navigate to="/menu" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthGate>
  </React.StrictMode>
)

