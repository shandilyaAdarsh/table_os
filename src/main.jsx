import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

function CustomerApp() {
  return <div style={{ padding: 20 }}>Customer App — Dev B</div>
}

function KDSApp() {
  return <div style={{ padding: 20 }}>KDS App — Dev B</div>
}

function AdminApp() {
  return <div style={{ padding: 20 }}>Admin App — Dev B</div>
}

function StaffApp() {
  return <div style={{ padding: 20 }}>Staff App — Dev B</div>
}

function SuperAdminApp() {
  return <div style={{ padding: 20 }}>SuperAdmin App — Dev B</div>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/menu/*" element={<CustomerApp />} />
        <Route path="/staff/*" element={<StaffApp />} />
        <Route path="/kds/*" element={<KDSApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/superadmin/*" element={<SuperAdminApp />} />
        <Route path="/" element={<Navigate to="/kds" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
