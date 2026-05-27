import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface SurfaceIdentityInput {
  id?: string;
  tenant_id: string;
  branch_id: string;
  surface_type: 'ADMIN' | 'STAFF' | 'POS' | 'QR';
  runtime_generation: number;
  replay_epoch: string;
  active_projection_generation: number;
  reconnect_state: 'CONNECTED' | 'DISCONNECTED' | 'SYNCHRONIZING';
  deployment_compatibility: string;
}

export interface TelemetryInput {
  surface_id: string;
  tenant_id: string;
  branch_id: string;
  replay_lag_ms: number;
  convergence_latency_ms: number;
  reconnect_count: number;
  drift_frequency: number;
  throughput_events_per_sec: number;
}

export class RuntimeConvergenceCoordinator {
  /**
   * Registers or heartbeats a surface runtime identity.
   */
  static async registerSurface(input: SurfaceIdentityInput): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('runtime_surface_identities')
        .upsert({
          id: input.id,
          tenant_id: input.tenant_id,
          branch_id: input.branch_id,
          surface_type: input.surface_type,
          runtime_generation: input.runtime_generation,
          replay_epoch: input.replay_epoch,
          active_projection_generation: input.active_projection_generation,
          reconnect_state: input.reconnect_state,
          deployment_compatibility: input.deployment_compatibility,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,branch_id,surface_type,id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err: any) {
      logger.error({ err, input }, 'Failed to register surface identity');
      throw new Error(`[RuntimeConvergenceCoordinator] registerSurface: ${err.message}`);
    }
  }

  /**
   * Record telemetry metrics for a given surface context.
   */
  static async recordTelemetry(input: TelemetryInput): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('runtime_convergence_metrics')
        .insert({
          tenant_id: input.tenant_id,
          branch_id: input.branch_id,
          surface_id: input.surface_id,
          replay_lag_ms: input.replay_lag_ms,
          convergence_latency_ms: input.convergence_latency_ms,
          reconnect_count: input.reconnect_count,
          drift_frequency: input.drift_frequency,
          throughput_events_per_sec: input.throughput_events_per_sec,
        });

      if (error) throw error;
    } catch (err: any) {
      logger.error({ err, input }, 'Failed to record convergence telemetry');
    }
  }

  /**
   * Generates a cross-surface drift report comparing generations and epochs.
   */
  static async generateCrossSurfaceDriftReport(tenantId: string, branchId: string): Promise<{
    divergent: boolean;
    reference_generation: number;
    surfaces: any[];
  }> {
    try {
      // Fetch all active surfaces in the branch within last 5 minutes
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: surfaces, error } = await supabaseAdmin
        .from('runtime_surface_identities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .gt('last_seen_at', fiveMinsAgo);

      if (error) throw error;

      if (!surfaces || surfaces.length === 0) {
        return { divergent: false, reference_generation: 0, surfaces: [] };
      }

      // Max active generation serves as reference benchmark
      const maxGen = Math.max(...surfaces.map(s => Number(s.active_projection_generation)));
      
      let divergent = false;
      const enrichedSurfaces = surfaces.map(s => {
        const drift = maxGen - Number(s.active_projection_generation);
        const isDivergent = drift > 0;
        if (isDivergent) divergent = true;

        return {
          id: s.id,
          surface_type: s.surface_type,
          active_projection_generation: Number(s.active_projection_generation),
          drift_offset: drift,
          epoch: s.replay_epoch,
          reconnect_state: s.reconnect_state,
          divergent: isDivergent,
        };
      });

      return {
        divergent,
        reference_generation: maxGen,
        surfaces: enrichedSurfaces,
      };
    } catch (err: any) {
      logger.error({ err, tenantId, branchId }, 'Failed to generate cross-surface drift report');
      return { divergent: false, reference_generation: 0, surfaces: [] };
    }
  }
}
