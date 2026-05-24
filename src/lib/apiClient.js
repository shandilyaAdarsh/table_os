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

/**
 * Executes a deterministic, retry-safe mutation enforcing the MutationEnvelope contract.
 * Automatically wraps the payload with required sequencing and runtime context.
 */
export async function submitMutation(endpoint, mutation) {
  const { tenantId, branchId, sessionId } = useRuntimeAuthStore.getState();
  
  const envelope = {
    mutation_id: mutation.mutation_id,
    mutation_sequence: mutation.mutation_sequence,
    runtime_version: 1, // Fixed version for now
    session_id: sessionId || undefined,
    tenant_id: tenantId,
    branch_id: branchId,
    client_timestamp: new Date().toISOString(),
    idempotency_key: mutation.idempotency_key,
    expected_cart_revision: mutation.expected_cart_revision,
    payload: mutation.payload,
  };

  const response = await fetchWithRuntime(endpoint, {
    method: 'POST', // or PATCH/DELETE if overridden, but usually POST is fine
    body: JSON.stringify(envelope),
  });

  return response;
}
