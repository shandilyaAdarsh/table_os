// ============================================================
// src/modules/infrastructure/audit-runtime.service.ts
// Immutable transactional audit ledger and actor tracking service.
// Records security events, adjustments, and financial transitions.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { ObservabilityService } from './observability.service';
import type { AuditLogEntry } from './infrastructure.types';

export const AuditRuntimeService = {
  /**
   * Records an immutable audit log entry.
   * Merges incoming properties with active AsyncLocalStorage correlation context automatically.
   */
  async recordAudit(entry: {
    tenantId: string | null;
    branchId: string | null;
    action: string;
    payload: Record<string, any>;
    actorId?: string | null;
    actorType?: 'staff' | 'customer' | 'system' | 'anonymous';
  }): Promise<void> {
    const context = ObservabilityService.getContext();
    const correlationId = context?.correlationId || crypto.randomUUID();
    const ipAddress = context?.ipAddress || undefined;
    const userAgent = context?.userAgent || undefined;
    const actorId = entry.actorId || context?.actorId || null;
    const actorType = entry.actorType || context?.actorType || 'system';

    const auditEntry: AuditLogEntry = {
      tenantId: entry.tenantId,
      branchId: entry.branchId,
      actorId,
      actorType,
      action: entry.action,
      payload: entry.payload,
      correlationId,
      ipAddress,
      userAgent
    };

    try {
      const { error } = await supabaseAdmin
        .from('audit_logs')
        .insert({
          tenant_id: auditEntry.tenantId,
          branch_id: auditEntry.branchId,
          actor_id: auditEntry.actorId,
          actor_type: auditEntry.actorType,
          action: auditEntry.action,
          payload: auditEntry.payload,
          correlation_id: auditEntry.correlationId,
          ip_address: auditEntry.ipAddress || null,
          user_agent: auditEntry.userAgent || null
        });

      if (error) {
        // High-priority warning: audit logging must not abort core transaction, but must be reported
        ObservabilityService.error(`CRITICAL: Audit logging write failed for action: ${entry.action}`, error, { auditEntry });
      }
    } catch (err) {
      ObservabilityService.error(`CRITICAL: Unexpected exception writing audit log for: ${entry.action}`, err, { auditEntry });
    }
  },

  /**
   * Safely export audit logs for a tenant within a date range for compliance auditing.
   */
  async exportTenantAuditTrail(
    tenantId: string,
    startDate: string,
    endDate: string,
    limit: number = 1000
  ): Promise<AuditLogEntry[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []).map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        actorId: row.actor_id,
        actorType: row.actor_type as any,
        action: row.action,
        payload: row.payload,
        correlationId: row.correlation_id,
        ipAddress: row.ip_address || undefined,
        userAgent: row.user_agent || undefined,
        createdAt: row.created_at
      }));
    } catch (err) {
      ObservabilityService.error(`Failed to export audit trail for tenant ${tenantId}`, err);
      throw err;
    }
  }
};
export default AuditRuntimeService;
