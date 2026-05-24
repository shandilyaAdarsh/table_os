import { useRuntimeAuthStore } from '../store/runtimeAuthStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Standard fetch wrapper that enforces Runtime Governance.
 * Automatically injects the deterministic Runtime JWT into the Authorization header.
 * 
 * MUST be used by all Repositories querying protected backend runtime routes.
 */
export async function fetchWithRuntime(endpoint, options = {}) {
  const token = useRuntimeAuthStore.getState().runtimeToken;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  // Strict enforcement: if the backend rejects the Runtime JWT, invalidate local state immediately.
  if (response.status === 401 || response.status === 403) {
    console.warn('[RuntimeApiClient] Unauthorized or Expired runtime session detected. Triggering re-auth.');
    useRuntimeAuthStore.getState().setAuthStatus('EXPIRED');
    // NOTE: In the future, intercept here to trigger an automatic `/auth/runtime/exchange` using the Supabase session
  }

  return response;
}
