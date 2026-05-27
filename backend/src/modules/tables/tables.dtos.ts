// ============================================================
// src/modules/tables/tables.dtos.ts
// Data Transfer Objects for table management.
// ============================================================

import type { Table, TableReservation, TableStateHistory, ReservationStatus, TableRuntimeState } from './tables.types';

// ─── Input DTOs (kept for repo-layer backward compatibility) ───

export interface CreateTableDto {
  branch_id: string;
  table_number: string;
  display_name?: string;
  capacity: number;
  floor_id?: string;
  section_id?: string;
  sort_order?: number;
  notes?: string;
}

export interface UpdateTableDto {
  table_number?: string;
  display_name?: string;
  capacity?: number;
  floor_id?: string | null;
  section_id?: string | null;
  sort_order?: number;
  notes?: string;
  assigned_waiter_id?: string | null;
  version_num: number;
}

export interface CreateReservationDto {
  branch_id: string;
  table_id: string;
  customer_name: string;
  customer_phone?: string;
  party_size: number;
  reserved_at: string;  // ISO 8601
  notes?: string;
}

export interface UpdateReservationDto {
  status: ReservationStatus;
  cancellation_reason?: string;
  version_num: number;
}

export interface TableListQuery {
  branch_id?: string;
  floor_id?: string;
  section_id?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

// ─── Public Output DTOs ───────────────────────────────────────

export interface TablePublicDto extends Omit<Table, 'deleted_at'> {
  runtime_state?: TableRuntimeState;
}

export interface TableDetailDto extends TablePublicDto {
  current_history?: TableStateHistory | null;
}

export interface TableListResponseDto {
  data: TablePublicDto[];
  total: number;
  page: number;
  limit: number;
}

export type ReservationPublicDto = Omit<TableReservation, 'deleted_at'>;
