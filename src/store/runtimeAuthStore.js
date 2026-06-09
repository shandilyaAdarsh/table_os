import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const STORE_VERSION = 1;

export const useRuntimeAuthStore = create(
  persist(
    (set, get) => ({
      // ── State Required by Prompt ──────────────────────────────
      tenantId: null,
      branchId: null,
      sessionId: null,
      role: null,
      permissions: [],
      authStatus: 'UNAUTHENTICATED', // 'UNAUTHENTICATED' | 'AUTHENTICATING' | 'AUTHENTICATED' | 'EXPIRED'
      sessionExpiry: null,
      refreshState: 'IDLE', // 'IDLE' | 'REFRESHING' | 'FAILED'
      
      runtimeToken: null, // The actual JWT to append to requests
      sub: null,

      // ── Actions ─────────────────────────────────────────────
      
      setRuntimeSession: (token, payload) => {
        // Always decode from JWT as the source of truth
        let tenantId = null;
        let branchId = null;
        let role = null;
        let sub = null;
        let sessionId = null;
        let permissions = [];
        let sessionExpiry = null;
        
        try {
          const payloadBase64 = token.split('.')[1];
          const decoded = JSON.parse(atob(payloadBase64));
          
          tenantId = decoded.tenant_id;
          branchId = decoded.branch_id;
          role = decoded.role;
          sub = decoded.sub;
          sessionId = decoded.session_id;
          permissions = decoded.permissions || [];
          sessionExpiry = decoded.exp ? decoded.exp * 1000 : null;
          
          console.log('[RuntimeAuth] Decoded JWT claims:', {
            tenant_id: tenantId,
            branch_id: branchId,
            role,
            sub,
            session_id: sessionId
          });
        } catch (err) {
          console.error('[RuntimeAuth] Failed to decode JWT:', err);
          
          // Fallback to localStorage for KDS (set during device registration)
          tenantId = localStorage.getItem('kds_tenant_id') || null;
          branchId = localStorage.getItem('kds_branch_id') || null;
          
          console.warn('[RuntimeAuth] Using localStorage fallback:', {
            tenantId,
            branchId
          });
        }
        
        set({
          runtimeToken: token,
          tenantId,
          branchId,
          role,
          sub,
          sessionId,
          permissions,
          sessionExpiry,
          authStatus: 'AUTHENTICATED'
        });
      },

      /**
       * Exchanges platform credentials for a deterministic Runtime JWT
       * and parses it into the store.
       */
      exchangeForRuntime: async (supabaseToken, branchId, deviceSessionId) => {
        set({ authStatus: 'AUTHENTICATING', refreshState: 'IDLE' });

        try {
          // Explicit relative path fallback depending on environment setup, assuming proxy
          const apiUrl = import.meta.env.VITE_API_URL || '';
          
          const response = await fetch(`${apiUrl}/auth/runtime/exchange`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseToken}`,
              'X-Device-Session-Id': deviceSessionId || ''
            },
            body: JSON.stringify({ branch_id: branchId })
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            set({ authStatus: 'UNAUTHENTICATED' });
            throw new Error(data.error?.message || 'Failed to exchange runtime session');
          }

          const runtimeToken = data.data.runtime_token;
          
          // Parse JWT locally to populate synchronous state
          const payloadBase64 = runtimeToken.split('.')[1];
          const payload = JSON.parse(atob(payloadBase64));

          set({
            runtimeToken,
            tenantId: payload.tenant_id,
            branchId: payload.branch_id,
            sessionId: payload.session_id,
            role: payload.role,
            permissions: payload.permissions,
            sub: payload.sub,
            sessionExpiry: payload.exp * 1000,
            authStatus: 'AUTHENTICATED'
          });

          console.log('[RuntimeAuth] Exchanged successfully for branch:', payload.branch_id);
          return { success: true };
        } catch (error) {
          console.error('[RuntimeAuth] Exchange failed:', error);
          set({ authStatus: 'UNAUTHENTICATED' });
          throw error;
        }
      },

      /**
       * Clears the runtime session (e.g. on manual logout or hard expiry)
       */
      clearRuntime: () => {
        set({
          runtimeToken: null,
          tenantId: null,
          branchId: null,
          sessionId: null,
          role: null,
          permissions: [],
          sub: null,
          sessionExpiry: null,
          authStatus: 'UNAUTHENTICATED',
          refreshState: 'IDLE'
        });
      },

      /**
       * Flags the session as expired/refreshing
       */
      setRefreshState: (state) => set({ refreshState: state }),
      setAuthStatus: (status) => set({ authStatus: status }),
      
      /**
       * Synchronous access helper for interceptors
       */
      getRuntimeToken: () => get().runtimeToken,
      getPermissions: () => get().permissions,
      hasPermission: (perm) => get().permissions.includes(perm)
    }),
    {
      name: 'tableos-runtime-auth',
      version: STORE_VERSION,
    }
  )
);
