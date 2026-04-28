import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

export default function ProtectedRoute({
  children,
  allowedRoles = ['owner', 'manager'],
  redirectTo = '/admin/login',
}) {
  const { user, tenantId } = useAuthStore()
  const location = useLocation()

  // Not logged in at all
  if (!user || !tenantId) {
    // Pass current path so we can redirect back after login
    return <Navigate to={redirectTo} state={{ from: location }} replace />
  }

  // Logged in but role not permitted for this interface
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />
  }

  return children
}
