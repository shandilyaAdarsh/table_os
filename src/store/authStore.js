import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase.js'

const STORE_VERSION = 2

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // ── State ────────────────────────────────────────────────
      user: null,       // Profile + basic staff info
      tenantId: null,   // Current tenant_id
      tenant: null,     // Tenant metadata (branding, status, etc)
      onboarding: null, // Onboarding state
      flags: null,      // Contextual flags (suspended, must_change_password)
      isLoading: false,
      isHydrated: false, // Hydration control for Zustand
      error: null,

      // ── Resolve Context (Edge Function) ───────────────────
      resolveContext: async () => {
        // Clear previous errors but don't force loading on background refreshes
        set({ error: null })
        
        try {
          // Add timeout or specific headers if necessary
          const { data, error } = await supabase.functions.invoke('resolve-context-v2')
          
          if (error) {
            console.error('[AuthStore] resolve-context-v2 error:', error)
            
            // Error handling for edge function status codes
            if (error.status === 401 || error.status === 403) {
              set({ user: null, tenantId: null, tenant: null, onboarding: null, flags: null })
            }
            
            set({ error: error.message || 'Failed to resolve account context.', isLoading: false })
            return null
          }

          if (!data) {
            set({ error: 'Empty response from context resolver.', isLoading: false })
            return null
          }

          // Update store with data from resolve-context-v2
          // We DO NOT assume profiles = staff sync; this is the platform auth context.
          set({
            user: data.user,
            tenantId: data.tenant?.id,
            tenant: data.tenant,
            onboarding: data.onboarding,
            flags: data.flags,
            error: null,
            isLoading: false
          })
          
          return data
        } catch (err) {
          console.error('[AuthStore] resolveContext critical failure:', err)
          set({ error: 'Network error resolving account context.', isLoading: false })
          return null
        }
      },

      // ── Login (email + password) ─────────────────────────
      login: async ({ email, password }) => {
        // MANDATORY: signOut() before new login to clear stale sessions
        try {
          await supabase.auth.signOut()
        } catch (e) {
          console.warn('[AuthStore] Pre-login signOut failed:', e)
        }

        set({ user: null, tenantId: null, tenant: null, onboarding: null, flags: null, isLoading: true, error: null })

        const normalizedEmail = email?.toLowerCase().trim()
        const normalizedPassword = password?.trim()
        if (!normalizedEmail || !normalizedPassword) {
          set({ error: 'Email and password are required.', isLoading: false })
          throw new Error('Email and password are required.')
        }

        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: normalizedPassword,
          })

          if (authError || !authData?.user?.id) {
            set({ error: 'Invalid credentials.', isLoading: false })
            throw new Error('Invalid credentials.')
          }

          // MANDATORY: call resolve-context-v2 after login
          const context = await get().resolveContext()
          
          if (!context) {
            throw new Error('Failed to establish account context after login.')
          }

          set({ isLoading: false })
          return { success: true, role: context.user.role }
        } catch (err) {
          set({ error: err.message, isLoading: false })
          throw err
        }
      },

      // ── KDS PIN-only Login (KEPT SEPARATE) ───────────────
      loginKDS: async ({ restaurantCode, pin }) => {
        try { await supabase.auth.signOut() } catch {}
        
        set({ user: null, tenantId: null, tenant: null, isLoading: true, error: null })

        const normalizedCode = restaurantCode?.toUpperCase().trim()
        const normalizedPin = pin?.trim()
        if (!normalizedCode || !normalizedPin) {
          set({ error: 'Restaurant code and PIN are required.', isLoading: false })
          throw new Error('Restaurant code and PIN are required.')
        }

        try {
          const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, name, restaurant_code, is_active')
            .eq('restaurant_code', normalizedCode)
            .eq('is_active', true)
            .single()

          if (tenantError || !tenant) {
            set({ error: 'Restaurant not found.', isLoading: false })
            throw new Error('Restaurant not found.')
          }

          const { data: staff, error: staffError } = await supabase
            .from('staff')
            .select(`
              *,
              tenants (
                id, name, slug, restaurant_code, brand_primary, brand_accent
              )
            `)
            .eq('tenant_id', tenant.id)
            .eq('pin', normalizedPin)
            .eq('auth_type', 'pin')
            .eq('is_active', true)
            .single()

          if (staffError || !staff) {
            set({ error: 'Invalid PIN.', isLoading: false })
            throw new Error('Invalid PIN.')
          }

          set({ user: staff, tenantId: staff.tenant_id, tenant: staff.tenants, isLoading: false, error: null })
          return { success: true, role: staff.role }
        } catch (err) {
          set({ error: err.message, isLoading: false })
          throw err
        }
      },

      // ── Logout ───────────────────────────────────────────────
      logout: async () => {
        try {
          await supabase.auth.signOut()
        } catch { }
        set({ user: null, tenantId: null, tenant: null, onboarding: null, flags: null, error: null })
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('tableos-admin-auth')
        }
      },

      setHydrated: () => set({ isHydrated: true }),

      // ── Helpers ──────────────────────────────────────────────
      getTenantId: () => get().tenantId,
      getUser: () => get().user,
      getTenant: () => get().tenant,
    }),

    {
      name: 'tableos-admin-auth',
      version: STORE_VERSION,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated?.()
      },
      migrate: (persistedState, version) => {
        if (version !== STORE_VERSION) {
          return { user: null, tenantId: null, tenant: null, onboarding: null, flags: null }
        }
        return persistedState
      },
      partialize: (state) => ({
        user: state.user,
        tenantId: state.tenantId,
        tenant: state.tenant,
        onboarding: state.onboarding,
        flags: state.flags,
      }),
    }
  )
)

