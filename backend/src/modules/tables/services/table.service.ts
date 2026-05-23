// ============================================================
// src/modules/tables/services/table.service.ts
// Business logic for table lifecycle management.
// All semantic validation lives here — repositories trust this layer.
// ============================================================

import { AppError } from '../../../shared/errors/AppError';
import * as tableRepo from '../repositories/table.repository';
import type {
  CreateTableDto,
  UpdateTableDto,
  TransitionTableStatusDto,
  TableListQuery,
  CreateReservationDto,
  UpdateReservationDto,
} from '../tables.dtos';
import type { Table, TableReservation } from '../tables.types';
import { VALID_TABLE_TRANSITIONS } from '../tables.types';

// ─── Tables ───────────────────────────────────────────────────

export async function listTables(
  tenantId: string,
  query: TableListQuery,
): Promise<{ data: Table[]; total: number; page: number; limit: number }> {
  const page  = query.page  ?? 1;
  const limit = query.limit ?? 50;
  const result = await tableRepo.listTables(tenantId, query);
  return { ...result, page, limit };
}

export async function getTableById(tenantId: string, tableId: string): Promise<Table> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  return table;
}

export async function createTable(
  tenantId: string,
  dto: CreateTableDto,
  actorId: string,
): Promise<Table> {
  // Guard: unique table_number per branch
  const existing = await tableRepo.findTableByNumber(tenantId, dto.branch_id, dto.table_number);
  if (existing) {
    throw new AppError(
      `Table number '${dto.table_number}' already exists in this branch.`,
      409,
      'CONFLICT',
    );
  }

  const table = await tableRepo.createTable(tenantId, dto, actorId);

  // Audit: initial state history entry
  await tableRepo.appendTableStateHistory(
    tenantId,
    table.branch_id,
    table.id,
    null,
    'available',
    actorId,
    'Table created',
  );

  return table;
}

export async function updateTable(
  tenantId: string,
  tableId: string,
  dto: UpdateTableDto,
  actorId: string,
): Promise<Table> {
  const existing = await tableRepo.findTableById(tenantId, tableId);
  if (!existing) throw new AppError('Table not found', 404, 'NOT_FOUND');

  // Check table_number uniqueness if changing it
  if (dto.table_number && dto.table_number !== existing.table_number) {
    const conflict = await tableRepo.findTableByNumber(
      tenantId,
      existing.branch_id,
      dto.table_number,
    );
    if (conflict && conflict.id !== tableId) {
      throw new AppError(
        `Table number '${dto.table_number}' already exists in this branch.`,
        409,
        'CONFLICT',
      );
    }
  }

  const updated = await tableRepo.updateTable(tenantId, tableId, dto, actorId);
  if (!updated) throw new AppError('Table was modified by another request. Reload and retry.', 409, 'CONFLICT');
  return updated;
}

export async function transitionTableStatus(
  tenantId: string,
  tableId: string,
  dto: TransitionTableStatusDto,
  actorId: string,
): Promise<Table> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');

  // State machine validation (commerce_architecture_freeze.md §11)
  const validNext = VALID_TABLE_TRANSITIONS[table.status];
  if (!validNext.includes(dto.status)) {
    throw new AppError(
      `Invalid status transition: '${table.status}' → '${dto.status}'. Allowed: ${validNext.join(', ')}`,
      422,
      'BAD_REQUEST',
    );
  }

  const updated = await tableRepo.updateTableStatus(
    tenantId,
    tableId,
    dto.status,
    dto.version_num,
    actorId,
  );
  if (!updated) throw new AppError('Table was modified by another request. Reload and retry.', 409, 'CONFLICT');

  // Audit trail: every transition is recorded
  await tableRepo.appendTableStateHistory(
    tenantId,
    table.branch_id,
    tableId,
    table.status,
    dto.status,
    actorId,
    dto.reason,
  );

  return updated;
}

export async function deleteTable(
  tenantId: string,
  tableId: string,
  actorId: string,
): Promise<void> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');

  // Cannot delete an occupied/active table
  if (['occupied', 'ordering', 'payment_pending'].includes(table.status)) {
    throw new AppError(
      `Cannot delete a table with status '${table.status}'.`,
      422,
      'BAD_REQUEST',
    );
  }

  await tableRepo.softDeleteTable(tenantId, tableId, actorId);
}

export async function getTableHistory(tenantId: string, tableId: string) {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  return tableRepo.getTableStateHistory(tenantId, tableId);
}

// ─── Reservations ─────────────────────────────────────────────

export async function createReservation(
  tenantId: string,
  dto: CreateReservationDto,
  actorId: string,
): Promise<TableReservation> {
  // Validate that the table belongs to the tenant
  const table = await tableRepo.findTableById(tenantId, dto.table_id);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  if (table.branch_id !== dto.branch_id) {
    throw new AppError('Table does not belong to the specified branch.', 403, 'FORBIDDEN');
  }

  return tableRepo.createReservation(tenantId, dto, actorId);
}

export async function updateReservation(
  tenantId: string,
  reservationId: string,
  dto: UpdateReservationDto,
  actorId: string,
): Promise<TableReservation> {
  const existing = await tableRepo.findReservationById(tenantId, reservationId);
  if (!existing) throw new AppError('Reservation not found', 404, 'NOT_FOUND');

  const extra: Record<string, unknown> = {};
  if (dto.status === 'cancelled') {
    extra['cancelled_at'] = new Date().toISOString();
    extra['cancellation_reason'] = dto.cancellation_reason ?? null;
  }
  if (dto.status === 'seated') {
    extra['seated_at'] = new Date().toISOString();
  }

  const updated = await tableRepo.updateReservationStatus(
    tenantId,
    reservationId,
    dto.status,
    dto.version_num,
    actorId,
    extra,
  );
  if (!updated) throw new AppError('Reservation was modified by another request. Reload and retry.', 409, 'CONFLICT');
  return updated;
}

export async function getReservationsForTable(
  tenantId: string,
  tableId: string,
): Promise<TableReservation[]> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  return tableRepo.listReservationsForTable(tenantId, tableId);
}
