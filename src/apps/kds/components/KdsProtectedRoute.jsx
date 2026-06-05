import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useRuntimeIdentityStore } from '../../../store/runtimeIdentityStore';
import { useRuntimeAuthStore } from '../../../store/runtimeAuthStore';

export function KdsProtectedRoute() {
  const { branchId } = useRuntimeIdentityStore();
  const { runtimeToken } = useRuntimeAuthStore();

  // If there's no runtime session or no branch selected, redirect to KDS login
  if (!runtimeToken || !branchId) {
    return <Navigate to="/kds/login" replace />;
  }

  // Otherwise, render the nested KDS routes
  return <Outlet />;
}
