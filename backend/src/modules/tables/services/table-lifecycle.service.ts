// ============================================================
// src/modules/tables/services/table-lifecycle.service.ts
// Table operational event coordinator.
// NOTE: As of the Table Infrastructure Rework, table status is NO LONGER a
// mutable column. Runtime state is derived from operational projections.
// This service now coordinates domain event emission for table operational
// events (guest arrived, session closed, etc.) that drive projection rebuilds.
// ============================================================

import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import * as tableRepo from '../repositories/table.repository';
import type { Table } from '../tables.types';
import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import { rebuildTableProjection } from '../projections/table-runtime.projection';

export interface TableEventParams {
  tenantId: string;
  tableId: string;
  eventType: 'TABLE_GUEST_ARRIVED' | 'TABLE_SESSION_CLOSED' | 'TABLE_CLEANED' | 'TABLE_FORCE_RESET';
  actorId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class TableLifecycleService {

  /**
   * Emits a table operational domain event and rebuilds the runtime projection.
   * All state inference happens through the projection — no mutable status column.
   */
  public static async emitTableEvent(params: TableEventParams): Promise<Table> {
    const { tenantId, tableId, eventType, actorId, reason, metadata = {} } = params;

    // 1. Verify table exists and is active
    const table = await tableRepo.findTableById(tenantId, tableId);
    if (!table) {
      throw new NotFoundError('Table');
    }

    if (!table.is_active || table.deleted_at !== null) {
      throw new AppError(
        `Cannot emit events on an inactive or deleted table.`,
        422,
        ErrorCode.VALIDATION_ERROR
      );
    }

    // 2. Append audit history entry (status-free, event-driven)
    await tableRepo.appendTableStateHistory(
      tenantId,
      table.branch_id,
      tableId,
      actorId,
      reason || `Event: ${eventType}`,
      metadata
    );

    // 3. Emit domain event to outbox
    const { error: outboxError } = await supabaseAdmin
      .from('domain_events')
      .insert({
        tenant_id:      tenantId,
        branch_id:      table.branch_id,
        event_type:     `table.${eventType.toLowerCase()}`,
        aggregate_id:   tableId,
        aggregate_type: 'Table',
        payload: {
          id:         tableId,
          table_number: table.table_number,
          event_type: eventType,
          actor_id:   actorId,
          reason:     reason || null,
          metadata,
        },
      });

    if (outboxError) {
      logger.error(
        { err: outboxError.message, tableId },
        '[TableLifecycleService] Failed to queue domain outbox event.'
      );
    }

    // 4. Trigger projection rebuild so runtime state reflects current reality
    try {
      await rebuildTableProjection(supabaseAdmin, tenantId, tableId);
    } catch (projErr: any) {
      logger.error(
        { err: projErr.message, tableId },
        '[TableLifecycleService] Projection rebuild failed after table event — will self-heal on next event.'
      );
    }

    return table;
  }

  /**
   * Helper: auto-seat the active reservation when a guest arrives.
   */
  public static async seatActiveReservation(tenantId: string, tableId: string, actorId: string): Promise<void> {
    try {
      const { data, error } = await supabaseAdmin
        .from('table_reservations')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('table_id', tableId)
        .in('status', ['pending', 'confirmed'])
        .is('deleted_at', null)
        .order('reserved_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error({ err: error.message, tableId }, '[TableLifecycleService] Failed to lookup reservations.');
        return;
      }

      if (data) {
        await supabaseAdmin
          .from('table_reservations')
          .update({ status: 'seated', seated_at: new Date().toISOString(), updated_by: actorId, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .eq('id', data.id);
        logger.info({ reservationId: data.id, tableId }, '[TableLifecycleService] Auto-seated reservation.');
      }
    } catch (err: any) {
      logger.error({ err: err.message, tableId }, '[TableLifecycleService] Error in reservation seating.');
    }
  }
}
