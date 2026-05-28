// ============================================================
// src/modules/tables/services/table.service.ts
// Business logic for table lifecycle management.
// All semantic validation lives here — repositories trust this layer.
// ============================================================

import { AppError } from '../../../shared/errors/AppError';
import * as tableRepo from '../repositories/table.repository';
import * as floorRepo from '../repositories/table-floor.repository';
import * as sectionRepo from '../repositories/table-section.repository';
import type {
  CreateFloorInput,
  UpdateFloorInput,
  CreateSectionInput,
  UpdateSectionInput,
  CreateTableInput,
  UpdateTableInput,
  TableListQueryInput,
  CreateReservationInput,
  UpdateReservationInput,
} from '../tables.validators';
import type { Table, TableFloor, TableSection, TableReservation } from '../tables.types';

// ─── Floors ───────────────────────────────────────────────────

export async function listFloors(tenantId: string, branchId?: string): Promise<TableFloor[]> {
  return floorRepo.listFloors(tenantId, branchId);
}

export async function createFloor(
  tenantId: string,
  dto: CreateFloorInput,
  actorId: string,
): Promise<TableFloor> {
  return floorRepo.createFloor(tenantId, dto, actorId);
}

export async function updateFloor(
  tenantId: string,
  floorId: string,
  dto: UpdateFloorInput,
  actorId: string,
): Promise<TableFloor> {
  const existing = await floorRepo.findFloorById(tenantId, floorId);
  if (!existing) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  const updated = await floorRepo.updateFloor(tenantId, floorId, dto, actorId);
  if (!updated) throw new AppError('Floor was modified by another request. Reload and retry.', 409, 'CONFLICT');
  return updated;
}

export async function deleteFloor(tenantId: string, floorId: string, _actorId: string): Promise<void> {
  const existing = await floorRepo.findFloorById(tenantId, floorId);
  if (!existing) throw new AppError('Floor not found', 404, 'NOT_FOUND');
  await floorRepo.softDeleteFloor(tenantId, floorId);
}

// ─── Sections ─────────────────────────────────────────────────

export async function listSections(tenantId: string, branchId?: string): Promise<TableSection[]> {
  return sectionRepo.listSections(tenantId, branchId);
}

export async function createSection(
  tenantId: string,
  dto: CreateSectionInput,
  actorId: string,
): Promise<TableSection> {
  return sectionRepo.createSection(tenantId, dto, actorId);
}

export async function updateSection(
  tenantId: string,
  sectionId: string,
  dto: UpdateSectionInput,
  actorId: string,
): Promise<TableSection> {
  const existing = await sectionRepo.findSectionById(tenantId, sectionId);
  if (!existing) throw new AppError('Section not found', 404, 'NOT_FOUND');
  const updated = await sectionRepo.updateSection(tenantId, sectionId, dto, actorId);
  if (!updated) throw new AppError('Section was modified by another request. Reload and retry.', 409, 'CONFLICT');
  return updated;
}

export async function deleteSection(tenantId: string, sectionId: string, _actorId: string): Promise<void> {
  const existing = await sectionRepo.findSectionById(tenantId, sectionId);
  if (!existing) throw new AppError('Section not found', 404, 'NOT_FOUND');
  await sectionRepo.softDeleteSection(tenantId, sectionId);
}

// ─── Tables ───────────────────────────────────────────────────

export async function listTables(
  tenantId: string,
  query: TableListQueryInput,
): Promise<{ data: Table[]; total: number; page: number; limit: number }> {
  const page  = query.page  ?? 1;
  const limit = query.limit ?? 50;
  const result = await tableRepo.listTables(tenantId, query as any);
  return { ...result, page, limit };
}

export async function getTableById(tenantId: string, tableId: string): Promise<Table> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  return table;
}

export async function createTable(
  tenantId: string,
  dto: CreateTableInput,
  actorId: string,
): Promise<Table> {
  const existing = await tableRepo.findTableByNumber(tenantId, dto.branch_id, dto.table_number);
  if (existing) {
    throw new AppError(
      `Table number '${dto.table_number}' already exists in this branch.`,
      409,
      'CONFLICT',
    );
  }

  const table = await tableRepo.createTable(tenantId, dto as any, actorId);
  return table;
}

export async function updateTable(
  tenantId: string,
  tableId: string,
  dto: UpdateTableInput,
  actorId: string,
): Promise<Table> {
  const existing = await tableRepo.findTableById(tenantId, tableId);
  if (!existing) throw new AppError('Table not found', 404, 'NOT_FOUND');

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

  const updated = await tableRepo.updateTable(tenantId, tableId, dto as any, actorId);
  if (!updated) throw new AppError('Table was modified by another request. Reload and retry.', 409, 'CONFLICT');
  return updated;
}

export async function deleteTable(
  tenantId: string,
  tableId: string,
  actorId: string,
): Promise<void> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  
  // Note: Since status is now a projection, we would typically check the projection
  // to ensure active_guest_count == 0 and active_order_count == 0 before deletion.
  // For now, we perform soft delete.
  await tableRepo.softDeleteTable(tenantId, tableId, actorId);
}

export async function getTableHistory(tenantId: string, tableId: string) {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  return tableRepo.getTableStateHistory(tenantId, tableId);
}

export async function rotateQrToken(tenantId: string, tableId: string, actorId: string): Promise<string> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  
  const token = await tableRepo.rotateTableQrToken(tenantId, tableId);
  
  await tableRepo.appendTableStateHistory(tenantId, table.branch_id, tableId, actorId, 'Rotated QR Token');
  return token;
}

export async function getQrToken(tenantId: string, tableId: string): Promise<string | null> {
  const table = await tableRepo.findTableById(tenantId, tableId);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  
  return tableRepo.getActiveQrToken(tenantId, tableId);
}

// ─── Reservations ─────────────────────────────────────────────

export async function createReservation(
  tenantId: string,
  dto: CreateReservationInput,
  actorId: string,
): Promise<TableReservation> {
  const table = await tableRepo.findTableById(tenantId, dto.table_id);
  if (!table) throw new AppError('Table not found', 404, 'NOT_FOUND');
  if (table.branch_id !== dto.branch_id) {
    throw new AppError('Table does not belong to the specified branch.', 403, 'FORBIDDEN');
  }

  return tableRepo.createReservation(tenantId, dto as any, actorId);
}

export async function updateReservation(
  tenantId: string,
  reservationId: string,
  dto: UpdateReservationInput,
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
