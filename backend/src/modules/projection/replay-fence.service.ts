import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface ReplayFenceInput {
  tenant_id: string;
  branch_id: string;
  projection_generation: number;
  active_deployment_id: string;
  replay_epoch: string;
  compatibility_window: string; // e.g. '1 hour'
  expires_in_seconds: number;
}

export class ReplayFenceService {
  /**
   * Registers a new active replay fence during deployment sequence.
   */
  static async activateFence(input: ReplayFenceInput): Promise<any> {
    const expiresAt = new Date(Date.now() + input.expires_in_seconds * 1000).toISOString();
    
    try {
      const { data, error } = await supabaseAdmin
        .from('runtime_replay_fences')
        .insert({
          tenant_id: input.tenant_id,
          branch_id: input.branch_id,
          projection_generation: input.projection_generation,
          active_deployment_id: input.active_deployment_id,
          replay_epoch: input.replay_epoch,
          compatibility_window: input.compatibility_window,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) throw error;
      logger.info({ fenceId: data.id, deploymentId: input.active_deployment_id }, '[ReplayFence] Activated new operational fence');
      return data;
    } catch (err: any) {
      logger.error({ err, input }, 'Failed to activate replay fence');
      throw new Error(`[ReplayFenceService] activateFence: ${err.message}`);
    }
  }

  /**
   * Validates if a client projection generation and deployment id is allowed.
   * If a fence is active and the client uses an obsolete generation, this returns false.
   */
  static async validateGeneration(params: {
    tenantId: string;
    branchId: string;
    clientGeneration: number;
    clientDeploymentId?: string;
  }): Promise<{ isAllowed: boolean; reason?: string; activeFence?: any }> {
    try {
      const { data: fences, error } = await supabaseAdmin
        .from('runtime_replay_fences')
        .select('*')
        .eq('tenant_id', params.tenantId)
        .eq('branch_id', params.branchId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!fences || fences.length === 0) {
        return { isAllowed: true };
      }

      // Check the latest fence
      const activeFence = fences[0];
      
      // If client generation does not match the fenced generation, reject it
      if (params.clientGeneration < Number(activeFence.projection_generation)) {
        return {
          isAllowed: false,
          reason: `Stale consumer rejected: client generation ${params.clientGeneration} is behind active fence generation ${activeFence.projection_generation}`,
          activeFence,
        };
      }

      // If a deployment id is supplied, check compatibility
      if (params.clientDeploymentId && params.clientDeploymentId !== activeFence.active_deployment_id) {
        return {
          isAllowed: false,
          reason: `Deployment mismatch: client deployment ID ${params.clientDeploymentId} does not match active deployment ID ${activeFence.active_deployment_id}`,
          activeFence,
        };
      }

      return { isAllowed: true, activeFence };
    } catch (err: any) {
      logger.error({ err, params }, 'Failed to validate generation against active fences');
      // On error, default to safe fallback: allow it but log incident
      return { isAllowed: true };
    }
  }

  /**
   * Proactively expires all fences for a branch to resume standard operation.
   */
  static async clearFences(tenantId: string, branchId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('runtime_replay_fences')
        .update({ expires_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;
      logger.info({ tenantId, branchId }, '[ReplayFence] Cleared all active fences');
    } catch (err: any) {
      logger.error({ err, tenantId, branchId }, 'Failed to clear active fences');
    }
  }
}
