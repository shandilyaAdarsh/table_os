// ============================================================
// src/modules/maintenance/lag-tracker.service.ts
// Service layer for tracking queue latency, oldest event ages,
// and DLQ backlog sizes across distinct partitions.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { logQueueState } from './metrics.repository';

export interface PartitionHealthReport {
  partitionKey: string;
  oldestPendingAgeSec: number;
  pendingCount: number;
  failedCount: number;
  dlqCount: number;
  alertLevel: 'GREEN' | 'YELLOW' | 'RED';
}

/**
 * Calculates current lag metrics for a specific queue partition.
 * Uses index-optimized searches.
 */
export async function getPartitionLag(partitionKey: string): Promise<PartitionHealthReport> {
  const now = new Date();

  // 1. Fetch count and oldest pending/failed event in this partition
  const { data: events, error: eventError } = await supabaseAdmin
    .from('domain_events')
    .select('occurred_at, delivery_status')
    .eq('partition_key', partitionKey)
    .in('delivery_status', ['pending', 'failed'])
    .lt('retry_count', 5)
    .order('occurred_at', { ascending: true });

  if (eventError) {
    throw new Error(`Failed to query partition event lag: ${eventError.message}`);
  }

  const pendingEvents = events?.filter(e => e.delivery_status === 'pending') ?? [];
  const failedEvents = events?.filter(e => e.delivery_status === 'failed') ?? [];

  const oldestEvent = events?.[0];
  let oldestAgeSec = 0;
  if (oldestEvent) {
    oldestAgeSec = Math.max(0, Math.floor((now.getTime() - new Date(oldestEvent.occurred_at).getTime()) / 1000));
  }

  // 2. Fetch isolated DLQ count for this partition
  const { count: dlqCount, error: dlqError } = await supabaseAdmin
    .from('dead_letter_events')
    .select('*', { count: 'exact', head: true })
    .eq('partition_key', partitionKey);

  const finalDlqCount = dlqError ? 0 : (dlqCount ?? 0);

  // 3. Resolve alarm limits
  let alertLevel: 'GREEN' | 'YELLOW' | 'RED' = 'GREEN';
  if (oldestAgeSec > 60 || events.length > 500) {
    alertLevel = 'RED';
  } else if (oldestAgeSec > 15 || events.length > 100) {
    alertLevel = 'YELLOW';
  }

  const report: PartitionHealthReport = {
    partitionKey,
    oldestPendingAgeSec: oldestAgeSec,
    pendingCount: pendingEvents.length,
    failedCount: failedEvents.length,
    dlqCount: finalDlqCount,
    alertLevel
  };

  // 4. Persist to historical metrics store asynchronously
  await logQueueState({
    partitionKey,
    oldestPendingAgeSec: oldestAgeSec,
    pendingCount: pendingEvents.length,
    failedCount: failedEvents.length,
    dlqCount: finalDlqCount
  });

  return report;
}

/**
 * Returns a quick scan of all active partitions and their backlog summaries.
 */
export async function scanAllPartitionsHealth(): Promise<PartitionHealthReport[]> {
  const { data, error } = await supabaseAdmin.rpc('get_active_outbox_partitions');

  if (error || !data) {
    return [];
  }

  const reports: PartitionHealthReport[] = [];
  for (const row of data) {
    try {
      const rep = await getPartitionLag(row.partition_key);
      reports.push(rep);
    } catch {
      // Fallback if a single partition query times out
      reports.push({
        partitionKey: row.partition_key,
        oldestPendingAgeSec: 0,
        pendingCount: Number(row.pending_count),
        failedCount: 0,
        dlqCount: 0,
        alertLevel: 'YELLOW'
      });
    }
  }

  return reports;
}
