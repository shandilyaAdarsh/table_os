import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';
import { rebuildTableProjection } from '../tables/projections/table-runtime.projection';
import * as tableRepo from '../tables/repositories/table.repository';

export interface RuntimeIncident {
  id?: string;
  tenant_id: string;
  branch_id: string;
  incident_type: 'SEQUENCE_GAP' | 'CHECKSUM_DRIFT' | 'REBUILD_FAILURE' | 'RECONNECT_STORM' | 'FENCE_VIOLATION' | 'CROSS_SURFACE_DIVERGENCE' | 'REPLAY_SATURATION' | 'DEPLOYMENT_INSTABILITY';
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  details?: Record<string, any>;
  resolved?: boolean;
}

export class IncidentService {
  /**
   * Appends a new operational incident to the append-only runtime incident logs.
   * If a CRITICAL drift or gap occurs, triggers automatic projection rebuilds.
   */
  static async logIncident(incident: RuntimeIncident): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('runtime_incidents')
        .insert({
          tenant_id: incident.tenant_id,
          branch_id: incident.branch_id,
          incident_type: incident.incident_type,
          severity: incident.severity,
          message: incident.message,
          details: incident.details || {},
          resolved: false,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      logger.warn(incident, '[IncidentService] Logged new runtime alert');

      // ─── Escalation & Automatic Rebuild Triggers ─────────────────────────
      const shouldTriggerAutoRebuild =
        incident.severity === 'CRITICAL' &&
        (incident.incident_type === 'CHECKSUM_DRIFT' || incident.incident_type === 'SEQUENCE_GAP');

      if (shouldTriggerAutoRebuild) {
        logger.info({ tenantId: incident.tenant_id, branchId: incident.branch_id }, '[IncidentService] Escalation: Triggering automatic recovery rebuild');
        
        // Asynchronously rebuild all tables in this branch to converge state
        void (async () => {
          try {
            const tables = await tableRepo.listTables(incident.tenant_id, { branch_id: incident.branch_id });
            for (const table of tables.data) {
              await rebuildTableProjection(supabaseAdmin, incident.tenant_id, table.id);
            }
            logger.info({ branchId: incident.branch_id }, '[IncidentService] Automatic recovery rebuild succeeded');
          } catch (rebuildErr) {
            logger.error({ err: rebuildErr, branchId: incident.branch_id }, 'Automatic recovery rebuild failed');
          }
        })();
      }
    } catch (err: any) {
      logger.error({ err, incident }, 'Failed to record runtime incident to database');
    }
  }

  /**
   * Resolves a runtime incident.
   */
  static async resolveIncident(tenantId: string, incidentId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('runtime_incidents')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', incidentId);
    } catch (err: any) {
      logger.error({ err, incidentId }, 'Failed to resolve runtime incident');
    }
  }

  /**
   * Calculates the convergence degradation score for a branch.
   * 0 indicates a perfectly healthy/converged state.
   * 100 indicates complete degradation (critical failures).
   */
  static async getDegradationScore(tenantId: string, branchId: string): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin
        .from('runtime_incidents')
        .select('severity')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('resolved', false);

      if (error) throw error;

      if (!data || data.length === 0) return 0;

      let score = 0;
      for (const incident of data) {
        if (incident.severity === 'CRITICAL') {
          score += 35;
        } else {
          score += 10;
        }
      }

      return Math.min(score, 100);
    } catch (err: any) {
      logger.error({ err, tenantId, branchId }, 'Failed to calculate degradation score');
      return 0;
    }
  }
}
