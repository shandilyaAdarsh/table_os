import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface LedgerEventInput {
  tenant_id: string;
  branch_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_payload: Record<string, any>;
  emitted_by: string;
  causation_id?: string;
  correlation_id?: string;
}

export class EventLedgerService {
  /**
   * Appends an event authoritatively to the ledger.
   */
  static async appendEvent(input: LedgerEventInput): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('runtime_event_ledger')
        .insert({
          tenant_id: input.tenant_id,
          branch_id: input.branch_id,
          aggregate_type: input.aggregate_type,
          aggregate_id: input.aggregate_id,
          event_type: input.event_type,
          event_payload_json: input.event_payload,
          emitted_by: input.emitted_by,
          causation_id: input.causation_id || null,
          correlation_id: input.correlation_id || null,
        })
        .select()
        .single();

      if (error) throw error;
      logger.info({ eventId: data.id, type: input.event_type }, '[EventLedger] Appended event to ledger');
      return data;
    } catch (err: any) {
      logger.error({ err, input }, 'Failed to append event to authoritative ledger');
      throw new Error(`[EventLedgerService] appendEvent: ${err.message}`);
    }
  }

  /**
   * Queries events for replay.
   */
  static async getEventsForReplay(params: {
    tenantId: string;
    branchId?: string;
    fromSequence?: number;
    limit?: number;
  }): Promise<any[]> {
    let query = supabaseAdmin
      .from('runtime_event_ledger')
      .select('*')
      .eq('tenant_id', params.tenantId);

    if (params.branchId) {
      query = query.eq('branch_id', params.branchId);
    }

    if (params.fromSequence !== undefined) {
      query = query.gte('global_sequence', params.fromSequence);
    }

    query = query.order('global_sequence', { ascending: true }).limit(params.limit || 100);

    const { data, error } = await query;
    if (error) {
      logger.error({ error, params }, 'Failed to query replay events');
      throw new Error(`[EventLedgerService] getEventsForReplay: ${error.message}`);
    }
    return data || [];
  }
}
