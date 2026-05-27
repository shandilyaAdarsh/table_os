import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface CapacityMetricsInput {
  tenant_id: string;
  branch_id: string;
  replay_throughput: number;
  queue_pressure: number;
  websocket_load: number;
  worker_utilization: number;
  replay_saturation: number;
  rebuild_pressure: number;
}

export class RuntimeAutomationService {
  /**
   * Records live capacity and replay throughput telemetry.
   */
  static async recordCapacity(input: CapacityMetricsInput): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('runtime_capacity_metrics')
        .insert({
          tenant_id: input.tenant_id,
          branch_id: input.branch_id,
          replay_throughput: input.replay_throughput,
          queue_pressure: input.queue_pressure,
          websocket_load: input.websocket_load,
          worker_utilization: input.worker_utilization,
          replay_saturation: input.replay_saturation,
          rebuild_pressure: input.rebuild_pressure,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err: any) {
      logger.error({ err, input }, 'Failed to record capacity metrics');
      return null;
    }
  }

  /**
   * Assesses capacity parameters and signals autoscaling foundations recommendations.
   */
  static async evaluateAutoscaleSignals(tenantId: string, branchId: string): Promise<{
    should_scale_up: boolean;
    reason?: string;
    metrics?: CapacityMetricsInput;
  }> {
    try {
      // Query the latest capacity metric record
      const { data, error } = await supabaseAdmin
        .from('runtime_capacity_metrics')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return { should_scale_up: false };
      }

      // Check thresholds:
      // Replay throughput > 500 events/sec, or queue pressure > 100, or saturation > 85%
      const throughput = Number(data.replay_throughput);
      const queuePressure = Number(data.queue_pressure);
      const saturation = Number(data.replay_saturation);

      if (throughput > 500) {
        return {
          should_scale_up: true,
          reason: `High replay throughput: ${throughput} events/sec exceeds safety threshold 500`,
          metrics: data,
        };
      }

      if (queuePressure > 100) {
        return {
          should_scale_up: true,
          reason: `High queue pressure: ${queuePressure} depth exceeds safety threshold 100`,
          metrics: data,
        };
      }

      if (saturation > 85.00) {
        return {
          should_scale_up: true,
          reason: `Worker saturation high: ${saturation}% exceeds safety limit 85%`,
          metrics: data,
        };
      }

      return { should_scale_up: false, metrics: data };
    } catch (err: any) {
      logger.error({ err, tenantId, branchId }, 'Failed to evaluate autoscale signals');
      return { should_scale_up: false };
    }
  }
}
