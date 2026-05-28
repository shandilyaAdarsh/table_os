import { useRuntimeIdentityStore } from '../store/runtimeIdentityStore';
import { useConnectivityStore } from '../store/connectivityStore';
import { runtime } from '../runtime/index';

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
  
  // Strict Read-Only Enforcement
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`[Architecture Violation] fetchWithRuntime MUST NOT be used for ${method}. Use MutationGateway for operational mutations.`);
  }

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
 * Now acts as a thin proxy to the centralized MutationGateway.
 */
export async function submitMutation(endpoint, mutation) {
  const identity = useRuntimeIdentityStore.getState();
  const surfaceId = identity.terminalId || 'unknown_surface';
  
  // Delegate the operational mutation boundary to the formal runtime infrastructure
  return await runtime.mutation.submitMutation(endpoint, mutation, surfaceId);
}
