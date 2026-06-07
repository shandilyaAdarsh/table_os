/* eslint-disable react-hooks/purity */
import { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useRuntimeAuthStore } from '../../store/runtimeAuthStore';

/**
 * Enforces strictly that the user is running within a valid Runtime Context.
 * Rejects access if:
 * 1. No valid Runtime JWT session is present.
 * 2. Missing Tenant or Branch Context.
 * 3. Role is insufficient (if allowedRoles is provided).
 * 4. Missing granular permissions (if requiredPermissions is provided).
 */
export default function RuntimeProtectedRoute({
  children,
  allowedRoles = [],
  requiredPermissions = [],
  redirectTo = '/admin/login',
}) {
  const { 
    authStatus, 
    tenantId, 
    branchId, 
    role, 
    permissions,
    sessionExpiry
  } = useRuntimeAuthStore();
  const location = useLocation();

  const isExpired = useMemo(() => sessionExpiry && Date.now() > sessionExpiry, [sessionExpiry]);

  // 1. Must be strictly AUTHENTICATED with a non-expired session
  if (authStatus !== 'AUTHENTICATED' || isExpired) {
    console.warn('[RuntimeGuard] Blocked: No valid runtime session');
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // 2. Must have deterministic context
  if (!tenantId || !branchId) {
    console.warn('[RuntimeGuard] Blocked: Missing branch or tenant context');
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // 3. Role checks
  if (allowedRoles.length > 0 && !allowedRoles.includes(role) && role !== 'SUPER_ADMIN') {
    console.warn(`[RuntimeGuard] Blocked: Role ${role} not in ${allowedRoles}`);
    return <Navigate to="/unauthorized" replace />;
  }

  // 4. Granular Permission checks (must have ALL)
  if (requiredPermissions.length > 0 && role !== 'SUPER_ADMIN') {
    const missing = requiredPermissions.filter(p => !permissions.includes(p));
    if (missing.length > 0) {
      console.warn(`[RuntimeGuard] Blocked: Missing permissions: ${missing.join(', ')}`);
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // Session, Branch, Tenant, Role, and Permissions are strictly valid
  return children;
}
