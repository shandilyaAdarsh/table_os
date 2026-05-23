// ============================================================
// src/modules/infrastructure/worker-supervisor.service.ts
// Distributed Worker Supervisor Service managing worker heartbeats,
// leases, stuck worker detection, and failover coordination.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { ObservabilityService } from './observability.service';

export const WorkerSupervisorService = {
  /**
   * Acquire a unique worker lease to prevent multiple nodes from consuming the same partition.
   * Utilizes optimistic locking / CAS on version_num.
   */
  async acquireLease(workerName: string, nodeId: string, leaseDurationSec: number = 30): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseDurationSec * 1000).toISOString();

    try {
      // 1. Check if the lease record already exists
      const { data: existingLease, error: fetchError } = await supabaseAdmin
        .from('worker_leases')
        .select('*')
        .eq('worker_name', workerName)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is code for 'no rows returned'
        throw fetchError;
      }

      if (!existingLease) {
        // First-time lease initialization
        const { error: insertError } = await supabaseAdmin
          .from('worker_leases')
          .insert({
            worker_name: workerName,
            node_id: nodeId,
            lease_acquired_at: now.toISOString(),
            lease_expires_at: expiresAt,
            status: 'active',
            version_num: 1
          });

        if (insertError) {
          // If insert failed (e.g. duplicate key due to race condition), return false to let caller retry
          ObservabilityService.warn(`Race condition: Lease collision during insert for ${workerName}`, { workerName, nodeId });
          return false;
        }

        ObservabilityService.info(`Successfully initialized and acquired new lease for worker ${workerName}`, { workerName, nodeId });
        return true;
      }

      // 2. Lease exists. Check if active and owned by another node
      const currentExpiry = new Date(existingLease.lease_expires_at);
      const isLeaseActive = existingLease.status === 'active' && currentExpiry.getTime() > now.getTime();

      if (isLeaseActive && existingLease.node_id !== nodeId) {
        // Active lease belongs to another node. Cannot acquire.
        ObservabilityService.info(`Lease for worker ${workerName} is currently active on node ${existingLease.node_id}. Rejection.`, { workerName, nodeId });
        return false;
      }

      // 3. Lease is either expired, orphaned, or already owned by this node. Re-acquire using CAS
      const { error: updateError } = await supabaseAdmin
        .from('worker_leases')
        .update({
          node_id: nodeId,
          lease_acquired_at: now.toISOString(),
          lease_expires_at: expiresAt,
          status: 'active',
          // version_num is automatically incremented by the DB trigger trg_increment_lease_version
        })
        .eq('worker_name', workerName)
        .eq('version_num', existingLease.version_num); // CAS check

      if (updateError) {
        // CAS failed due to concurrent update
        ObservabilityService.warn(`CAS update failed when acquiring lease for ${workerName}`, { workerName, nodeId });
        return false;
      }

      ObservabilityService.info(`Successfully renewed/acquired lease for worker ${workerName}`, { workerName, nodeId });
      return true;
    } catch (err) {
      ObservabilityService.error(`Critical error acquiring lease for ${workerName}`, err, { workerName, nodeId });
      return false;
    }
  },

  /**
   * Heartbeat / renew an active lease to maintain worker execution locks.
   */
  async renewLease(workerName: string, nodeId: string, leaseDurationSec: number = 30): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseDurationSec * 1000).toISOString();

    try {
      // Direct update asserting current ownership
      const { data, error } = await supabaseAdmin
        .from('worker_leases')
        .update({
          lease_expires_at: expiresAt,
          status: 'active'
        })
        .eq('worker_name', workerName)
        .eq('node_id', nodeId)
        .eq('status', 'active')
        .select('*');

      if (error || !data || data.length === 0) {
        ObservabilityService.warn(`Failed to renew active lease for ${workerName}. Lease lost or hijacked.`, { workerName, nodeId });
        return false;
      }

      // Also register general worker heartbeat
      await supabaseAdmin.from('worker_heartbeats').upsert({
        worker_name: workerName,
        last_heartbeat_at: now.toISOString(),
        status: 'active'
      }, {
        onConflict: 'worker_name'
      });

      return true;
    } catch (err) {
      ObservabilityService.error(`Failed to execute heartbeat lease for ${workerName}`, err, { workerName, nodeId });
      return false;
    }
  },

  /**
   * Release a lease gracefully during worker shutdown.
   */
  async releaseLease(workerName: string, nodeId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('worker_leases')
        .update({
          status: 'released',
          lease_expires_at: new Date().toISOString()
        })
        .eq('worker_name', workerName)
        .eq('node_id', nodeId);

      if (error) {
        ObservabilityService.error(`Failed to release lease gracefully for ${workerName}`, error);
      } else {
        ObservabilityService.info(`Successfully released lease gracefully for ${workerName}`, { workerName, nodeId });
      }

      // Update worker heartbeat status to inactive
      await supabaseAdmin.from('worker_heartbeats').upsert({
        worker_name: workerName,
        status: 'inactive',
        last_heartbeat_at: new Date().toISOString()
      }, {
        onConflict: 'worker_name'
      });
    } catch (err) {
      ObservabilityService.error(`Unexpected error during lease release for ${workerName}`, err);
    }
  },

  /**
   * Scans for stuck/expired leases and marks them orphaned to trigger failover.
   */
  async detectAndRecoverStaleLeases(): Promise<number> {
    const now = new Date().toISOString();

    try {
      // Find all leases that have expired
      const { data: expiredLeases, error: fetchError } = await supabaseAdmin
        .from('worker_leases')
        .select('*')
        .eq('status', 'active')
        .lt('lease_expires_at', now);

      if (fetchError) {
        throw fetchError;
      }

      if (!expiredLeases || expiredLeases.length === 0) {
        return 0;
      }

      let recoveredCount = 0;
      for (const lease of expiredLeases) {
        // CAS update to mark lease as orphaned
        const { error: updateError } = await supabaseAdmin
          .from('worker_leases')
          .update({
            status: 'orphaned'
          })
          .eq('id', lease.id)
          .eq('version_num', lease.version_num);

        if (!updateError) {
          recoveredCount++;
          ObservabilityService.warn(`Stuck worker lease detected and marked orphaned (Triggering Failover)`, {
            workerName: lease.worker_name,
            nodeId: lease.node_id,
            expiredAt: lease.lease_expires_at
          });

          // Also release any locked domain events held by this worker name so other workers can immediately claim them
          const { error: lockReleaseErr } = await supabaseAdmin
            .from('domain_events')
            .update({
              delivery_status: 'failed',
              locked_by: null,
              locked_until: null,
              error_reason: 'Failover: Lease expired'
            })
            .eq('locked_by', lease.worker_name)
            .eq('delivery_status', 'processing');

          if (lockReleaseErr) {
            ObservabilityService.error(`Failed to release event locks for worker ${lease.worker_name}`, lockReleaseErr);
          }
        }
      }

      return recoveredCount;
    } catch (err) {
      ObservabilityService.error('Error executing stale leases check', err);
      return 0;
    }
  }
};
export default WorkerSupervisorService;
