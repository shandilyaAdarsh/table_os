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
  snapshotVersion: any;
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
      .update({ is_active: false, rotated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .eq('is_active', true);

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
      payload: { rotated_at: new Date().toISOString() }
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
    deviceFingerprint?: string
  ): Promise<QRTokenBootstrapPayload> {
    // 1. Resolve active token -> table context
    const { data: tokenData, error: tokenError } = await this.supabase
      .from('table_qr_tokens')
      .select('tenant_id, table_id')
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
      .select('id, branch_id, table_number, display_name, is_active, deleted_at')
      .eq('id', table_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (tableError || !tableData || !tableData.is_active || tableData.deleted_at !== null) {
      throw new Error('Table is currently unavailable.');
    }

    // 3. Resolve active snapshot for the branch
    const { data: snapshotData } = await this.supabase
      .from('menu_snapshots')
      .select('id, version_num, snapshot_data')
      .eq('branch_id', tableData.branch_id)
      .eq('is_active', true)
      .single();

    // 4. Create or Rehydrate Guest Session via GuestSessionService
    const guestSession = await GuestSessionService.resolveOrCreateSession({
      tenant_id,
      branch_id: tableData.branch_id,
      table_id,
      device_fingerprint: deviceFingerprint || `anonymous-${requestIp}`,
    });

    // 5. Audit Logging for Security
    await this.supabase.from('auth_audit_logs').insert({
      tenant_id,
      event_type: 'QR_SCANNED' as any,
      ip_address: requestIp,
      metadata: { table_id }
    });

    // 6. Return Deterministic Bootstrap Contract
    return {
      tenant: { id: tenant_id },
      branch: { id: tableData.branch_id },
      table: { 
        id: tableData.id, 
        table_number: tableData.table_number,
        display_name: tableData.display_name
      },
      guestSession,
      snapshotVersion: snapshotData ? snapshotData.version_num : null,
      runtimeConfig: {
        features: ['ORDERING', 'WAITER_CALL']
      }
    };
  }
}
