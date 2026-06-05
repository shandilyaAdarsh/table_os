import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useRuntimeIdentityStore } from '../../../store/runtimeIdentityStore'
import { useRuntimeAuthStore } from '../../../store/runtimeAuthStore'

// Pages
import { KDSLogin } from '../pages/KDSLogin'
import KDSBoard from '../pages/KDSBoard'
import KDSSettings from '../pages/KDSSettings'

export function KdsGate() {
  const { branchId } = useRuntimeIdentityStore()
  const { runtimeToken } = useRuntimeAuthStore()

  // Define nested routes.
  // We use absolute paths inside the gate or relative to /kds.
  // Since this component is rendered at /kds/*, the paths here are relative.
  
  // A simple protection wrapper
  const ProtectedRoute = ({ children }) => {
    if (!runtimeToken || !branchId) {
      return <Navigate to="/kds/login" replace />
    }
    return children
  }

  return (
    <Routes>
      {/* Login does not require auth */}
      <Route path="login" element={<KDSLogin />} />
      
      {/* Protected routes */}
      <Route path="" element={
        <ProtectedRoute>
          <KDSBoard />
        </ProtectedRoute>
      } />
      <Route path="settings" element={
        <ProtectedRoute>
          <KDSSettings />
        </ProtectedRoute>
      } />
      
      {/* Catch-all for /kds/* */}
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  )
}
