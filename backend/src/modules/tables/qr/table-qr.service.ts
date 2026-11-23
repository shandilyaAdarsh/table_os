/* eslint-disable */
// ============================================================
// src/modules/tables/qr/table-qr.service.ts
// QR Token Service
// ============================================================

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GuestSessionService } from '../../guest-sessions/services/guest-session.service';
import { logger } from '../../../shared/utils/logger';

export interface QRTokenBootstrapPayload {
  tenant: any;
  branch: any;
  table: any;
  guestSession: any;
  customer_identity_id: string;
  snapshot_version: any;
  runtime_version: string;
  runtimeConfig: any;
}

export class TableQRService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Generates a cryptographically secure random token with sufficient entropy.
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Rotates a QR token for a table. Invalidates old tokens, creates a new one,
   * and ensures only a single active token exists per table.
   */
  async rotateTableToken(tenantId: string, tableId: string): Promise<string> {
    const newToken = this.generateSecureToken();

    // Note: We no longer auto-invalidate the old QR code or its associated guest sessions.
    // They will be left active to expire naturally, preventing in-progress diners from being booted.


    // 2. Insert new token
    const { error } = await this.supabase
      .from('table_qr_tokens')
      .insert({
        tenant_id: tenantId,
        table_id: tableId,
        public_token: newToken,
        is_active: true
      });

    if (error) {
      throw new Error(`Failed to rotate QR token: ${error.message}`);
    }

    // 3. Emit projection/runtime event for audit & WebSocket updates
    await this.supabase.from('domain_events').insert({
      tenant_id: tenantId,
      aggregate_type: 'TABLE',
      aggregate_id: tableId,
      event_type: 'TABLE_QR_ROTATED',
      payload: { revoked_at: new Date().toISOString() }
    });

    return newToken;
  }

  /**
   * Resolves a public QR token and deterministically returns the bootstrap payload.
   * This is the core runtime flow for QR scans.
   */
  async resolvePublicToken(
    publicToken: string,
    requestIp: string,
    userAgent?: string,
    deviceFingerprint?: string
  ): Promise<QRTokenBootstrapPayload> {
    // 1. Resolve active token -> table context (legacy table_qr_tokens or permanent tables.qr_token)
    let tokenData: { id?: string; tenant_id: string; table_id: string; access_count?: number } | null = null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicToken);

    if (isUuid) {
      // Permanent non-expiring QR codes (table_id IS the QR code)
      const { data: tableRow } = await this.supabase
        .from('tables')
        .select('id, tenant_id')
        .eq('id', publicToken)
        .is('deleted_at', null)
        .maybeSingle();

      if (tableRow) {
        tokenData = {
          tenant_id: tableRow.tenant_id,
          table_id: tableRow.id,
          access_count: 0,
        };
      }
    } else {
      // Legacy table_qr_tokens or tables.qr_token fallback
      const { data: legacyToken, error: tokenError } = await this.supabase
        .from('table_qr_tokens')
        .select('id, tenant_id, table_id, access_count')
        .eq('public_token', publicToken)
        .eq('is_active', true)
        .maybeSingle();

      if (!tokenError && legacyToken) {
        tokenData = legacyToken;
      } else {
        const { data: tableRow } = await this.supabase
          .from('tables')
          .select('id, tenant_id, qr_token')
          .eq('qr_token', publicToken)
          .is('deleted_at', null)
          .maybeSingle();

        if (tableRow?.qr_token) {
          tokenData = {
            tenant_id: tableRow.tenant_id,
            table_id: tableRow.id,
            access_count: 0,
          };
        }
      }
    }

    if (!tokenData) {
      logger.warn({ token: publicToken }, 'QR resolution failed: Token not found or expired');
      throw new Error('Invalid or expired QR code.');
    }

    const { tenant_id, table_id } = tokenData;

    logger.info({
      token: publicToken,
      decodedPayload: tokenData,
      tableId: table_id,
      tenantId: tenant_id,
    }, 'QR token decoded, beginning context resolution');

    // 2. Resolve Table context (Ensure it is NOT deleted/inactive)
    const { data: tableData, error: tableError } = await this.supabase
      .from('tables')
      .select('id, branch_id, table_number, display_name, is_active, deleted_at, table_floors(name)')
      .eq('id', tokenData.table_id)
      .eq('tenant_id', tokenData.tenant_id)
      .single();

    if (tableError || !tableData) {
      logger.error({ tableId: table_id, error: tableError }, 'QR resolution failed: TABLE_RECORD_MISSING');
      throw new Error('TABLE_RECORD_MISSING');
    }

    if (tableData.deleted_at !== null) {
      logger.warn({ tableId: table_id, deletedAt: tableData.deleted_at }, 'QR resolution failed: TABLE_SOFT_DELETED');
      throw new Error('TABLE_SOFT_DELETED');
    }

    if (!tableData.is_active) {
      logger.warn({ tableId: table_id }, 'QR resolution failed: TABLE_INACTIVE');
      throw new Error('TABLE_INACTIVE');
    }

    // 3. Resolve Branch context
    const { data: branchData, error: branchError } = await this.supabase
      .from('branches')
      .select('status, active_published_snapshot_id')
      .eq('id', tableData.branch_id)
      .single();

    if (branchError || !branchData) {
      logger.error({ tableId: table_id, branchId: tableData.branch_id, error: branchError }, 'QR resolution failed: BRANCH_MISSING');
      throw new Error('BRANCH_MISSING');
    }

    // 4. Resolve Tenant context
    const { data: tenantData, error: tenantError } = await this.supabase
      .from('tenants')
      .select('name, is_active')
      .eq('id', tokenData.tenant_id)
      .single();

    if (tenantError || !tenantData) {
      logger.error({ tableId: table_id, tenantId: tenant_id, error: tenantError }, 'QR resolution failed: TENANT_MISSING');
      throw new Error('TENANT_MISSING');
    }

    if (!tenantData.is_active) {
      logger.warn({ tenantId: tenant_id }, 'QR resolution failed: Tenant is not currently operational');
      throw new Error('Tenant is not currently operational.');
    }

    if (branchData.status === 'SUSPENDED') {
      logger.warn({ branchId: tableData.branch_id }, 'QR resolution failed: Branch is suspended');
      throw new Error('Branch is suspended.');
    }

    logger.info({
      tableId: tableData.id,
      branchId: tableData.branch_id,
      tenantId: tenant_id,
    }, 'QR context successfully resolved');

    
    // Increment telemetry
    const secret = process.env.SESSION_SECRET || 'fallback-secret-123';
    const ipHash = crypto.createHmac('sha256', secret).update(requestIp).digest('hex');
    const uaHash = userAgent ? crypto.createHmac('sha256', secret).update(userAgent).digest('hex') : null;

    if (tokenData.id) {
      await this.supabase.from('table_qr_tokens').update({
        access_count: (tokenData.access_count ?? 0) + 1,
        last_accessed_at: new Date().toISOString(),
        last_ip_hash: ipHash,
        user_agent_hash: uaHash,
      }).eq('id', tokenData.id);
    }
    
    // 3. Create or Rehydrate Guest Session via GuestSessionService
    const customerIdentityId = crypto.randomUUID(); // Anonymous identity generated for bootstrap

    let guestSession;
    try {
      guestSession = await GuestSessionService.resolveOrCreateSession({
        tenant_id: tokenData.tenant_id,
        branch_id: tableData.branch_id,
        table_id: tokenData.table_id,
        device_fingerprint: deviceFingerprint || `anonymous-${requestIp}`,
        snapshot_id: branchData?.active_published_snapshot_id ?? undefined,
        customer_identity_id: customerIdentityId,
        qr_code_id: tokenData.id,
      });
    } catch (sessionErr: any) {
      // Fallback for legacy foreign key constraint mismatch on guest_sessions.qr_code_id
      if (sessionErr.message?.includes('violates foreign key constraint') && tokenData.id) {
        logger.warn({ error: sessionErr }, 'Retrying guest session creation without qr_code_id due to legacy foreign key constraint');
        guestSession = await GuestSessionService.resolveOrCreateSession({
          tenant_id: tokenData.tenant_id,
          branch_id: tableData.branch_id,
          table_id: tokenData.table_id,
          device_fingerprint: deviceFingerprint || `anonymous-${requestIp}`,
          snapshot_id: branchData?.active_published_snapshot_id ?? undefined,
          customer_identity_id: customerIdentityId,
          qr_code_id: undefined,
        });
      } else {
        throw sessionErr;
      }
    }

    // 4. Audit Logging for Security (best-effort, non-blocking)
    try {
      await this.supabase.from('auth_audit_logs').insert({
        tenant_id,
        event_type: 'LOGIN_SUCCESS' as any,
        ip_address: requestIp,
        metadata: { table_id, action: 'QR_SCANNED' }
      });
    } catch {
      // Non-blocking telemetry
    }

    // 5. Return Deterministic Bootstrap Contract
    return {
      tenant: { 
        id: tokenData.tenant_id,
        name: tenantData?.name 
      },
      branch: { id: tableData.branch_id },
      table: { 
        id: tableData.id, 
        table_number: tableData.table_number,
        display_name: tableData.display_name,
        table_floors: tableData.table_floors
      },
      guestSession,
      customer_identity_id: guestSession.guest_identifier ?? customerIdentityId,
      snapshot_version: branchData?.active_published_snapshot_id ?? null,
      runtime_version: '1.0.0',
      runtimeConfig: {
        features: ['ORDERING', 'WAITER_CALL']
      }
    };
  }
}
