// ============================================================
// src/modules/kitchen/realtime-reconciliation.service.ts
// Realtime Reconciliation Service for reconnect recovery.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';
import { KitchenQueueProjectionService } from './kitchen-queue-projection.service';

export interface ReconciliationPayload {
  action: 'REPLAY_EVENTS' | 'SYNC_RESET';
  latestSequenceNumber: number;
  events?: Array<{
    sequenceNumber: number;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    payload: any;
    createdAt: string;
  }>;
  activeQueueSnapshot?: any[];
}

export class RealtimeReconciliationService {
  /**
   * Reconciles client KDS state after a websocket reconnect or detected gap.
   * If the client is behind by a small margin, replays events sequentially.
   * If the gap is too large, performs a complete state reload (SYNC_RESET).
   */
  public static async reconcileClientState(params: {
    tenantId: string;
    branchId: string;
    lastKnownSequence: number;
  }): Promise<ReconciliationPayload> {
    const { tenantId, branchId, lastKnownSequence } = params;

    try {
      // 1. Fetch latest registered sequence number for the branch
      const { data: latestEvent, error: latestErr } = await supabaseAdmin
        .from('branch_operational_events')
        .select('sequence_number')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .order('sequence_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr) {
        throw new Error(`Failed to check latest operational sequence: ${latestErr.message}`);
      }

      const latestSeq = latestEvent ? Number(latestEvent.sequence_number) : 0;

      // 2. Case: Client is already fully synchronized
      if (lastKnownSequence >= latestSeq) {
        return {
          action: 'REPLAY_EVENTS',
          latestSequenceNumber: latestSeq,
          events: [],
        };
      }

      const gapSize = latestSeq - lastKnownSequence;
      const MAX_REPLAY_LIMIT = 50; // Event threshold before forcing clean state sync

      // 3. Case: Gap is reasonable -> Replay missed events sequentially
      if (gapSize <= MAX_REPLAY_LIMIT && lastKnownSequence > 0) {
        logger.info(
          { branchId, lastKnownSequence, latestSeq, gapSize },
          '[RealtimeReconciliation] Recovering client via range event replay.'
        );

        const { data: events, error: eventsErr } = await supabaseAdmin
          .from('branch_operational_events')
          .select('sequence_number, event_type, aggregate_id, aggregate_type, payload, created_at')
          .eq('tenant_id', tenantId)
          .eq('branch_id', branchId)
          .gt('sequence_number', lastKnownSequence)
          .order('sequence_number', { ascending: true });

        if (eventsErr) throw eventsErr;

        const formattedEvents = (events ?? []).map((e) => ({
          sequenceNumber: Number(e.sequence_number),
          eventType: e.event_type,
          aggregateId: e.aggregate_id,
          aggregateType: e.aggregate_type,
          payload: e.payload,
          createdAt: e.created_at,
        }));

        return {
          action: 'REPLAY_EVENTS',
          latestSequenceNumber: latestSeq,
          events: formattedEvents,
        };
      }

      // 4. Case: Large gap or no known sequence -> Force full snapshot sync (self-heal)
      logger.warn(
        { branchId, lastKnownSequence, latestSeq, gapSize },
        '[RealtimeReconciliation] Large gap or cold-boot detected. Initiating SYNC_RESET.'
      );

      const activeQueueSnapshot = await KitchenQueueProjectionService.getActiveQueueProjections(
        tenantId,
        branchId
      );

      return {
        action: 'SYNC_RESET',
        latestSequenceNumber: latestSeq,
        activeQueueSnapshot,
      };
    } catch (err: any) {
      logger.error(
        { err: err.message, branchId, lastKnownSequence },
        '[RealtimeReconciliation] State reconciliation failed.'
      );
      throw err;
    }
  }

  /**
   * Diagnostic method to inspect sequence events for a branch
   */
  public static async queryOperationalEventLogs(
    tenantId: string,
    branchId: string,
    limit = 100
  ): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('branch_operational_events')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .order('sequence_number', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      logger.error({ err: err.message, branchId }, '[RealtimeReconciliation] Error listing event logs.');
      return [];
    }
  }
}
