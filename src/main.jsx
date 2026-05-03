import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

// Core
import { supabase } from './lib/supabase.js'
import { useAuthStore } from './store/authStore'

// Shared
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'

// Admin
import AdminLogin from './apps/admin/pages/AdminLogin'
import AdminDashboard from './apps/admin/pages/Dashboard'
import AdminTableMap from './apps/admin/pages/TableMap'
import AdminLiveOrders from './apps/admin/pages/LiveOrders'
import AdminAnalytics from './apps/admin/pages/Analytics'
import AdminMenuManagement from './apps/admin/pages/MenuManagement'
import AdminQRManager from './apps/admin/pages/QRManager'
import AdminStaff from './apps/admin/pages/StaffManagement'
import AdminSettings from './apps/admin/pages/AdminSettings'

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

// SuperAdmin
import SuperAdminLogin from './apps/superadmin/SuperAdminLogin'
import SuperAdminDashboard from './apps/superadmin/SuperAdminDashboard'
import { TenantList, TenantDetail } from './apps/superadmin/Tenants'
import OnboardWizard from './apps/superadmin/OnboardWizard'

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
          <Route path="/menu/checkin" element={<CheckIn />} />

          {/* Admin Dashboard */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <Navigate to="/admin/dashboard" replace />
            </ProtectedRoute>
          } />
          <Route path="/admin/dashboard" element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin/tables" element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <AdminTableMap />
            </ProtectedRoute>
          } />
          <Route path="/admin/orders" element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <AdminLiveOrders />
            </ProtectedRoute>
          } />
          <Route path="/admin/analytics" element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <AdminAnalytics />
            </ProtectedRoute>
          } />
          <Route path="/admin/menu" element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <AdminMenuManagement />
            </ProtectedRoute>
          } />
          <Route path="/admin/qr" element={
            <ProtectedRoute allowedRoles={['owner', 'manager']}>
              <AdminQRManager />
            </ProtectedRoute>
          } />
          <Route path="/admin/staff" element={
            <ProtectedRoute allowedRoles={['owner']}>
              <AdminStaff />
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute allowedRoles={['owner']}>
              <AdminSettings />
            </ProtectedRoute>
          } />

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

          {/* SuperAdmin */}
          <Route path="/superadmin/login" element={<SuperAdminLogin />} />
          <Route path="/superadmin" element={
            <ProtectedRoute allowedRoles={['superadmin']} redirectTo="/superadmin/login">
              <SuperAdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/superadmin/tenants" element={
            <ProtectedRoute allowedRoles={['superadmin']} redirectTo="/superadmin/login">
              <TenantList />
            </ProtectedRoute>
          } />
          <Route path="/superadmin/tenant/:id" element={
            <ProtectedRoute allowedRoles={['superadmin']} redirectTo="/superadmin/login">
              <TenantDetail />
            </ProtectedRoute>
          } />
          <Route path="/superadmin/onboard" element={
            <ProtectedRoute allowedRoles={['superadmin']} redirectTo="/superadmin/login">
              <OnboardWizard />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/menu" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthGate>
  </React.StrictMode>
)

