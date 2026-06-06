import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { GuestSession } from '../guest-sessions.types';
import type { CreateGuestSessionDto } from '../guest-sessions.dtos';

export class GuestSessionRepository {
  static async createSession(
    dto: CreateGuestSessionDto & { expires_at: string }
  ): Promise<GuestSession> {
    // 1. Create or ensure customer identity first
    const { error: identityError } = await supabaseAdmin
      .from('customer_identities')
      .upsert({
        id: dto.customer_identity_id,
        tenant_id: dto.tenant_id,
      }, { onConflict: 'id' })
      .select('id')
      .single();

    if (identityError) {
      logger.error({ err: identityError, dto }, 'Failed to create customer identity in repo');
      throw new Error(`[GuestSessionRepo] createCustomerIdentity failed: ${identityError.message}`);
    }

    // 2. Create the session
    const crypto = require('crypto');
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .insert({
        tenant_id: dto.tenant_id,
        branch_id: dto.branch_id,
        table_id: dto.table_id,
        session_token: crypto.randomUUID(),
        guest_identifier: dto.customer_identity_id,
        is_active: true,
        session_data: {
          device_fingerprints: [dto.device_fingerprint],
          expires_at: dto.expires_at,
          snapshot_id: dto.snapshot_id ?? null,
        },
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
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

  static async findSessionByPk(sessionId: string): Promise<GuestSession | null> {
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      logger.error({ err: error, sessionId }, 'findSessionByPk failed');
      throw new Error(`[GuestSessionRepo] findSessionByPk: ${error.message}`);
    }
    return data;
  }

  static async findActiveSessionByTable(tenantId: string, tableId: string): Promise<GuestSession | null> {
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('is_active', true)
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
    existingData: Record<string, any>
  ): Promise<GuestSession> {
    const existingFingerprints = existingData.device_fingerprints || [];
    const updatedFingerprints = Array.from(new Set([...existingFingerprints, fingerprint]));
    
    const updatedData = {
      ...existingData,
      device_fingerprints: updatedFingerprints
    };

    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .update({
        session_data: updatedData,
        last_activity_at: new Date().toISOString(),
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
    status: 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'ABANDONED' | 'CLOSED'
  ): Promise<GuestSession> {
    const isActive = status === 'ACTIVE';
    
    const { data, error } = await supabaseAdmin
      .from('guest_sessions')
      .update({
        is_active: isActive,
        last_activity_at: new Date().toISOString(),
        ...(!isActive ? { ended_at: new Date().toISOString() } : {}),
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
    // Mark ACTIVE sessions that are past their expires_at as inactive (EXPIRED)
    // Note: Since expires_at is inside JSONB, we use the arrow operator.
    const { error: expireError, count: expiredCount } = await supabaseAdmin
      .from('guest_sessions')
      .update({ is_active: false, ended_at: now })
      .eq('is_active', true)
      .lt('session_data->>expires_at', now);

    if (expireError) {
      logger.error({ err: expireError }, 'cleanupAbandonedSessions failed during expiration marking');
      throw new Error(`[GuestSessionRepo] cleanupExpired failed: ${expireError.message}`);
    }

    // Mark ACTIVE sessions that have no activity for 6 hours as inactive (ABANDONED)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { error: abandonError, count: abandonedCount } = await supabaseAdmin
      .from('guest_sessions')
      .update({ is_active: false, ended_at: now })
      .eq('is_active', true)
      .lt('last_activity_at', sixHoursAgo);

    if (abandonError) {
      logger.error({ err: abandonError }, 'cleanupAbandonedSessions failed during abandonment marking');
      throw new Error(`[GuestSessionRepo] cleanupAbandoned failed: ${abandonError.message}`);
    }

    return (expiredCount ?? 0) + (abandonedCount ?? 0);
  }
}
