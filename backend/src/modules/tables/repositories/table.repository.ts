// ============================================================
// src/modules/tables/repositories/table.repository.ts
// All DB access for table management. Uses supabaseAdmin (bypasses RLS).
// Business logic: none. Receives pre-validated payloads from service.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { Table, TableStateHistory, TableReservation } from '../tables.types';
import type {
  CreateTableDto,
  UpdateTableDto,
  TableListQuery,
  CreateReservationDto,
} from '../tables.dtos';

// ─── Tables ───────────────────────────────────────────────────

export async function findTableById(tenantId: string, tableId: string): Promise<Table | null> {
  const { data, error } = await supabaseAdmin
    .from('tables')
    .select('*, table_runtime_projections(runtime_state)')
    .eq('tenant_id', tenantId)
    .eq('id', tableId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, tenantId, tableId }, 'findTableById failed');
    throw new Error(`[TableRepo] findTableById: ${error.message}`);
  }
  if (!data) return null;
  return {
    ...data,
    runtime_state: (data as any).table_runtime_projections?.runtime_state ?? 'FREE',
  } as any;
}

export async function findTableByNumber(
  tenantId: string,
  branchId: string,
  tableNumber: string,
): Promise<Table | null> {
  const { data, error } = await supabaseAdmin
    .from('tables')
    .select('*, table_runtime_projections(runtime_state)')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('table_number', tableNumber)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[TableRepo] findTableByNumber: ${error.message}`);
  if (!data) return null;
  return {
    ...data,
    runtime_state: (data as any).table_runtime_projections?.runtime_state ?? 'FREE',
  } as any;
}

export async function listTables(
  tenantId: string,
  query: TableListQuery,
): Promise<{ data: Table[]; total: number }> {
  let q = supabaseAdmin
    .from('tables')
    .select('*, table_runtime_projections(runtime_state)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (query.branch_id) q = q.eq('branch_id', query.branch_id);
  if (query.floor_id)   q = q.eq('floor_id', query.floor_id);
  if (query.section_id) q = q.eq('section_id', query.section_id);
  if (query.is_active !== undefined) q = q.eq('is_active', query.is_active);

  const page  = query.page  ?? 1;
  const limit = query.limit ?? 50;
  const from  = (page - 1) * limit;

  q = q.order('table_number', { ascending: true }).range(from, from + limit - 1);

  const { data, error, count } = await q;
  if (error) {
    logger.error({ err: error, tenantId, query }, 'listTables failed');
    throw new Error(`[TableRepo] listTables: ${error.message}`);
  }
  const mapped = (data ?? []).map(t => ({
    ...t,
    runtime_state: (t as any).table_runtime_projections?.runtime_state ?? 'FREE',
  }));
  return { data: mapped as any, total: count ?? 0 };
}

export async function createTable(
  tenantId: string,
  dto: CreateTableDto,
  createdBy: string,
): Promise<Table> {
  const { data, error } = await supabaseAdmin
    .from('tables')
    .insert({
      tenant_id:    tenantId,
      branch_id:    dto.branch_id,
      table_number: dto.table_number,
      display_name: dto.display_name ?? null,
      capacity:     dto.capacity,
      floor_id:     (dto as any).floor_id ?? null,
      section_id:   (dto as any).section_id ?? null,
      sort_order:   (dto as any).sort_order ?? 0,
      notes:        (dto as any).notes ?? null,
      created_by:   createdBy,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, tenantId, dto }, 'createTable failed');
    throw new Error(`[TableRepo] createTable: ${error.message}`);
  }
  return data;
}

export async function updateTable(
  tenantId: string,
  tableId: string,
  dto: UpdateTableDto,
  updatedBy: string,
): Promise<Table | null> {
  const { version_num, ...updateFields } = dto;

  const { data, error } = await supabaseAdmin
    .from('tables')
    .update({ ...updateFields, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', tableId)
    .eq('version_num', version_num)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) throw new Error(`[TableRepo] updateTable: ${error.message}`);
  return data;
}

// updateTableStatus is removed — runtime state is a derived projection, not a mutable column.

// assignQrCodeToTable is superseded by table_qr_tokens — removed.

export async function softDeleteTable(
  tenantId: string,
  tableId: string,
  deletedBy: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tables')
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: deletedBy })
    .eq('tenant_id', tenantId)
    .eq('id', tableId)
    .is('deleted_at', null);

  if (error) throw new Error(`[TableRepo] softDeleteTable: ${error.message}`);
}

// ─── Table State History ──────────────────────────────────────

export async function appendTableStateHistory(
  tenantId: string,
  branchId: string,
  tableId: string,
  changedBy: string | null,
  reason?: string,
  metadata: Record<string, unknown> = {},
): Promise<TableStateHistory> {
  const { data, error } = await supabaseAdmin
    .from('table_state_history')
    .insert({
      tenant_id:  tenantId,
      branch_id:  branchId,
      table_id:   tableId,
      changed_by: changedBy,
      reason:     reason ?? null,
      metadata,
    })
    .select()
    .single();

  if (error) throw new Error(`[TableRepo] appendTableStateHistory: ${error.message}`);
  return data;
}

export async function getTableStateHistory(
  tenantId: string,
  tableId: string,
  limit = 50,
): Promise<TableStateHistory[]> {
  const { data, error } = await supabaseAdmin
    .from('table_state_history')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('table_id', tableId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`[TableRepo] getTableStateHistory: ${error.message}`);
  return data ?? [];
}

// ─── Reservations ─────────────────────────────────────────────

export async function findReservationById(
  tenantId: string,
  reservationId: string,
): Promise<TableReservation | null> {
  const { data, error } = await supabaseAdmin
    .from('table_reservations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', reservationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[TableRepo] findReservationById: ${error.message}`);
  return data;
}

export async function listReservationsForTable(
  tenantId: string,
  tableId: string,
): Promise<TableReservation[]> {
  const { data, error } = await supabaseAdmin
    .from('table_reservations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('table_id', tableId)
    .is('deleted_at', null)
    .order('reserved_at', { ascending: true });

  if (error) throw new Error(`[TableRepo] listReservationsForTable: ${error.message}`);
  return data ?? [];
}

export async function createReservation(
  tenantId: string,
  dto: CreateReservationDto,
  createdBy: string,
): Promise<TableReservation> {
  const { data, error } = await supabaseAdmin
    .from('table_reservations')
    .insert({
      tenant_id:      tenantId,
      branch_id:      dto.branch_id,
      table_id:       dto.table_id,
      customer_name:  dto.customer_name,
      customer_phone: dto.customer_phone ?? null,
      party_size:     dto.party_size,
      reserved_at:    dto.reserved_at,
      notes:          dto.notes ?? null,
      created_by:     createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`[TableRepo] createReservation: ${error.message}`);
  return data;
}

export async function updateReservationStatus(
  tenantId: string,
  reservationId: string,
  status: string,
  versionNum: number,
  updatedBy: string,
  extra: Record<string, unknown> = {},
): Promise<TableReservation | null> {
  const { data, error } = await supabaseAdmin
    .from('table_reservations')
    .update({ status, updated_by: updatedBy, updated_at: new Date().toISOString(), ...extra })
    .eq('tenant_id', tenantId)
    .eq('id', reservationId)
    .eq('version_num', versionNum)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) throw new Error(`[TableRepo] updateReservationStatus: ${error.message}`);
  return data;
}
