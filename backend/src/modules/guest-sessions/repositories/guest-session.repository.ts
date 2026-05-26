import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { GuestSession } from '../guest-sessions.types';
import type { CreateGuestSessionDto } from '../guest-sessions.dtos';

export class GuestSessionRepository {
  static async createSession(
    dto: CreateGuestSessionDto & { expires_at: string }
  ): Promise<GuestSession> {
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .insert({
        tenant_id: dto.tenant_id,
        branch_id: dto.branch_id,
        table_id: dto.table_id,
        device_fingerprints: [dto.device_fingerprint],
        status: 'ACTIVE',
        expires_at: dto.expires_at,
        last_active_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, dto }, 'Failed to create guest session in repo');
      throw new Error(`[GuestSessionRepo] createSession failed: ${error.message}`);
    }
    return data;
  }

  static async findSessionById(tenantId: string, sessionId: string): Promise<GuestSession | null> {
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      logger.error({ err: error, tenantId, sessionId }, 'findSessionById failed');
      throw new Error(`[GuestSessionRepo] findSessionById: ${error.message}`);
    }
    return data;
  }

  static async findActiveSessionByTable(tenantId: string, tableId: string): Promise<GuestSession | null> {
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('status', 'ACTIVE')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error({ err: error, tenantId, tableId }, 'findActiveSessionByTable failed');
      throw new Error(`[GuestSessionRepo] findActiveSessionByTable: ${error.message}`);
    }
    return data;
  }

  static async addFingerprintToSession(
    tenantId: string,
    sessionId: string,
    fingerprint: string,
    existingFingerprints: string[]
  ): Promise<GuestSession> {
    const updatedFingerprints = Array.from(new Set([...existingFingerprints, fingerprint]));
    
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .update({
        device_fingerprints: updatedFingerprints,
        last_active_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      logger.error({ err: error, sessionId }, 'addFingerprintToSession failed');
      throw new Error(`[GuestSessionRepo] addFingerprintToSession: ${error.message}`);
    }
    return data;
  }

  static async updateSessionStatus(
    tenantId: string,
    sessionId: string,
    status: 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'ABANDONED'
  ): Promise<GuestSession> {
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .update({
        status,
        last_active_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      logger.error({ err: error, sessionId, status }, 'updateSessionStatus failed');
      throw new Error(`[GuestSessionRepo] updateSessionStatus: ${error.message}`);
    }
    return data;
  }

  static async cleanupAbandonedSessions(): Promise<number> {
    const now = new Date().toISOString();
    // Mark ACTIVE sessions that are past their expires_at as EXPIRED
    const { error: expireError, count: expiredCount } = await supabaseAdmin
      .from('guest_sessions')
      .update({ status: 'EXPIRED' })
      .eq('status', 'ACTIVE')
      .lt('expires_at', now);

    if (expireError) {
      logger.error({ err: expireError }, 'cleanupAbandonedSessions failed during expiration marking');
      throw new Error(`[GuestSessionRepo] cleanupExpired failed: ${expireError.message}`);
    }

    // Mark ACTIVE sessions that have no activity for 6 hours as ABANDONED
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { error: abandonError, count: abandonedCount } = await supabaseAdmin
      .from('guest_sessions')
      .update({ status: 'ABANDONED' })
      .eq('status', 'ACTIVE')
      .lt('last_active_at', sixHoursAgo);

    if (abandonError) {
      logger.error({ err: abandonError }, 'cleanupAbandonedSessions failed during abandonment marking');
      throw new Error(`[GuestSessionRepo] cleanupAbandoned failed: ${abandonError.message}`);
    }

    return (expiredCount ?? 0) + (abandonedCount ?? 0);
  }
}
