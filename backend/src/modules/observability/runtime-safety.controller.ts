// ============================================================
// src/modules/observability/runtime-safety.controller.ts
// Issues bounded operational safety directives for the runtime.
// ============================================================

import { TelemetryBroadcaster } from './telemetry.broadcaster';

export type SafetyDirectiveType = 'THROTTLE_REPLAY' | 'ENGAGE_DEGRADED_MODE' | 'CONTAIN_RECONNECTS' | 'PAUSE_MUTATIONS';

export interface SafetyDirective {
  id: string;
  type: SafetyDirectiveType;
  tenant_id: string;
  issued_at: string;
  expires_at: string;
  issued_by: string;
  renewed_by?: string;
  justification: string;
  incident_id?: string;
  metadata?: Record<string, any>;
}

export class RuntimeSafetyController {
  private static directives: Map<string, SafetyDirective> = new Map();

  /**
   * Evaluates if a specific safety directive is currently active for a tenant.
   * Cleans up expired directives implicitly during the check.
   */
  public static isDirectiveActive(tenant_id: string, type: SafetyDirectiveType): boolean {
    const active = this.getActiveDirectives(tenant_id);
    return active.some(d => d.type === type);
  }

  public static getActiveDirectives(tenant_id: string): SafetyDirective[] {
    const now = new Date().getTime();
    const active: SafetyDirective[] = [];
    const toDelete: string[] = [];

    for (const [id, directive] of this.directives.entries()) {
      if (directive.tenant_id !== tenant_id) continue;
      
      const expiresAt = new Date(directive.expires_at).getTime();
      if (now > expiresAt) {
        toDelete.push(id);
      } else {
        active.push(directive);
      }
    }

    for (const id of toDelete) {
      this.directives.delete(id);
    }

    return active;
  }

  public static issueDirective(
    tenant_id: string,
    type: SafetyDirectiveType,
    ttlMinutes: number,
    issued_by: string,
    justification: string,
    incident_id?: string,
    metadata?: Record<string, any>
  ): SafetyDirective {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60000);

    const directive: SafetyDirective = {
      id: `dir_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      tenant_id,
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      issued_by,
      justification,
      incident_id,
      metadata
    };

    // Replace existing directive of the same type to avoid duplicates, 
    // effectively acting as a renewal or overwrite.
    for (const [id, existing] of this.directives.entries()) {
      if (existing.tenant_id === tenant_id && existing.type === type) {
        this.directives.delete(id);
      }
    }

    this.directives.set(directive.id, directive);
    
    TelemetryBroadcaster.enqueue({
      tenant_id,
      runtime_surface: 'BACKEND_ENGINE',
      domain: 'system',
      event_type: 'RUNTIME_SAFETY_ACTION',
      severity: 'WARNING',
      incident_id,
      metadata: {
        directive_id: directive.id,
        action: 'ISSUED',
        type,
        issued_by,
        justification,
        expires_at: directive.expires_at,
        ...metadata
      }
    });

    return directive;
  }

  public static revokeDirective(tenant_id: string, type: SafetyDirectiveType, revoked_by: string, justification: string): void {
    const toDelete: string[] = [];
    for (const [id, directive] of this.directives.entries()) {
      if (directive.tenant_id === tenant_id && directive.type === type) {
        toDelete.push(id);
        
        TelemetryBroadcaster.enqueue({
          tenant_id,
          runtime_surface: 'BACKEND_ENGINE',
          domain: 'system',
          event_type: 'RUNTIME_SAFETY_ACTION',
          severity: 'INFO',
          incident_id: directive.incident_id,
          metadata: {
            directive_id: id,
            action: 'REVOKED',
            type,
            revoked_by,
            justification
          }
        });
      }
    }
    for (const id of toDelete) {
      this.directives.delete(id);
    }
  }
}
