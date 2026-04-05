import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import KDSBoard from './apps/kds/pages/KDSBoard'
import AdminApp from './apps/admin/AdminApp.jsx'

function CustomerApp() {
  return <div style={{ padding: 20 }}>Customer App — Dev B</div>
}

function KDSApp() {
  return <KDSBoard />
}

function StaffApp() {
  return <div style={{ padding: 20 }}>Staff App — Dev B</div>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/menu/*" element={<CustomerApp />} />
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="/kds/*" element={<KDSApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/" element={<Navigate to="/kds" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
