// ============================================================
// src/modules/tables/tables.types.ts
// TypeScript interfaces matching the DB schema for table management.
// ============================================================

export type TableStatus =
  | 'available'
  | 'reserved'
  | 'occupied'
  | 'ordering'
  | 'payment_pending'
  | 'dirty';

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'cancelled'
  | 'no_show';

export interface Table {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_number: string;
  display_name: string | null;
  capacity: number;
  status: TableStatus;
  qr_code_id: string | null;
  assigned_waiter_id: string | null;
  notes: string | null;
  is_active: boolean;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TableStateHistory {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  from_status: TableStatus | null;
  to_status: TableStatus;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

export interface TableReservation {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  customer_name: string;
  customer_phone: string | null;
  party_size: number;
  reserved_at: string;
  notes: string | null;
  status: ReservationStatus;
  confirmed_by: string | null;
  seated_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Valid state machine transitions (commerce_architecture_freeze.md §11)
export const VALID_TABLE_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  available:       ['occupied', 'reserved'],
  reserved:        ['occupied', 'available'],
  occupied:        ['ordering', 'available'],
  ordering:        ['payment_pending', 'occupied'],
  payment_pending: ['dirty', 'occupied'],
  dirty:           ['available'],
};
