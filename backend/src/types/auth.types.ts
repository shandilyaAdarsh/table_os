// ============================================================
// src/types/auth.types.ts
// Canonical auth type definitions.
// Architecture: admin_profiles owns role + permissions.
// Future: platform_users (all auth.users mirror) and
//         tenant_users (per-tenant membership) will layer on top.
// ============================================================

// ─── Roles ────────────────────────────────────────────────────

export type AdminRole = 'SUPER_ADMIN' | 'RESTAURANT_ADMIN' | 'MANAGER' | 'STAFF';

export const ROLE_HIERARCHY: Record<AdminRole, number> = {
  SUPER_ADMIN: 100,
  RESTAURANT_ADMIN: 50,
  MANAGER: 30,
  STAFF: 10,
};

export function hasMinimumRole(userRole: AdminRole, requiredRole: AdminRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// ─── Audit Event Types ────────────────────────────────────────

export type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'TOKEN_REFRESH'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_LOCKED'
  | 'SUSPICIOUS_ACTIVITY';

// ─── DB Row Shapes ────────────────────────────────────────────

/**
 * Row shape for `admin_profiles` table.
 * Linked to auth.users by id.
 * SUPER_ADMIN has tenant_id = null.
 */
export interface AdminProfile {
  id: string;
  tenant_id: string | null;
  role: AdminRole;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  is_locked: boolean;
  locked_until: string | null;
  lock_reason: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  must_change_password: boolean;
  failed_login_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DeviceSession {
  id: string;
  user_id: string;
  tenant_id: string | null;
  supabase_session_id: string | null;
  device_fingerprint: string;
  user_agent: string | null;
  ip_address: string | null;
  country_code: string | null;
  is_active: boolean;
  last_token_hash: string | null;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthAuditLog {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  device_session_id: string | null;
  event_type: AuthEventType;
  ip_address: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
  metadata: Record<string, unknown>;
  failure_reason: string | null;
  created_at: string;
}

// ─── Request / Response ───────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
  device_fingerprint: string;
  remember_me?: boolean;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  user: AuthenticatedUser;
  device_session_id: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
  device_fingerprint: string;
}

export interface LogoutRequest {
  device_session_id?: string;
  revoke_all_sessions?: boolean;
}

// ─── Middleware Context ───────────────────────────────────────

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AdminRole;
  tenant_id: string | null;
  full_name: string;
  must_change_password: boolean;
  device_session_id?: string;
}

// ─── Rate Limiting ────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: Date;
  blocked_until?: Date;
}

// ─── Token Validation ─────────────────────────────────────────

export interface TokenValidationResult {
  valid: boolean;
  user_id?: string;
  email?: string;
  role?: AdminRole;
  tenant_id?: string | null;
  full_name?: string;
  must_change_password?: boolean;
  error?: string;
}
