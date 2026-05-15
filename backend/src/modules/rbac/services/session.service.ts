// ============================================================
// src/modules/rbac/services/session.service.ts
// Session management, listing, suspicious activity detection.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import { findActiveDeviceSession } from '../../auth/repositories/auth.repository';
import type { ActiveSessionView, DeviceSession } from '../../../types/auth.types';

// ─── Suspicious Flag Bitmask ──────────────────────────────────
/**
 * Bitmask flags — a session accumulates these as evidence.
 * Backend reads these flags to decide whether to revoke proactively.
 */
export const SUSPICIOUS_FLAGS = {
  COUNTRY_CHANGE:      0b0000_0001, // 1  - Different geo country from creation
  UA_CHANGE:           0b0000_0010, // 2  - User-agent changed mid-session
  IP_CHANGE:           0b0000_0100, // 4  - IP changed mid-session
  RAPID_REFRESH:       0b0000_1000, // 8  - Token refreshed > N times in short window
  CONCURRENT_SESSIONS: 0b0001_0000, // 16 - Same device fingerprint used in parallel
} as const;

export type SuspiciousFlag = (typeof SUSPICIOUS_FLAGS)[keyof typeof SUSPICIOUS_FLAGS];

const AUTO_REVOKE_THRESHOLD = SUSPICIOUS_FLAGS.COUNTRY_CHANGE | SUSPICIOUS_FLAGS.CONCURRENT_SESSIONS; // 17

// ─── List active sessions for a user ─────────────────────────

export async function listUserSessions(
  userId: string,
  currentDeviceSessionId?: string
): Promise<ActiveSessionView[]> {
  const { data, error } = await supabaseAdmin
    .from('device_sessions')
    .select(
      'id, device_fingerprint, user_agent, ip_address, created_at, expires_at, last_activity_at'
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .order('last_activity_at', { ascending: false, nullsFirst: false });

  if (error) {
    logger.error({ err: error, userId }, 'listUserSessions failed');
    throw new Error(`[SessionService] listUserSessions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id:               row.id,
    device_fingerprint: row.device_fingerprint,
    user_agent:       row.user_agent,
    ip_address:       row.ip_address,
    created_at:       row.created_at,
    expires_at:       row.expires_at,
    last_activity_at: row.last_activity_at,
    is_current:       row.id === currentDeviceSessionId,
  }));
}

// ─── Update last activity timestamp ──────────────────────────

export async function touchSession(deviceSessionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('device_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', deviceSessionId)
    .eq('is_active', true);

  if (error) {
    // Non-fatal — don't throw. Just log.
    logger.warn({ err: error, deviceSessionId }, 'touchSession failed');
  }
}

// ─── Suspicious activity detection ───────────────────────────

export interface SuspiciousCheckContext {
  deviceSessionId: string;
  currentIp: string;
  currentUa: string;
  currentGeoCountry?: string;
  deviceFingerprint: string;
}

/**
 * Inspects the current request context against the stored session
 * for anomalies. Applies bitmask flags and optionally auto-revokes.
 *
 * @returns true if the session is still valid, false if revoked.
 */
export async function checkAndFlagSuspiciousActivity(
  ctx: SuspiciousCheckContext
): Promise<boolean> {
  const session = await findActiveDeviceSession(ctx.deviceSessionId, ctx.deviceFingerprint);
  if (!session) return false;

  let newFlags = (session as any).suspicious_flags ?? 0;
  const reasons: string[] = [];

  // Country change detection
  if (ctx.currentGeoCountry && (session as any).geo_country) {
    if (ctx.currentGeoCountry !== (session as any).geo_country) {
      newFlags |= SUSPICIOUS_FLAGS.COUNTRY_CHANGE;
      reasons.push('country_change');
    }
  }

  // User-agent change detection
  if (session.user_agent && ctx.currentUa && session.user_agent !== ctx.currentUa) {
    newFlags |= SUSPICIOUS_FLAGS.UA_CHANGE;
    reasons.push('ua_change');
  }

  // IP change (same session, different IP — note, VPNs can trigger this)
  if (session.ip_address && ctx.currentIp && session.ip_address !== ctx.currentIp) {
    newFlags |= SUSPICIOUS_FLAGS.IP_CHANGE;
    reasons.push('ip_change');
  }

  if (newFlags === 0) return true; // No anomalies

  // Persist updated flags
  await supabaseAdmin
    .from('device_sessions')
    .update({ suspicious_flags: newFlags })
    .eq('id', ctx.deviceSessionId);

  logger.warn(
    { deviceSessionId: ctx.deviceSessionId, userId: session.user_id, reasons, newFlags },
    'Suspicious session activity flagged'
  );

  // Auto-revoke on critical flag combinations
  if ((newFlags & AUTO_REVOKE_THRESHOLD) === AUTO_REVOKE_THRESHOLD) {
    await supabaseAdmin
      .from('device_sessions')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoke_reason: `Auto-revoked: suspicious flags=${newFlags}`,
      })
      .eq('id', ctx.deviceSessionId);

    logger.warn(
      { deviceSessionId: ctx.deviceSessionId, userId: session.user_id, newFlags },
      'Session auto-revoked due to high-severity suspicious flags'
    );

    return false; // Session is no longer valid
  }

  return true;
}
