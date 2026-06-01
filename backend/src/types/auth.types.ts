// ============================================================
// src/types/auth.types.ts
// Canonical auth type definitions.
// ============================================================

import type { Role, Permission, AuthContext, ROLE_HIERARCHY } from './rbac.types';
export { Role, AuthContext, Permission };

export { ROLE_HIERARCHY };

export function hasMinimumRole(
  userRole: Role,
  requiredRole: Role,
  hierarchy: Record<Role, number>
): boolean {
  return hierarchy[userRole] >= hierarchy[requiredRole];
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
 * SUPER_ADMIN has tenant_id = null.
 */
export interface AdminProfile {
  id: string;
  tenant_id: string | null;
  role: Role;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  is_locked: boolean;
  locked_until: string | null;
  lock_reason: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  must_change_password: boolean;
  is_first_login: boolean;
  password_updated_at: string | null;
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
  geo_country: string | null;
  is_active: boolean;
  last_token_hash: string | null;
  last_activity_at: string | null;
  suspicious_flags: number;
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

export interface AuthenticatedUser extends AuthContext {
  full_name: string;
  must_change_password: boolean;
  is_first_login: boolean;
  password_updated_at: string | null;
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
  role?: Role;
  tenant_id?: string | null;
  branch_ids?: string[];
  full_name?: string;
  must_change_password?: boolean;
  is_first_login?: boolean;
  password_updated_at?: string | null;
  error?: string;
}

// ─── Session Listing ─────────────────────────────────────────

export interface ActiveSessionView {
  id: string;
  device_fingerprint: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  expires_at: string;
  last_activity_at: string | null;
  is_current: boolean;
}
