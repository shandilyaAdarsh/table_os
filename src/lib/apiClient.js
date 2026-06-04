import { useRuntimeIdentityStore } from '../store/runtimeIdentityStore';
import { useRuntimeAuthStore } from '../store/runtimeAuthStore';
import { useConnectivityStore } from '../store/connectivityStore';
import { runtime } from '../runtime/index';

import { resolveApiBaseUrl } from './resolveApiBaseUrl';
export { resolveApiBaseUrl };

const API_BASE_URL = resolveApiBaseUrl();

/**
 * Standard fetch wrapper that enforces Runtime Governance.
 * Automatically injects the deterministic Runtime JWT into the Authorization header.
 * 
 * MUST be used by all Repositories querying protected backend runtime routes.
 */
export async function fetchWithRuntime(endpoint, options = {}) {
  const auth = useRuntimeAuthStore.getState();
  const identity = useRuntimeIdentityStore.getState();
  const token = auth.runtimeToken;
  
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

  if (identity && identity.branchId) {
    headers.set('X-Branch-Id', identity.branchId);
  }
  if (identity && identity.terminalId) {
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
 * Executes a public API call (e.g. for QR resolution or bootstrap).
 * Enforces API_BASE_URL routing but skips authentication headers.
 */
export async function fetchPublicApi(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  try {
    const finalUrl = `${API_BASE_URL}${endpoint}`;
    
    console.log('[QR]', 'base_url', API_BASE_URL);
    console.log('[QR]', 'final_url', finalUrl);
    
    const response = await fetch(finalUrl, {
      ...options,
      headers
    });

    console.log('[QR]', 'status', response.status);
    console.log('[QR]', 'content_type', response.headers.get('content-type'));

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('QR API Misconfiguration:\nExpected JSON response but received HTML.\nRequest is being routed to frontend instead of backend.');
    }

    useConnectivityStore.getState().recordApiSuccess();
    return response;
  } catch (error) {
    console.error(`[PublicApiClient] Network failure fetching ${endpoint}`, error);
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
