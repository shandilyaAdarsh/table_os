import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

// Customer App Pages
import MenuHome from './apps/customer/pages/MenuHome'
import ItemDetail from './apps/customer/pages/ItemDetail'
import Cart from './apps/customer/pages/Cart'
import OrderConfirmed from './apps/customer/pages/OrderConfirmed'
import OrderTracking from './apps/customer/pages/OrderTracking'
import Payment, { ReceiptScreen } from './apps/customer/pages/Payment'
import ProfilePage from './apps/customer/pages/ProfilePage'
import OrdersPage from './apps/customer/pages/OrdersPage'
import Splash from './apps/customer/pages/Splash'

function CustomerApp() {
  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/browse" element={<MenuHome />} />
      <Route path="/item/:itemId" element={<ItemDetail />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/confirmed/:orderId" element={<OrderConfirmed />} />
      <Route path="/track/:orderId" element={<OrderTracking />} />
      <Route path="/pay/:orderId" element={<Payment />} />
      <Route path="/receipt/:orderId" element={<ReceiptScreen />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/orders" element={<OrdersPage />} />
      {/* Fallback for /customer or /menu base paths */}
      <Route path="*" element={<Navigate to="/customer/browse" replace />} />
    </Routes>
  )
}

// Minimal placeholders for other apps to keep the shell functional
function KDSApp() { return <div style={{ padding: 20, color: 'white', background: '#10141a', minHeight: '100vh' }}>KDS App — Coming Soon</div> }
function AdminApp() { return <div style={{ padding: 20 }}>Admin App — Coming Soon</div> }
function StaffApp() { return <div style={{ padding: 20 }}>Staff App — Coming Soon</div> }
function SuperAdminApp() { return <div style={{ padding: 20 }}>SuperAdmin App — Coming Soon</div> }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Support both /customer and legacy /menu paths */}
        <Route path="/customer/*" element={<CustomerApp />} />
        <Route path="/menu/*" element={<CustomerApp />} />
        
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="/kds/*" element={<KDSApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/superadmin/*" element={<SuperAdminApp />} />
        
        {/* Default redirect to customer app */}
        <Route path="/" element={<Navigate to="/customer/browse" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
