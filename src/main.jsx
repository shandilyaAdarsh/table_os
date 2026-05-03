import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { saveTableNum } from './apps/customer/utils/tableNum'
import CheckIn from './apps/customer/pages/CheckIn'

import MenuHome from './apps/customer/pages/MenuHome'
import ItemDetail from './apps/customer/pages/ItemDetail'
import CartDrawer from './apps/customer/pages/CartDrawer'
import OrderConfirmed from './apps/customer/pages/OrderConfirmed'
import OrderTracking from './apps/customer/pages/OrderTracking'
import OrdersPage from './apps/customer/pages/OrdersPage'
import ProfilePage from './apps/customer/pages/ProfilePage'
import Splash from './apps/customer/pages/Splash'

import StaffLogin from './apps/staff/pages/StaffLogin'
import TableOverview from './apps/staff/pages/TableOverview'
import TableDetail from './apps/staff/pages/TableDetail'
import KDSBoard from './apps/kds/pages/KDSBoard'
import AdminApp from './apps/admin/AdminApp.jsx'

function CustomerApp() {
  // Save ?table= param from URL to localStorage on first load.
  // This survives React Router navigation that strips the query param.
  useEffect(() => { saveTableNum() }, [])

  // session lives only in React state — resets on page reload so CheckIn always shows.
  // This is correct for a restaurant: each new customer scans fresh and checks in.
  const [session, setSession] = useState(null)

  if (!session) {
    return <CheckIn onComplete={(s) => setSession(s)} />
  }

  return (
    <Routes>
      <Route index element={<Splash />} />
      <Route path="browse" element={<MenuHome />} />
      <Route path="item/:itemId" element={<ItemDetail />} />
      <Route path="cart" element={<CartDrawer />} />
      <Route path="confirmed/:orderId" element={<OrderConfirmed />} />
      <Route path="track/:orderId" element={<OrderTracking />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="profile" element={<ProfilePage />} />
    </Routes>
  )
}

function StaffApp() {
  return (
    <Routes>
      <Route index element={<StaffLogin />} />
      <Route path="tables" element={<TableOverview />} />
      <Route path="table/:tableId" element={<TableDetail />} />
    </Routes>
  )
}

function KdsApp() {
  return (
    <Routes>
      <Route index element={<KDSBoard />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/customer/*" element={<CustomerApp />} />
        <Route path="/menu/*" element={<CustomerApp />} />
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="/kds/*" element={<KdsApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/" element={<Navigate to="/customer/browse" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
