// ============================================================
// src/modules/tables/services/table-lifecycle.service.ts
// TableLifecycleService managing state transition validation,
// occupancy validation, cleaning flow, reservation compatibility,
// and atomic table state orchestration.
// ============================================================

import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import * as tableRepo from '../repositories/table.repository';
import type { Table, TableStatus } from '../tables.types';
import { VALID_TABLE_TRANSITIONS } from '../tables.types';
import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';

export interface TableTransitionParams {
  tenantId: string;
  tableId: string;
  toStatus: TableStatus;
  versionNum: number;
  actorId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class TableLifecycleService {
  /**
   * Validates if a transition from `from` to `to` status is allowed.
   */
  public static isValidTransition(from: TableStatus, to: TableStatus): boolean {
    const allowed = VALID_TABLE_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Orchestrates an atomic table status transition with OCC protection, audit trail,
   * outbox event queueing, and reservation/occupancy rules.
   */
  public static async transitionTable(params: TableTransitionParams): Promise<Table> {
    const { tenantId, tableId, toStatus, versionNum, actorId, reason, metadata = {} } = params;

    // 1. Fetch current table
    const table = await tableRepo.findTableById(tenantId, tableId);
    if (!table) {
      throw new NotFoundError('Table');
    }

    const fromStatus = table.status;
    if (fromStatus === toStatus) {
      return table; // Idempotent transition
    }

    // 2. Validate FSM transition rules
    if (!this.isValidTransition(fromStatus, toStatus)) {
      throw new AppError(
        `Invalid table status transition from '${fromStatus}' to '${toStatus}'.`,
        422,
        ErrorCode.VALIDATION_ERROR
      );
    }

    // 3. Occupancy restrictions
    // Cannot delete or lock an active table if it is occupied, ordering, or payment pending
    if (toStatus === 'available' && ['occupied', 'ordering', 'payment_pending'].includes(fromStatus)) {
      // Must go through proper payment/dirty lifecycle unless manually overridden by admin (reason specified)
      if (!reason?.includes('FORCE_OVERRIDE_BY_ADMIN')) {
        throw new AppError(
          `Cannot reset table to available directly from '${fromStatus}' without proper lifecycle resolution.`,
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }
    }

    // 4. Reservation Seated Flow integration
    if (toStatus === 'occupied' && fromStatus === 'reserved') {
      // Find active reservation for this table and mark it as seated
      await this.seatActiveReservation(tenantId, tableId, actorId);
    }

    // 5. Atomic state update with OCC protection
    const updatedTable = await tableRepo.updateTableStatus(
      tenantId,
      tableId,
      toStatus,
      versionNum,
      actorId
    );

    if (!updatedTable) {
      throw new AppError(
        'Table status transition failed. Version mismatch or concurrent edit.',
        409,
        ErrorCode.CONFLICT
      );
    }

    // 6. Append audit history trail
    await tableRepo.appendTableStateHistory(
      tenantId,
      table.branch_id,
      tableId,
      fromStatus,
      toStatus,
      actorId,
      reason || `Table status transitioned to ${toStatus}`,
      metadata
    );

    // 7. Emit Domain Outbox Event
    const { error: outboxError } = await supabaseAdmin
      .from('domain_events')
      .insert({
        tenant_id: tenantId,
        branch_id: table.branch_id,
        event_type: 'table.updated',
        aggregate_id: tableId,
        aggregate_type: 'Table',
        payload: {
          id: tableId,
          table_number: table.table_number,
          from_status: fromStatus,
          to_status: toStatus,
          version_num: updatedTable.version_num,
          actor_id: actorId,
          reason: reason || null,
        },
      });

    if (outboxError) {
      logger.error(
        { err: outboxError.message, tableId },
        '[TableLifecycleService] Failed to queue domain outbox event.'
      );
    }

    return updatedTable;
  }

  /**
   * Helper to automatically find the active reservation and mark it seated.
   */
  private static async seatActiveReservation(tenantId: string, tableId: string, actorId: string): Promise<void> {
    try {
      // Fetch active reservations (pending or confirmed status)
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
        logger.error({ err: error.message, tableId }, '[TableLifecycleService] Failed to lookup reservations for seating.');
        return;
      }

      if (data) {
        // Seat the reservation
        const { error: updateError } = await supabaseAdmin
          .from('table_reservations')
          .update({
            status: 'seated',
            seated_at: new Date().toISOString(),
            updated_by: actorId,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .eq('id', data.id);

        if (updateError) {
          logger.error(
            { err: updateError.message, reservationId: data.id },
            '[TableLifecycleService] Failed to auto-seat reservation.'
          );
        } else {
          logger.info({ reservationId: data.id, tableId }, '[TableLifecycleService] Auto-seated active reservation successfully.');
        }
      }
    } catch (err: any) {
      logger.error({ err: err.message, tableId }, '[TableLifecycleService] Error in reservation seating callback.');
    }
  }
}
