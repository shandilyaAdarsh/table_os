// ============================================================
// src/modules/infrastructure/metrics.service.ts
// Aggregates and persists real-time operational reliability metrics.
// Tracks queue lag, KDS SLA breaches, websocket failures, and DB latency.
// ============================================================

import { performance } from 'node:perf_hooks';
import { supabaseAdmin } from '../../config/supabase';
import { ObservabilityService } from './observability.service';

export const MetricsService = {
  /**
   * Record worker latency, throughput, and error metrics.
   */
  async logWorkerLatency(
    workerName: string,
    partitionKey: string,
    eventId: string,
    eventType: string,
    executionTimeMs: number,
    status: 'success' | 'failed',
    errorReason?: string
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from('worker_metrics').insert({
        worker_name: workerName,
        partition_key: partitionKey,
        event_id: eventId,
        event_type: eventType,
        execution_time_ms: Math.round(executionTimeMs),
        status,
        error_reason: errorReason || null
      });

      if (error) {
        ObservabilityService.error('Failed to persist worker latency metric', error);
      }
    } catch (err) {
      ObservabilityService.error('Unexpected error logging worker latency', err);
    }
  },

  /**
   * Record queue partition backlog count and oldest pending event age.
   */
  async logQueueLag(
    partitionKey: string,
    oldestPendingAgeSec: number,
    pendingCount: number,
    failedCount: number,
    dlqCount: number
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from('queue_metrics').insert({
        partition_key: partitionKey,
        oldest_pending_age_sec: oldestPendingAgeSec,
        pending_count: pendingCount,
        failed_count: failedCount,
        dlq_count: dlqCount
      });

      if (error) {
        ObservabilityService.error('Failed to persist queue lag metrics', error);
      }
    } catch (err) {
      ObservabilityService.error('Unexpected error logging queue lag', err);
    }
  },

  /**
   * Record KDS SLA breaches.
   */
  async logSlaBreach(
    _tenantId: string,
    branchId: string,
    entityId: string,
    entityType: 'order' | 'item_preparation',
    breachType: string,
    actualDurationSec: number,
    limitDurationSec: number
  ): Promise<void> {
    try {
      // Store in financial_events or worker_metrics with event_type 'SLA_BREACH' for low-overhead storage
      const { error } = await supabaseAdmin.from('worker_metrics').insert({
        worker_name: 'KdsSupervisor',
        partition_key: branchId,
        event_id: entityId,
        event_type: `SLA_BREACH_${entityType.toUpperCase()}`,
        execution_time_ms: actualDurationSec * 1000,
        status: 'failed',
        error_reason: `Breach Type: ${breachType}. Limit: ${limitDurationSec}s. Actual: ${actualDurationSec}s.`,
        created_at: new Date().toISOString()
      });

      if (error) {
        ObservabilityService.error('Failed to record SLA breach metric', error);
      }
    } catch (err) {
      ObservabilityService.error('Unexpected error recording SLA breach', err);
    }
  },

  /**
   * Record websocket event fanout and push failures.
   */
  async logWebsocketFailure(
    _tenantId: string,
    branchId: string,
    channel: string,
    targetEvent: string,
    errorReason: string
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from('worker_metrics').insert({
        worker_name: 'RealtimePublisher',
        partition_key: branchId || 'global',
        event_type: 'WEBSOCKET_PUBLISH_FAILURE',
        execution_time_ms: 0,
        status: 'failed',
        error_reason: `Channel: ${channel}. Event: ${targetEvent}. Err: ${errorReason}`
      });

      if (error) {
        ObservabilityService.error('Failed to persist websocket failure metrics', error);
      }
    } catch (err) {
      ObservabilityService.error('Unexpected error logging websocket failure', err);
    }
  },

  /**
   * Record reconciliation job balance drift and drift counts.
   */
  async logReconciliationDrift(
    jobName: string,
    orderDriftCount: number,
    cartDriftCount: number,
    amountMismatchMinor: number
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin.from('reconciliation_metrics').insert({
        job_name: jobName,
        orders_reconciled: orderDriftCount,
        carts_reclaimed: cartDriftCount,
        kitchen_tickets_synced: 0,
        idempotency_keys_freed: amountMismatchMinor, // Map drift/mismatches minor here
        execution_time_ms: 0
      });

      if (error) {
        ObservabilityService.error('Failed to persist reconciliation metrics', error);
      }
    } catch (err) {
      ObservabilityService.error('Unexpected error logging reconciliation drift', err);
    }
  },

  /**
   * Wrap any database block or transaction to measure and trace SQL performance.
   */
  async trackDbLatency<T>(queryName: string, executionFn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await executionFn();
      const latency = performance.now() - start;
      
      // Only write metrics logs to DB for queries exceeding threshold (e.g. 100ms) to avoid amplification loops
      if (latency > 100) {
        ObservabilityService.warn(`Slow database query detected: ${queryName}`, {
          queryName,
          latencyMs: Math.round(latency)
        });
      }
      return result;
    } catch (err) {
      const latency = performance.now() - start;
      ObservabilityService.error(`Database query failed: ${queryName}`, err, {
        queryName,
        latencyMs: Math.round(latency)
      });
      throw err;
    }
  },

  /**
   * Fetch aggregated analytics view of operational reliability.
   */
  async getMetricsSummary(_tenantId: string, _branchId?: string, timeWindowHours: number = 24): Promise<Record<string, any>> {
    const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();

    const { data: workerData, error: workerErr } = await supabaseAdmin
      .from('worker_metrics')
      .select('status, execution_time_ms, event_type')
      .gte('created_at', since);

    if (workerErr) {
      throw workerErr;
    }

    const { data: queueData, error: queueErr } = await supabaseAdmin
      .from('queue_metrics')
      .select('oldest_pending_age_sec, pending_count, failed_count, dlq_count')
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (queueErr) {
      throw queueErr;
    }

    // Process summary aggregations
    const failures = workerData.filter(d => d.status === 'failed');
    const totalCount = workerData.length;
    
    const avgWorkerLatencyMs = totalCount > 0 
      ? Math.round(workerData.reduce((acc, curr) => acc + curr.execution_time_ms, 0) / totalCount) 
      : 0;

    const slaBreaches = failures.filter(f => f.event_type.startsWith('SLA_BREACH')).length;
    const websocketFailures = failures.filter(f => f.event_type === 'WEBSOCKET_PUBLISH_FAILURE').length;

    // Get current queue states
    const currentQueueLag = queueData[0] || { oldest_pending_age_sec: 0, pending_count: 0, failed_count: 0, dlq_count: 0 };

    return {
      timeWindowHours,
      totalWorkerThroughput: totalCount,
      avgWorkerLatencyMs,
      errorRate: totalCount > 0 ? Number((failures.length / totalCount).toFixed(4)) : 0,
      slaBreachesCount: slaBreaches,
      websocketPublishFailures: websocketFailures,
      queueState: {
        oldestPendingAgeSec: currentQueueLag.oldest_pending_age_sec,
        pendingCount: currentQueueLag.pending_count,
        failedCount: currentQueueLag.failed_count,
        dlqCount: currentQueueLag.dlq_count
      }
    };
  }
};
export default MetricsService;
