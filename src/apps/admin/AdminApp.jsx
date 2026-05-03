import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAdminStore } from '../../store/index.js';
import AdminLogin from './pages/AdminLogin.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TableMap from './pages/TableMap.jsx';
import Analytics from './pages/Analytics.jsx';
import MenuManagement from './pages/MenuManagement.jsx';
import LiveOrders from './pages/LiveOrders.jsx';
import QRManager from './pages/QRManager.jsx';
import StaffManagement from './pages/StaffManagement.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import AdminSidebar from './components/AdminSidebar.jsx';
import AdminBottomNav from './components/AdminBottomNav.jsx';
import AdminHeader from './components/AdminHeader.jsx';

// Protected Layout wrapper
const ProtectedAdminLayout = () => {
  const staff = useAdminStore((state) => state.staff);

  if (!staff) {
    // Redirect to login if not authenticated
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="flex h-screen w-full bg-[#f9f9ff] overflow-hidden font-body text-[#141b2b]">
      <AdminSidebar />
      <AdminBottomNav />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-[240px]">
        <AdminHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-16 lg:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default function AdminApp() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="login" element={<AdminLogin />} />
      <Route path="auth-callback" element={<AuthCallback />} />

      {/* Protected Routes */}
      <Route element={<ProtectedAdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="tables" element={<TableMap />} />
        <Route path="orders" element={<LiveOrders />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="menu" element={<MenuManagement />} />
        <Route path="qr" element={<QRManager />} />
        <Route path="staff" element={<StaffManagement />} />
        <Route path="settings" element={<div className="p-6">Settings Placeholder</div>} />
      </Route>

      {/* Catch-all redirect to admin home */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
