// ============================================================
// src/modules/auth/repositories/auth.repository.ts
// All database access for the auth module.
// Uses supabaseAdmin (service_role) — bypasses RLS.
// NEVER expose this client or its results to the frontend.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import type {
  AdminProfile,
  DeviceSession,
  AuthEventType,
  RateLimitResult,
} from '../../../types/auth.types';
import { hashToken } from '../../../shared/utils/crypto';
import { env } from '../../../config/env';
import { moduleLogger } from '../../../utils/logger';

const log = moduleLogger('auth-repository');

// ─── Admin Profiles ───────────────────────────────────────────

export async function findAdminProfileById(userId: string): Promise<AdminProfile | null> {
  const { data, error } = await supabaseAdmin
    .from('admin_profiles')
    .select('*')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    log.error({ userId, error }, 'findAdminProfileById failed');
    throw new Error(`[AuthRepo] findAdminProfileById: ${error.message}`);
  }
  return data;
}

/**
 * Looks up an admin profile by email via RPC.
 * RPC joins auth.users (schema not directly queryable) with admin_profiles.
 */
export async function findAdminProfileByEmail(email: string): Promise<AdminProfile | null> {
  const { data, error } = await supabaseAdmin.rpc('get_admin_profile_by_email', {
    p_email: email.toLowerCase().trim(),
  });

  if (error) {
    log.error({ email, error }, 'findAdminProfileByEmail failed');
    throw new Error(`[AuthRepo] findAdminProfileByEmail: ${error.message}`);
  }
  return (data as AdminProfile[] | null)?.[0] ?? null;
}

export async function updateLoginSuccess(userId: string, ipAddress: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('admin_profiles')
    .update({
      last_login_at: new Date().toISOString(),
      last_login_ip: ipAddress,
      failed_login_count: 0,
      is_locked: false,
      locked_until: null,
      lock_reason: null,
    })
    .eq('id', userId);

  if (error) throw new Error(`[AuthRepo] updateLoginSuccess: ${error.message}`);
}

/** Atomic increment via DB function. Returns new count. */
export async function incrementFailedLoginCount(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('increment_failed_login_count', {
    p_user_id: userId,
  });

  if (error) throw new Error(`[AuthRepo] incrementFailedLoginCount: ${error.message}`);
  return data as number;
}

export async function lockAccount(
  userId: string,
  reason: string,
  lockedUntil: Date | null = null
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('admin_profiles')
    .update({
      is_locked: true,
      locked_until: lockedUntil?.toISOString() ?? null,
      lock_reason: reason,
    })
    .eq('id', userId);

  if (error) throw new Error(`[AuthRepo] lockAccount: ${error.message}`);
}

// ─── Device Sessions ──────────────────────────────────────────

export async function createDeviceSession(params: {
  userId: string;
  tenantId: string | null;
  supabaseSessionId: string | null;
  deviceFingerprint: string;
  userAgent: string;
  ipAddress: string;
  accessToken: string;
  rememberMe: boolean;
}): Promise<DeviceSession> {
  const ttlDays = params.rememberMe
    ? env.AUTH_DEVICE_SESSION_REMEMBER_ME_DAYS
    : env.AUTH_DEVICE_SESSION_TTL_DAYS;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const { data, error } = await supabaseAdmin
    .from('device_sessions')
    .insert({
      user_id: params.userId,
      tenant_id: params.tenantId,
      supabase_session_id: params.supabaseSessionId,
      device_fingerprint: params.deviceFingerprint,
      user_agent: params.userAgent,
      ip_address: params.ipAddress,
      last_token_hash: hashToken(params.accessToken),
      expires_at: expiresAt.toISOString(),
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(`[AuthRepo] createDeviceSession: ${error.message}`);
  return data;
}

export async function findActiveDeviceSession(
  sessionId: string,
  deviceFingerprint: string
): Promise<DeviceSession | null> {
  const { data, error } = await supabaseAdmin
    .from('device_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('device_fingerprint', deviceFingerprint)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(`[AuthRepo] findActiveDeviceSession: ${error.message}`);
  return data;
}

export async function updateDeviceSessionToken(
  sessionId: string,
  newAccessToken: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('device_sessions')
    .update({ last_token_hash: hashToken(newAccessToken) })
    .eq('id', sessionId);

  if (error) throw new Error(`[AuthRepo] updateDeviceSessionToken: ${error.message}`);
}

export async function revokeDeviceSession(sessionId: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('device_sessions')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoke_reason: reason,
    })
    .eq('id', sessionId);

  if (error) throw new Error(`[AuthRepo] revokeDeviceSession: ${error.message}`);
}

export async function revokeAllUserDeviceSessions(userId: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('device_sessions')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoke_reason: reason,
    })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw new Error(`[AuthRepo] revokeAllUserDeviceSessions: ${error.message}`);
}

// ─── Audit Logs ───────────────────────────────────────────────

export async function writeAuditLog(params: {
  userId?: string;
  tenantId?: string;
  deviceSessionId?: string;
  eventType: AuthEventType;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  metadata?: Record<string, unknown>;
  failureReason?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('auth_audit_logs').insert({
    user_id: params.userId ?? null,
    tenant_id: params.tenantId ?? null,
    device_session_id: params.deviceSessionId ?? null,
    event_type: params.eventType,
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ?? null,
    device_fingerprint: params.deviceFingerprint ?? null,
    metadata: params.metadata ?? {},
    failure_reason: params.failureReason ?? null,
  });

  if (error) {
    // Audit log failures MUST NEVER crash auth flows — log and continue
    log.error({ error, eventType: params.eventType }, 'writeAuditLog failed');
  }
}

// ─── Rate Limiting ────────────────────────────────────────────

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const windowMs = env.AUTH_RATE_WINDOW_MINUTES * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs);

  const { data, error } = await supabaseAdmin
    .from('auth_rate_limits')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  if (error) throw new Error(`[AuthRepo] checkRateLimit: ${error.message}`);

  const maxAttempts = env.AUTH_MAX_FAILED_LOGINS;
  const blockMs = env.AUTH_LOCKOUT_MINUTES * 60 * 1000;

  // No record — first attempt
  if (!data) {
    await supabaseAdmin.from('auth_rate_limits').insert({
      key,
      window_start: new Date().toISOString(),
      attempt_count: 1,
    });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      reset_at: new Date(Date.now() + windowMs),
    };
  }

  // Currently blocked
  if (data.blocked_until && new Date(data.blocked_until as string) > new Date()) {
    const blockedUntil = new Date(data.blocked_until as string);
    return { allowed: false, remaining: 0, reset_at: blockedUntil, blocked_until: blockedUntil };
  }

  // Window expired — reset
  if (new Date(data.window_start as string) < windowStart) {
    await supabaseAdmin
      .from('auth_rate_limits')
      .update({ window_start: new Date().toISOString(), attempt_count: 1, blocked_until: null })
      .eq('key', key);
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      reset_at: new Date(Date.now() + windowMs),
    };
  }

  const newCount = (data.attempt_count as number) + 1;
  const shouldBlock = newCount >= maxAttempts;
  const blockedUntil = shouldBlock ? new Date(Date.now() + blockMs) : null;

  await supabaseAdmin
    .from('auth_rate_limits')
    .update({
      attempt_count: newCount,
      blocked_until: blockedUntil?.toISOString() ?? null,
    })
    .eq('key', key);

  const resetAt = new Date(
    new Date(data.window_start as string).getTime() + windowMs
  );

  return {
    allowed: !shouldBlock,
    remaining: Math.max(0, maxAttempts - newCount),
    reset_at: resetAt,
    blocked_until: blockedUntil ?? undefined,
  };
}
