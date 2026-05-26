import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface RuntimeIncident {
  id?: string;
  tenant_id: string;
  branch_id: string;
  incident_type: 'SEQUENCE_GAP' | 'CHECKSUM_DRIFT' | 'REBUILD_FAILURE' | 'RECONNECT_STORM';
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  details?: Record<string, any>;
  resolved?: boolean;
}

export class IncidentService {
  /**
   * Appends a new operational incident to the append-only runtime incident logs.
   */
  static async logIncident(incident: RuntimeIncident): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from('runtime_incidents').insert({
        tenant_id: incident.tenant_id,
        branch_id: incident.branch_id,
        incident_type: incident.incident_type,
        severity: incident.severity,
        message: incident.message,
        details: incident.details || {},
        resolved: false,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      logger.warn(incident, '[IncidentService] Logged new runtime alert');
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
}
