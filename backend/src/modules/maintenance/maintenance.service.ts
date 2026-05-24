// ============================================================
// src/modules/maintenance/maintenance.service.ts
// Service layer for deterministic lifecycle maintenance tasks,
// cleanup operations, and state-machine transitions.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

/**
 * Bulk marks stale 'open' carts as 'abandoned' if they have had no activity for more than 60 minutes.
 * Returns the count of transitioned carts.
 */
export async function cleanupStaleCarts(tenantId: string, ageMinutes: number = 60): Promise<number> {
  const threshold = new Date(Date.now() - ageMinutes * 60 * 1000).toISOString();

  // Retrieve active stale carts
  const { data: staleCarts, error: fetchError } = await supabaseAdmin
    .from('carts')
    .select('id, version_num')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .lt('updated_at', threshold);

  if (fetchError) {
    throw new AppError(`Failed to fetch stale carts: ${fetchError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (!staleCarts || staleCarts.length === 0) {
    return 0;
  }

  let successCount = 0;

  // Transition each stale cart safely to 'abandoned' using Optimistic Concurrency Control (OCC)
  for (const cart of staleCarts) {
    const { error: updateError } = await supabaseAdmin
      .from('carts')
      .update({
        status: 'abandoned',
        version_num: cart.version_num + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', cart.id)
      .eq('version_num', cart.version_num);

    if (!updateError) {
      successCount++;
    }
  }

  return successCount;
}

/**
 * Bulk transitions active QR sessions that have exceeded their expires_at timeline to 'expired' status.
 * Returns the count of transitioned sessions.
 */
export async function cleanupExpiredQRSessions(tenantId: string): Promise<number> {
  const now = new Date().toISOString();

  // Retrieve expired active sessions
  const { data: expiredSessions, error: fetchError } = await supabaseAdmin
    .from('qr_sessions')
    .select('id, version_num')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .lt('expires_at', now);

  if (fetchError) {
    throw new AppError(`Failed to fetch expired QR sessions: ${fetchError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (!expiredSessions || expiredSessions.length === 0) {
    return 0;
  }

  let successCount = 0;

  // Transition each session to 'expired' under OCC protection
  for (const session of expiredSessions) {
    const { error: updateError } = await supabaseAdmin
      .from('qr_sessions')
      .update({
        status: 'expired',
        expired_at: now,
        version_num: session.version_num + 1,
        updated_at: now,
      })
      .eq('tenant_id', tenantId)
      .eq('id', session.id)
      .eq('version_num', session.version_num);

    if (!updateError) {
      successCount++;
    }
  }

  return successCount;
}
