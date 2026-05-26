import { useRuntimeIdentityStore } from '../store/runtimeIdentityStore';
import { useConnectivityStore } from '../store/connectivityStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Standard fetch wrapper that enforces Runtime Governance.
 * Automatically injects the deterministic Runtime JWT into the Authorization header.
 * 
 * MUST be used by all Repositories querying protected backend runtime routes.
 */
export async function fetchWithRuntime(endpoint, options = {}) {
  // Assuming runtime auth token is stored somewhere secure or provided by Supabase session
  const token = localStorage.getItem('supabase.auth.token'); // Fallback placeholder
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const identity = useRuntimeIdentityStore.getState();
  if (identity.branchId) {
    headers.set('X-Branch-Id', identity.branchId);
  }
  if (identity.terminalId) {
    headers.set('X-Terminal-Id', identity.terminalId);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401 || response.status === 403) {
      console.warn('[RuntimeApiClient] Unauthorized. Terminating identity.');
      useRuntimeIdentityStore.getState().clearIdentity();
    }
    
    // Any response means the API is reachable
    useConnectivityStore.getState().recordApiSuccess();

    return response;
  } catch (error) {
    console.error(`[RuntimeApiClient] Network failure fetching ${endpoint}`, error);
    useConnectivityStore.getState().recordApiTimeout();
    throw error;
  }
}

/**
 * Executes a deterministic, retry-safe mutation enforcing the MutationEnvelope contract.
 * Called exclusively by MutationCoordinator.
 */
export async function submitMutation(endpoint, mutation) {
  const identity = useRuntimeIdentityStore.getState();
  
  const envelope = {
    mutation_id: mutation.mutation_id,
    mutation_sequence: mutation.mutation_sequence,
    runtime_version: 1,
    session_id: identity.runtimeSessionId,
    terminal_id: identity.terminalId,
    branch_id: identity.branchId,
    client_timestamp: new Date().toISOString(),
    idempotency_key: mutation.idempotency_key,
    expected_cart_revision: mutation.expected_cart_revision,
    payload: mutation.payload,
  };

  const response = await fetchWithRuntime(endpoint, {
    method: 'POST',
    body: JSON.stringify(envelope),
  });

  return response;
}
