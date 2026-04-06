import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

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

function CustomerApp() {
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/customer/*" element={<CustomerApp />} />
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="/" element={<Navigate to="/customer/browse" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
