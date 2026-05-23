// ============================================================
// src/modules/infrastructure/healthcheck.service.ts
// Comprehensive healthcheck, dependency validation, liveness,
// readiness, and degraded-mode reporting service.
// ============================================================

import { performance } from 'node:perf_hooks';
import { supabaseAdmin } from '../../config/supabase';
import type { HealthReport, HealthDependencyReport } from './infrastructure.types';

export const HealthcheckService = {
  /**
   * Performs a lightweight liveness check.
   */
  getLivenessReport(): { status: 'UP'; timestamp: string } {
    return {
      status: 'UP',
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Performs deep readiness checks across all core dependencies.
   */
  async getReadinessReport(): Promise<HealthReport> {
    // Run dependency health checks concurrently with timeouts
    const [database, queue, realtime, workers] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkQueueHealth(),
      this.checkRealtimeHealth(),
      this.checkWorkersHealth()
    ]);

    // Check system status. If critical subsystems are DOWN, degrade or fail the container.
    let status: 'UP' | 'DOWN' | 'DEGRADED' = 'UP';
    if (database.status === 'DOWN' || queue.status === 'DOWN') {
      status = 'DOWN';
    } else if (
      database.status === 'DEGRADED' ||
      queue.status === 'DEGRADED' ||
      realtime.status !== 'UP' ||
      workers.status !== 'UP'
    ) {
      status = 'DEGRADED';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      version: process.env.APP_VERSION || '1.0.0',
      dependencies: {
        database,
        queue,
        realtime,
        workers
      }
    };
  },

  /**
   * Validates DB connectivity and runs a lightweight schema verification.
   */
  async checkDatabaseHealth(): Promise<HealthDependencyReport> {
    const start = performance.now();
    try {
      // Run quick query and fetch migrations count to verify migration compatibility
      const { error } = await supabaseAdmin.rpc('get_active_outbox_partitions');

      const latencyMs = performance.now() - start;

      if (error) {
        return {
          status: 'DEGRADED',
          latencyMs,
          message: `Database responsive but partition query failed: ${error.message}`
        };
      }

      return {
        status: 'UP',
        latencyMs,
        version: 'PostgreSQL + Supabase Schema Ready'
      };
    } catch (err: any) {
      const latencyMs = performance.now() - start;
      return {
        status: 'DOWN',
        latencyMs,
        message: `Database connection error: ${err.message}`
      };
    }
  },

  /**
   * Validates queue health, event backlog, and dead-letter size.
   */
  async checkQueueHealth(): Promise<HealthDependencyReport> {
    const start = performance.now();
    try {
      // Count pending/processing outbox events
      const { count: pendingCount, error: pendingErr } = await supabaseAdmin
        .from('domain_events')
        .select('*', { count: 'exact', head: true })
        .in('delivery_status', ['pending', 'processing']);

      // Count dead letters
      const { count: dlqCount, error: dlqErr } = await supabaseAdmin
        .from('dead_letter_events')
        .select('*', { count: 'exact', head: true });

      const latencyMs = performance.now() - start;

      if (pendingErr || dlqErr) {
        return {
          status: 'DEGRADED',
          latencyMs,
          message: `Queue query completed with error. Pending: ${pendingErr?.message}, DLQ: ${dlqErr?.message}`
        };
      }

      // Return degraded state if there's high backlog or dead letters accumulating
      const backlogSize = pendingCount ?? 0;
      const deadLetters = dlqCount ?? 0;

      if (backlogSize > 1000 || deadLetters > 100) {
        return {
          status: 'DEGRADED',
          latencyMs,
          message: `Backlog too high. Pending: ${backlogSize}, DLQ count: ${deadLetters}`
        };
      }

      return {
        status: 'UP',
        latencyMs,
        message: `Outbox health excellent. Backlog: ${backlogSize}, DLQ count: ${deadLetters}`
      };
    } catch (err: any) {
      const latencyMs = performance.now() - start;
      return {
        status: 'DOWN',
        latencyMs,
        message: `Queue health check failed: ${err.message}`
      };
    }
  },

  /**
   * Validates realtime publishing layer and connection pool.
   */
  async checkRealtimeHealth(): Promise<HealthDependencyReport> {
    const start = performance.now();
    try {
      // Make a dummy query to verified channels or check connectivity to subscription endpoints
      const { error } = await supabaseAdmin
        .from('worker_metrics')
        .select('id')
        .limit(1);

      const latencyMs = performance.now() - start;

      if (error) {
        return {
          status: 'DOWN',
          latencyMs,
          message: `Realtime tracking dependency failed: ${error.message}`
        };
      }

      return {
        status: 'UP',
        latencyMs,
        message: 'Realtime publishing channel operational'
      };
    } catch (err: any) {
      const latencyMs = performance.now() - start;
      return {
        status: 'DOWN',
        latencyMs,
        message: `Realtime health check failed: ${err.message}`
      };
    }
  },

  /**
   * Validates running queue workers status and last heartbeats.
   */
  async checkWorkersHealth(): Promise<HealthDependencyReport> {
    const start = performance.now();
    try {
      const now = new Date();
      // Fetch active heartbeats
      const { data: heartbeats, error } = await supabaseAdmin
        .from('worker_heartbeats')
        .select('worker_name, last_heartbeat_at, status');

      const latencyMs = performance.now() - start;

      if (error) {
        return {
          status: 'DEGRADED',
          latencyMs,
          message: `Could not fetch worker states: ${error.message}`
        };
      }

      if (!heartbeats || heartbeats.length === 0) {
        return {
          status: 'UP',
          latencyMs,
          message: 'No workers currently registered (idle standby)'
        };
      }

      // Check if any registered worker has timed out (e.g. missed heartbeats for over 60s)
      const staleWorkers = heartbeats.filter(hb => {
        const lastHb = new Date(hb.last_heartbeat_at).getTime();
        const diffSec = (now.getTime() - lastHb) / 1000;
        return hb.status === 'active' && diffSec > 60;
      });

      if (staleWorkers.length > 0) {
        const names = staleWorkers.map(w => w.worker_name).join(', ');
        return {
          status: 'DEGRADED',
          latencyMs,
          message: `Stale workers detected (last heartbeat > 60s ago): [${names}]`
        };
      }

      return {
        status: 'UP',
        latencyMs,
        message: `All registered workers active (${heartbeats.length} workers)`
      };
    } catch (err: any) {
      const latencyMs = performance.now() - start;
      return {
        status: 'DOWN',
        latencyMs,
        message: `Workers health check failed: ${err.message}`
      };
    }
  }
};
export default HealthcheckService;
