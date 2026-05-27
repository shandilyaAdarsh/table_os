import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface WorkerInput {
  worker_id: string;
  tenant_id: string;
  branch_id: string;
  worker_role: 'REPLAYER' | 'WRITER' | 'MONITOR';
  replay_ownership?: string[];
  projection_ownership?: string[];
  deployment_version: string;
}

export class WorkerCoordinatorService {
  /**
   * Registers a new worker node or updates an existing one.
   */
  static async registerWorker(input: WorkerInput): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('runtime_worker_registry')
        .upsert({
          worker_id: input.worker_id,
          tenant_id: input.tenant_id,
          branch_id: input.branch_id,
          worker_role: input.worker_role,
          replay_ownership: input.replay_ownership || [],
          projection_ownership: input.projection_ownership || [],
          deployment_version: input.deployment_version,
          heartbeat_status: 'HEALTHY',
          last_heartbeat: new Date().toISOString(),
        }, { onConflict: 'worker_id' })
        .select()
        .single();

      if (error) throw error;
      logger.info({ workerId: input.worker_id }, '[WorkerCoordinator] Registered worker successfully');
      return data;
    } catch (err: any) {
      logger.error({ err, input }, 'Failed to register worker');
      throw new Error(`[WorkerCoordinatorService] registerWorker: ${err.message}`);
    }
  }

  /**
   * Update heartbeat of an existing worker.
   */
  static async heartbeat(workerId: string, reconnectLoad = 0): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('runtime_worker_registry')
        .update({
          last_heartbeat: new Date().toISOString(),
          heartbeat_status: 'HEALTHY',
          reconnect_load: reconnectLoad,
        })
        .eq('worker_id', workerId);

      if (error) throw error;
    } catch (err: any) {
      logger.error({ err, workerId }, 'Failed worker heartbeat update');
      throw new Error(`[WorkerCoordinatorService] heartbeat: ${err.message}`);
    }
  }

  /**
   * Evicts workers that have missed their heartbeats (e.g. older than 30s) and performs graceful failover of their locks.
   */
  static async evictStaleWorkers(tenantId: string, branchId: string): Promise<number> {
    const staleThreshold = new Date(Date.now() - 30 * 1000).toISOString();
    try {
      // Find stale workers
      const { data: staleWorkers, error: findErr } = await supabaseAdmin
        .from('runtime_worker_registry')
        .select('worker_id')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .lt('last_heartbeat', staleThreshold);

      if (findErr) throw findErr;

      if (!staleWorkers || staleWorkers.length === 0) return 0;

      const ids = staleWorkers.map(w => w.worker_id);

      // Evict them (which deletes cascades their projection ownership leases)
      const { error: deleteErr } = await supabaseAdmin
        .from('runtime_worker_registry')
        .delete()
        .in('worker_id', ids);

      if (deleteErr) throw deleteErr;

      logger.warn({ ids }, '[WorkerCoordinator] Evicted stale workers due to heartbeat failure');
      return ids.length;
    } catch (err: any) {
      logger.error({ err, tenantId, branchId }, 'Failed to evict stale workers');
      return 0;
    }
  }

  /**
   * Attempts to acquire or renew a deterministic lease lock on a projection.
   */
  static async acquireProjectionLease(params: {
    projectionName: string;
    tenantId: string;
    branchId: string;
    workerId: string;
    leaseDurationSeconds: number;
  }): Promise<boolean> {
    const expiresAt = new Date(Date.now() + params.leaseDurationSeconds * 1000).toISOString();
    try {
      // Evict stale workers in this branch first to ensure we clean up dead locks
      await this.evictStaleWorkers(params.tenantId, params.branchId);

      // Check if there is an existing lock
      const { data: existing, error: selectErr } = await supabaseAdmin
        .from('runtime_projection_ownership')
        .select('*')
        .eq('projection_name', params.projectionName)
        .eq('tenant_id', params.tenantId)
        .eq('branch_id', params.branchId)
        .maybeSingle();

      if (selectErr) throw selectErr;

      if (existing) {
        // If lease has expired, we can steal it
        const isExpired = new Date(existing.expires_at).getTime() < Date.now();
        
        if (existing.owner_worker_id === params.workerId || isExpired) {
          const { error: updateErr } = await supabaseAdmin
            .from('runtime_projection_ownership')
            .update({
              owner_worker_id: params.workerId,
              leased_at: new Date().toISOString(),
              expires_at: expiresAt,
            })
            .eq('projection_name', params.projectionName)
            .eq('tenant_id', params.tenantId)
            .eq('branch_id', params.branchId);

          if (updateErr) throw updateErr;
          return true;
        }

        // Lock is active and owned by someone else
        return false;
      }

      // No lock exists, attempt to insert
      const { error: insertErr } = await supabaseAdmin
        .from('runtime_projection_ownership')
        .insert({
          projection_name: params.projectionName,
          tenant_id: params.tenantId,
          branch_id: params.branchId,
          owner_worker_id: params.workerId,
          expires_at: expiresAt,
        });

      if (insertErr) {
        // Handle concurrent race insertions gracefully
        return false;
      }

      return true;
    } catch (err: any) {
      logger.error({ err, params }, 'Failed to acquire projection lease');
      return false;
    }
  }

  /**
   * Releases lease lock for a projection.
   */
  static async releaseProjectionLease(
    projectionName: string,
    tenantId: string,
    branchId: string,
    workerId: string
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('runtime_projection_ownership')
        .delete()
        .eq('projection_name', projectionName)
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('owner_worker_id', workerId);

      if (error) throw error;
    } catch (err: any) {
      logger.error({ err, projectionName, workerId }, 'Failed to release projection lease');
    }
  }
}
