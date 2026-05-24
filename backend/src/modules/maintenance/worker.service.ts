// ============================================================
// src/modules/maintenance/worker.service.ts
// Secure, high-concurrency worker engine implementing:
// - Dynamic partition starvation-free claiming
// - Low-overhead metrics logging
// - Circuit breaker external integrations
// - Replay capabilities & DLQ lifecycle
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { logWorkerExecution, logDlqAction } from './metrics.repository';
import { workerLogger } from './observability.logger';
import { getCircuitBreaker } from './circuit-breaker.service';

export interface DispatchEvent {
  id: string;
  tenant_id: string;
  partition_key: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: any;
  retry_count: number;
}

/**
 * Register or update the heartbeat for a running worker instance.
 */
export async function sendHeartbeat(workerName: string): Promise<void> {
  const now = new Date().toISOString();
  
  const { error } = await supabaseAdmin
    .from('worker_heartbeats')
    .upsert({
      worker_name: workerName,
      last_heartbeat_at: now,
      status: 'active'
    }, {
      onConflict: 'worker_name'
    });

  if (error) {
    workerLogger.error(`Heartbeat registration failed`, error, { workerName });
  } else {
    workerLogger.info(`Heartbeat registered successfully`, { workerName });
  }
}

/**
 * Starvation-free, partition-aware outbox claims using O(log N) indexed queries.
 */
export async function claimNextEvent(workerName: string, partitionKey?: string): Promise<DispatchEvent | null> {
  const lockDurationMinutes = 5;
  let targetPartition = partitionKey;

  // 1. If no specific partition targeted, poll active queues (prevents starvation)
  if (!targetPartition) {
    const { data: partitions, error: partError } = await supabaseAdmin.rpc('get_active_outbox_partitions');
    if (partError) {
      workerLogger.error(`Failed to retrieve active queue partitions`, partError);
      return null;
    }
    if (partitions && partitions.length > 0) {
      targetPartition = partitions[0].partition_key;
    }
  }

  if (!targetPartition) {
    return null;
  }

  // 2. Fetch single locked outbox item inside the target partition
  const { data, error } = await supabaseAdmin.rpc('claim_next_outbox_event', {
    p_worker_name: workerName,
    p_lock_duration_sec: lockDurationMinutes * 60,
    p_partition_key: targetPartition
  });

  if (error) {
    throw new AppError(`Failed to claim outbox event: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const claimed = data[0];
  workerLogger.info(`Successfully claimed outbox event`, {
    workerName,
    eventId: claimed.id,
    partitionKey: targetPartition,
    eventType: claimed.event_type
  });

  return {
    id: claimed.id,
    tenant_id: claimed.tenant_id,
    partition_key: claimed.partition_key,
    aggregate_type: claimed.aggregate_type,
    aggregate_id: claimed.aggregate_id,
    event_type: claimed.event_type,
    payload: claimed.payload,
    retry_count: claimed.retry_count
  };
}

/**
 * Handles processing success for a claimed event.
 */
export async function markEventDelivered(eventId: string, durationMs: number): Promise<void> {
  const { data: event, error: fetchError } = await supabaseAdmin
    .from('domain_events')
    .select('partition_key, event_type')
    .eq('id', eventId)
    .single();

  const { error } = await supabaseAdmin
    .from('domain_events')
    .update({
      delivery_status: 'delivered',
      locked_by: null,
      locked_until: null,
      error_reason: null
    })
    .eq('id', eventId);

  if (error) {
    throw new AppError(`Failed to complete event delivery: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  // Log to metrics
  if (event && !fetchError) {
    await logWorkerExecution({
      workerName: 'DefaultWorker',
      partitionKey: event.partition_key,
      eventId,
      eventType: event.event_type,
      executionTimeMs: durationMs,
      status: 'success'
    });
  }

  workerLogger.info(`Successfully delivered outbox event`, { eventId, durationMs });
}

/**
 * Handles processing failure, logs failed attempt, manages retries and isolates poison events.
 */
export async function markEventFailed(eventId: string, errorReason: string, durationMs: number): Promise<void> {
  const { data: event, error: fetchError } = await supabaseAdmin
    .from('domain_events')
    .select('retry_count, tenant_id, partition_key, aggregate_type, aggregate_id, event_type, payload')
    .eq('id', eventId)
    .single();

  if (fetchError || !event) {
    throw new AppError(`Event fetch failed during error handler: ${fetchError?.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  const nextRetryCount = event.retry_count + 1;
  const maxRetries = 5;

  if (nextRetryCount >= maxRetries) {
    // ─── POISON EVENT: ISOLATE TO DEAD-LETTER QUEUE (DLQ) ───
    workerLogger.warn(`Event exhausted retry limits. Isolating to dead-letter queue (DLQ).`, { eventId });

    const { error: dlqError } = await supabaseAdmin
      .from('dead_letter_events')
      .insert({
        event_id: eventId,
        tenant_id: event.tenant_id,
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        event_type: event.event_type,
        payload: event.payload,
        reason: `Exhausted ${maxRetries} retries. Last error: ${errorReason}`
      });

    if (dlqError) {
      workerLogger.error(`Critical: Failed to isolate poison event to dead-letter queue table`, dlqError, { eventId });
    }

    // Update status to 'dead_letter'
    await supabaseAdmin
      .from('domain_events')
      .update({
        delivery_status: 'dead_letter',
        retry_count: nextRetryCount,
        locked_by: null,
        locked_until: null,
        error_reason: `Dead Letter: ${errorReason}`
      })
      .eq('id', eventId);

    // Audit action in DLQ metric log
    await logDlqAction({
      eventId,
      eventType: event.event_type,
      retryAttempts: nextRetryCount,
      lastError: errorReason,
      action: 'isolated'
    });

  } else {
    // Increment retry count and release lock for exponential retry fallback
    await supabaseAdmin
      .from('domain_events')
      .update({
        delivery_status: 'failed',
        retry_count: nextRetryCount,
        locked_by: null,
        locked_until: new Date(Date.now() + Math.pow(2, nextRetryCount) * 1000).toISOString(), // exponential backoff seconds
        error_reason: errorReason
      })
      .eq('id', eventId);
  }

  // Log failed attempt audit
  await supabaseAdmin
    .from('failed_dispatch_attempts')
    .insert({
      event_id: eventId,
      attempt_num: nextRetryCount,
      error_message: errorReason
    });

  // Log metrics write
  await logWorkerExecution({
    workerName: 'DefaultWorker',
    partitionKey: event.partition_key,
    eventId,
    eventType: event.event_type,
    executionTimeMs: durationMs,
    status: 'failed',
    errorReason: errorReason
  });
}

/**
 * Worker Crash Recovery: Reclaims locked tasks that are abandoned or have timed out.
 */
export async function reclaimAbandonedLocks(): Promise<number> {
  const now = new Date().toISOString();

  // Find processing events that have exceeded their lock time
  const { data: abandonedEvents, error: fetchError } = await supabaseAdmin
    .from('domain_events')
    .select('id, retry_count')
    .eq('delivery_status', 'processing')
    .lt('locked_until', now);

  if (fetchError || !abandonedEvents) {
    return 0;
  }

  let reclaimedCount = 0;
  for (const item of abandonedEvents) {
    const { error: reclaimError } = await supabaseAdmin
      .from('domain_events')
      .update({
        delivery_status: 'failed',
        retry_count: item.retry_count + 1,
        locked_by: null,
        locked_until: new Date(Date.now() + 5000).toISOString(), // try again in 5 seconds
        error_reason: 'Lock abandoned or worker crashed'
      })
      .eq('id', item.id);

    if (!reclaimError) {
      reclaimedCount++;
    }
  }

  if (reclaimedCount > 0) {
    workerLogger.warn(`Reclaimed abandoned lock events`, { count: reclaimedCount });
  }

  return reclaimedCount;
}

/**
 * Repair Tooling: Admin tool to retry an event from the Dead Letter Queue
 */
export async function repairDeadLetterEvent(eventId: string, tenantId: string): Promise<boolean> {
  // Verify existence
  const { data: dlq, error: fetchError } = await supabaseAdmin
    .from('dead_letter_events')
    .select('id, event_type, retry_count')
    .eq('event_id', eventId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchError || !dlq) {
    throw new AppError(`Dead-letter event not found: ${fetchError?.message}`, 404, ErrorCode.NOT_FOUND);
  }

  // Reset retry counter and update status back to pending
  const { error: resetError } = await supabaseAdmin
    .from('domain_events')
    .update({
      delivery_status: 'pending',
      retry_count: 0,
      locked_by: null,
      locked_until: null,
      error_reason: null
    })
    .eq('id', eventId)
    .eq('tenant_id', tenantId);

  if (resetError) {
    throw new AppError(`Failed to reclaim event: ${resetError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  // Clean up DLQ record
  await supabaseAdmin
    .from('dead_letter_events')
    .delete()
    .eq('event_id', eventId)
    .eq('tenant_id', tenantId);

  // Log DLQ metrics replay
  await logDlqAction({
    eventId,
    eventType: dlq.event_type,
    retryAttempts: dlq.retry_count,
    lastError: 'Admin replay trigger',
    action: 'replayed'
  });

  workerLogger.info(`Successfully replayed dead-letter event`, { eventId, tenantId });
  return true;
}

/**
 * Protected external dispatch worker using Circuit Breaker infrastructure
 */
export async function dispatchWithCircuitProtection(breakerName: string, eventId: string, dispatchFn: () => Promise<void>): Promise<void> {
  const breaker = getCircuitBreaker(breakerName);
  const start = Date.now();

  try {
    await breaker.execute(dispatchFn);
    await markEventDelivered(eventId, Date.now() - start);
  } catch (err: any) {
    await markEventFailed(eventId, err.message, Date.now() - start);
    throw err;
  }
}
