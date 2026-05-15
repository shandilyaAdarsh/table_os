// ============================================================
// src/modules/auth/services/auth.service.ts
// Core auth business logic. Orchestrates Supabase Auth + DB.
// All auth decisions made here — never trust frontend state.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import {
  findAdminProfileById,
  findAdminProfileByEmail,
  updateLoginSuccess,
  incrementFailedLoginCount,
  lockAccount,
  createDeviceSession,
  findActiveDeviceSession,
  updateDeviceSessionToken,
  revokeDeviceSession,
  revokeAllUserDeviceSessions,
  writeAuditLog,
  checkRateLimit,
} from '../repositories/auth.repository';
import {
  InvalidCredentialsError,
  AccountLockedError,
  AccountDisabledError,
  SessionExpiredError,
  SessionRevokedError,
  TokenInvalidError,
  RateLimitError,
} from '../../../shared/errors/AppError';
import type {
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  AuthenticatedUser,
  TokenValidationResult,
} from '../../../types/auth.types';
import { env } from '../../../config/env';
import { logger as log } from '../../../shared/utils/logger';
import { resolvePermissions } from '../../../utils/permission-checker';

// ─── Login ────────────────────────────────────────────────────

export async function loginWithEmail(
  request: LoginRequest,
  ipAddress: string,
  userAgent: string
): Promise<LoginResponse> {
  // 1. Rate limit check (per IP and per email)
  const ipKey = `login:ip:${ipAddress}`;
  const emailKey = `login:email:${request.email.toLowerCase()}`;

  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit(ipKey),
    checkRateLimit(emailKey),
  ]);

  if (!ipLimit.allowed) {
    const retryAfter = Math.ceil(
      ((ipLimit.blocked_until?.getTime() ?? Date.now()) - Date.now()) / 1000
    );
    await writeAuditLog({
      eventType: 'LOGIN_FAILED',
      ipAddress,
      userAgent,
      deviceFingerprint: request.device_fingerprint,
      metadata: { reason: 'ip_rate_limited', email: request.email },
      failureReason: 'IP rate limited',
    });
    throw new RateLimitError(retryAfter);
  }

  if (!emailLimit.allowed) {
    const retryAfter = Math.ceil(
      ((emailLimit.blocked_until?.getTime() ?? Date.now()) - Date.now()) / 1000
    );
    await writeAuditLog({
      eventType: 'LOGIN_FAILED',
      ipAddress,
      userAgent,
      deviceFingerprint: request.device_fingerprint,
      metadata: { reason: 'email_rate_limited', email: request.email },
      failureReason: 'Email rate limited',
    });
    throw new RateLimitError(retryAfter);
  }

  // 2. Authenticate with Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
    email: request.email,
    password: request.password,
  });

  if (authError || !authData.session || !authData.user) {
    // Still look up profile to increment failure counter
    const profile = await findAdminProfileByEmail(request.email).catch(() => null);

    if (profile) {
      const failCount = await incrementFailedLoginCount(profile.id);
      if (failCount >= env.AUTH_MAX_FAILED_LOGINS) {
        const lockedUntil = new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60 * 1000);
        await lockAccount(profile.id, 'Too many failed login attempts', lockedUntil);
        await writeAuditLog({
          userId: profile.id,
          tenantId: profile.tenant_id ?? undefined,
          eventType: 'ACCOUNT_LOCKED',
          ipAddress,
          userAgent,
          deviceFingerprint: request.device_fingerprint,
          metadata: { failed_count: failCount },
        });
        log.warn({ userId: profile.id, failCount }, 'Account auto-locked after max failures');
      }
    }

    await writeAuditLog({
      userId: profile?.id,
      tenantId: profile?.tenant_id ?? undefined,
      eventType: 'LOGIN_FAILED',
      ipAddress,
      userAgent,
      deviceFingerprint: request.device_fingerprint,
      metadata: { email: request.email },
      failureReason: authError?.message ?? 'Invalid credentials',
    });

    throw new InvalidCredentialsError();
  }

  // 3. Load admin profile — never trust JWT claims alone
  const profile = await findAdminProfileById(authData.user.id);

  if (!profile) {
    // Auth user exists but has no admin profile — not an admin
    await supabaseAdmin.auth.admin.signOut(authData.user.id);
    log.warn({ userId: authData.user.id }, 'Auth user has no admin_profile — rejecting');
    throw new InvalidCredentialsError();
  }

  // 4. Check account status
  if (!profile.is_active) throw new AccountDisabledError();

  if (profile.is_locked) {
    const until = profile.locked_until ? new Date(profile.locked_until) : null;
    if (!until || until > new Date()) throw new AccountLockedError(until);
    // Lock has expired — will be cleared on successful login below
  }

  // 5. Update login metadata (clears failed count and lock)
  await updateLoginSuccess(profile.id, ipAddress);

  // 6. Create device session
  const deviceSession = await createDeviceSession({
    userId: profile.id,
    tenantId: profile.tenant_id,
    supabaseSessionId: authData.session.user.id ?? null,
    deviceFingerprint: request.device_fingerprint,
    userAgent,
    ipAddress,
    accessToken: authData.session.access_token,
    rememberMe: request.remember_me ?? false,
  });

  // 7. Audit log
  await writeAuditLog({
    userId: profile.id,
    tenantId: profile.tenant_id ?? undefined,
    deviceSessionId: deviceSession.id,
    eventType: 'LOGIN_SUCCESS',
    ipAddress,
    userAgent,
    deviceFingerprint: request.device_fingerprint,
    metadata: { role: profile.role },
  });

  log.info({ userId: profile.id, role: profile.role }, 'Login successful');

  const user: AuthenticatedUser = {
    id: profile.id,
    userId: profile.id,
    email: authData.user.email!,
    role: profile.role,
    tenant_id: profile.tenant_id,
    tenantId: profile.tenant_id,
    branchIds: (authData.user.app_metadata?.branch_ids as string[]) ?? [],
    permissions: await resolvePermissions(profile.id, profile.tenant_id),
    full_name: profile.full_name,
    must_change_password: profile.must_change_password,
    device_session_id: deviceSession.id,
  };

  return {
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
    expires_in: authData.session.expires_in ?? env.AUTH_ACCESS_TOKEN_TTL,
    token_type: 'Bearer',
    user,
    device_session_id: deviceSession.id,
  };
}

// ─── Token Refresh ────────────────────────────────────────────

export async function refreshAccessToken(
  request: RefreshTokenRequest,
  ipAddress: string,
  userAgent: string,
  deviceSessionId: string
): Promise<{ access_token: string; expires_in: number }> {
  // 1. Verify device session exists and fingerprint matches
  const deviceSession = await findActiveDeviceSession(deviceSessionId, request.device_fingerprint);

  if (!deviceSession) throw new SessionRevokedError();

  if (new Date(deviceSession.expires_at) < new Date()) {
    await revokeDeviceSession(deviceSessionId, 'Absolute expiry reached');
    throw new SessionExpiredError();
  }

  // 2. Refresh via Supabase
  const { data, error } = await supabaseAdmin.auth.refreshSession({
    refresh_token: request.refresh_token,
  });

  if (error || !data.session) {
    await writeAuditLog({
      userId: deviceSession.user_id,
      tenantId: deviceSession.tenant_id ?? undefined,
      deviceSessionId,
      eventType: 'SESSION_EXPIRED',
      ipAddress,
      userAgent,
      failureReason: error?.message ?? 'Refresh failed',
    });
    throw new TokenInvalidError('Refresh token invalid or expired');
  }

  // 3. Update stored token hash (replay attack prevention)
  await updateDeviceSessionToken(deviceSessionId, data.session.access_token);

  await writeAuditLog({
    userId: deviceSession.user_id,
    tenantId: deviceSession.tenant_id ?? undefined,
    deviceSessionId,
    eventType: 'TOKEN_REFRESH',
    ipAddress,
    userAgent,
    deviceFingerprint: request.device_fingerprint,
    metadata: {},
  });

  return {
    access_token: data.session.access_token,
    expires_in: data.session.expires_in ?? env.AUTH_ACCESS_TOKEN_TTL,
  };
}

// ─── Logout ───────────────────────────────────────────────────

export async function logout(
  userId: string,
  tenantId: string | null,
  deviceSessionId: string | undefined,
  revokeAll: boolean,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  if (revokeAll) {
    await revokeAllUserDeviceSessions(userId, 'User logged out all sessions');
    await supabaseAdmin.auth.admin.signOut(userId);
  } else if (deviceSessionId) {
    await revokeDeviceSession(deviceSessionId, 'User logout');
  }

  await writeAuditLog({
    userId,
    tenantId: tenantId ?? undefined,
    deviceSessionId,
    eventType: 'LOGOUT',
    ipAddress,
    userAgent,
    metadata: { revoke_all: revokeAll },
  });

  log.info({ userId, revokeAll }, 'User logged out');
}

// ─── Password Reset ───────────────────────────────────────────

export async function requestPasswordReset(
  email: string,
  redirectTo: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  // Anti-enumeration: always return success regardless of outcome
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
  const profile = await findAdminProfileByEmail(email).catch(() => null);

  await writeAuditLog({
    userId: profile?.id,
    tenantId: profile?.tenant_id ?? undefined,
    eventType: 'PASSWORD_RESET_REQUESTED',
    ipAddress,
    userAgent,
    metadata: { email },
    failureReason: error?.message,
  });

  // Do NOT throw — anti-enumeration
}

export async function completePasswordReset(
  userId: string,
  newPassword: string,
  ipAddress: string,
  userAgent: string
): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) throw new TokenInvalidError('Password reset failed');

  // Revoke all sessions after password change (security best practice)
  await revokeAllUserDeviceSessions(userId, 'Password reset');

  // Clear must_change_password flag
  const profile = await findAdminProfileById(userId);
  if (profile?.must_change_password) {
    await supabaseAdmin
      .from('admin_profiles')
      .update({ must_change_password: false })
      .eq('id', userId);
  }

  await writeAuditLog({
    userId,
    tenantId: profile?.tenant_id ?? undefined,
    eventType: 'PASSWORD_RESET_COMPLETED',
    ipAddress,
    userAgent,
    metadata: {},
  });

  log.info({ userId }, 'Password reset completed');
}

// ─── Token Validation ─────────────────────────────────────────

/**
 * Validates a Supabase JWT and cross-checks against admin_profiles.
 * Returns full profile context needed by middleware.
 * NEVER trust JWT claims alone — always verify against DB.
 */
export async function validateAccessToken(accessToken: string): Promise<TokenValidationResult> {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !data.user) {
    return { valid: false, error: error?.message ?? 'Invalid token' };
  }

  // Always verify against DB
  const profile = await findAdminProfileById(data.user.id);

  if (!profile) {
    return { valid: false, error: 'No admin profile found' };
  }

  if (!profile.is_active) {
    return { valid: false, error: 'Account is disabled' };
  }

  if (profile.is_locked) {
    const until = profile.locked_until ? new Date(profile.locked_until) : null;
    if (!until || until > new Date()) {
      return { valid: false, error: 'Account is locked' };
    }
  }

  return {
    valid: true,
    user_id: data.user.id,
    email: data.user.email,
    role: profile.role,
    tenant_id: (data.user.app_metadata?.tenant_id as string) ?? null,
    branch_ids: (data.user.app_metadata?.branch_ids as string[]) ?? [],
    full_name: profile.full_name,
    must_change_password: profile.must_change_password,
  };
}
