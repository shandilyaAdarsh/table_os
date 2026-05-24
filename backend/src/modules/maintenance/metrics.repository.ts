// ============================================================
// src/modules/maintenance/metrics.repository.ts
// Repository managing append-only persistence of operational metrics.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

export interface WorkerMetric {
  workerName: string;
  partitionKey: string;
  eventId?: string;
  eventType: string;
  executionTimeMs: number;
  status: 'success' | 'failed';
  errorReason?: string;
}

export interface QueueMetric {
  partitionKey: string;
  oldestPendingAgeSec: number;
  pendingCount: number;
  failedCount: number;
  dlqCount: number;
}

export interface ReplayMetric {
  eventId: string;
  replayReason: string;
  triggeredBy: string;
  isDryRun: boolean;
  diffPayload?: any;
}

export interface ReconciliationMetric {
  jobName: string;
  ordersReconciled: number;
  cartsReclaimed: number;
  kitchenTicketsSynced: number;
  idempotencyKeysFreed: number;
  executionTimeMs: number;
}

export interface DlqMetric {
  eventId: string;
  eventType: string;
  retryAttempts: number;
  lastError: string;
  action: 'isolated' | 'replayed' | 'purged';
}

/**
 * Logs a single worker processing execution metric.
 */
export async function logWorkerExecution(metric: WorkerMetric): Promise<void> {
  const { error } = await supabaseAdmin.from('worker_metrics').insert({
    worker_name: metric.workerName,
    partition_key: metric.partitionKey,
    event_id: metric.eventId,
    event_type: metric.eventType,
    execution_time_ms: metric.executionTimeMs,
    status: metric.status,
    error_reason: metric.errorReason
  });

  if (error) {
    console.error(`[Metrics Repository] Failed to write worker execution log: ${error.message}`);
  }
}

/**
 * Logs queue health and lag state for a partition.
 */
export async function logQueueState(metric: QueueMetric): Promise<void> {
  const { error } = await supabaseAdmin.from('queue_metrics').insert({
    partition_key: metric.partitionKey,
    oldest_pending_age_sec: metric.oldestPendingAgeSec,
    pending_count: metric.pendingCount,
    failed_count: metric.failedCount,
    dlq_count: metric.dlqCount
  });

  if (error) {
    console.error(`[Metrics Repository] Failed to write queue state log: ${error.message}`);
  }
}

/**
 * Logs an event replay execution or simulation dry-run.
 */
export async function logReplayEvent(metric: ReplayMetric): Promise<void> {
  const { error } = await supabaseAdmin.from('replay_metrics').insert({
    event_id: metric.eventId,
    replay_reason: metric.replayReason,
    triggered_by: metric.triggeredBy,
    is_dry_run: metric.isDryRun,
    diff_payload: metric.diffPayload
  });

  if (error) {
    console.error(`[Metrics Repository] Failed to write replay audit log: ${error.message}`);
  }
}

/**
 * Logs transactional reconciliation background job results.
 */
export async function logReconciliationJob(metric: ReconciliationMetric): Promise<void> {
  const { error } = await supabaseAdmin.from('reconciliation_metrics').insert({
    job_name: metric.jobName,
    orders_reconciled: metric.ordersReconciled,
    carts_reclaimed: metric.cartsReclaimed,
    kitchen_tickets_synced: metric.kitchenTicketsSynced,
    idempotency_keys_freed: metric.idempotencyKeysFreed,
    execution_time_ms: metric.executionTimeMs
  });

  if (error) {
    console.error(`[Metrics Repository] Failed to write reconciliation job log: ${error.message}`);
  }
}

/**
 * Logs a dead letter event isolation, replay, or purge action.
 */
export async function logDlqAction(metric: DlqMetric): Promise<void> {
  const { error } = await supabaseAdmin.from('dlq_metrics').insert({
    event_id: metric.eventId,
    event_type: metric.eventType,
    retry_attempts: metric.retryAttempts,
    last_error: metric.lastError,
    action: metric.action
  });

  if (error) {
    console.error(`[Metrics Repository] Failed to write DLQ action log: ${error.message}`);
  }
}

/**
 * Triggers low-overhead metrics pruning.
 */
export async function pruneOldMetrics(daysToKeep: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc('prune_operational_metrics', {
    p_days_to_keep: daysToKeep
  });

  if (error) {
    throw new AppError(`Failed to prune metrics database records: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
}
