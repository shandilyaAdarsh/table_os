// ── TypeScript types matching Supabase backend contracts ──────────────────────
// Updated to use tenant_id (not org_id) throughout.

export type TenantStatus = 'trial' | 'active' | 'expired' | 'suspended'
export type UserRole =
  | 'superadmin'
  | 'org_admin'
  | 'owner'
  | 'manager'
  | 'staff'
  | 'kds'

// ── resolve-context-v2 edge function response ─────────────────────────────────
export interface ResolvedContext {
  user: {
    id: string
    full_name: string
    role: UserRole
    must_change_password: boolean
  }
  tenant: {
    id: string
    name: string
    slug: string
    plan: string
    status: TenantStatus
    is_active: boolean
    next_billing_date: string | null
  }
  onboarding: {
    is_complete: boolean
    steps_completed: string[]
  }
  flags: {
    must_change_password: boolean
    subscription_expired: boolean
    account_suspended: boolean
    onboarding_required: boolean
  }
}

// ── credential_invites table ──────────────────────────────────────────────────
export interface CredentialInvite {
  id: string
  user_id: string
  tenant_id: string        // was org_id
  email: string
  delivery_status: 'pending' | 'sent' | 'failed' | 'used'
  delivery_attempts: number
  sent_at: string | null
  used_at: string | null
  expires_at: string
  created_at: string
}

// ── onboarding_state table ────────────────────────────────────────────────────
export interface OnboardingState {
  tenant_id: string        // was org_id
  is_complete: boolean
  steps_completed: string[]
  completed_at: string | null
  updated_at: string
}

// ── create-tenant-admin edge function ────────────────────────────────────────
export interface CreateTenantAdminBody {
  email: string            // owner email
  restaurant_name: string
  tenant_id: string        // UUID of already-created tenants row
  admin_name: string       // owner full name
}

export interface CreateTenantAdminResponse {
  success: boolean
  user_id: string
  email_sent: boolean
  dev_credentials?: {
    email: string
    password: string
  }
}
