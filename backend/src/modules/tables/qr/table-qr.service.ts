// ============================================================
// src/modules/tables/qr/table-qr.service.ts
// QR Token Service
// ============================================================

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GuestSessionService } from '../../guest-sessions/services/guest-session.service';

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

    // Begin transaction-like sequence (or rely on Supabase RPC/MutationQueue for strict isolation)
    
    // 1. Invalidate current active tokens
    await this.supabase
      .from('table_qr_tokens')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('is_active', true);

    // 2. Cascade invalidate active guest sessions for the old token
    await this.supabase
      .from('guest_sessions')
      .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('status', 'ACTIVE');

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
    // 1. Resolve active token -> table context
    const { data: tokenData, error: tokenError } = await this.supabase
      .from('table_qr_tokens')
      .select('id, tenant_id, table_id, access_count')
      .eq('public_token', publicToken)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      // Intentionally obscure error for security against token enumeration
      throw new Error('Invalid or expired QR code.');
    }

    const { tenant_id, table_id } = tokenData;

    // 2. Resolve Table -> Branch -> Tenant context (Ensure it is NOT deleted/inactive)
    const { data: tableData, error: tableError } = await this.supabase
      .from('tables')
      .select('id, branch_id, table_number, display_name, is_active, deleted_at, branches(status, active_published_snapshot_id), tenants(name, is_operational)')
      .eq('id', tokenData.table_id)
      .eq('tenant_id', tokenData.tenant_id)
      .single();

    if (tableError || !tableData || !tableData.is_active || tableData.deleted_at !== null) {
      throw new Error('Table is currently unavailable.');
    }

    const branchData = tableData.branches as any;
    const tenantData = tableData.tenants as any;

    if (!tenantData?.is_operational) {
      throw new Error('Tenant is not currently operational.');
    }

    if (branchData?.status === 'SUSPENDED') {
      throw new Error('Branch is suspended.');
    }
    
    // Increment telemetry
    const secret = process.env.SESSION_SECRET || 'fallback-secret-123';
    const ipHash = crypto.createHmac('sha256', secret).update(requestIp).digest('hex');
    const uaHash = userAgent ? crypto.createHmac('sha256', secret).update(userAgent).digest('hex') : null;

    await this.supabase.from('table_qr_tokens').update({
      access_count: (tokenData.access_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString(),
      last_ip_hash: ipHash,
      user_agent_hash: uaHash
    }).eq('id', tokenData.id);
    
    // 3. Create or Rehydrate Guest Session via GuestSessionService
    const customerIdentityId = crypto.randomUUID(); // Anonymous identity generated for bootstrap

    const guestSession = await GuestSessionService.resolveOrCreateSession({
      tenant_id: tokenData.tenant_id,
      branch_id: tableData.branch_id,
      table_id: tokenData.table_id,
      device_fingerprint: deviceFingerprint || `anonymous-${requestIp}`,
      snapshot_id: branchData?.active_published_snapshot_id ?? undefined,
      customer_identity_id: customerIdentityId,
    });

    // 4. Audit Logging for Security
    await this.supabase.from('auth_audit_logs').insert({
      tenant_id,
      event_type: 'QR_SCANNED' as any,
      ip_address: requestIp,
      metadata: { table_id }
    });

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
        display_name: tableData.display_name
      },
      guestSession,
      customer_identity_id: guestSession.customer_identity_id ?? customerIdentityId,
      snapshot_version: branchData?.active_published_snapshot_id ?? null,
      runtime_version: '1.0.0',
      runtimeConfig: {
        features: ['ORDERING', 'WAITER_CALL']
      }
    };
  }
}
