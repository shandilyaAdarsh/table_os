// ============================================================
// src/modules/tables/tables.types.ts
// TypeScript interfaces matching the DB schema for table management.
// ============================================================

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'cancelled'
  | 'no_show';

// Runtime state is DERIVED — never stored as mutable status on the table.
export type TableRuntimeState =
  | 'FREE'
  | 'ACTIVE_GUESTS'
  | 'ORDERING'
  | 'PAYMENT_PENDING'
  | 'ASSISTANCE_REQUESTED';

// ─── Table Floor ───────────────────────────────────────────────

export interface TableFloor {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  sort_order: number;
  version_num: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── Table Section ─────────────────────────────────────────────

export interface TableSection {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  sort_order: number;
  version_num: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── Table ─────────────────────────────────────────────────────

export interface Table {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_number: string;
  display_name: string | null;
  capacity: number;
  floor_id: string | null;
  section_id: string | null;
  sort_order: number;
  assigned_waiter_id: string | null;
  notes: string | null;
  is_active: boolean;
  qr_token: string | null;
  qr_url: string | null;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── Table Runtime Projection ──────────────────────────────────
// Derived read model. Rebuilt from operational events.

export interface TableRuntimeProjection {
  table_id: string;
  tenant_id: string;
  active_guest_count: number;
  active_order_count: number;
  assistance_request_count: number;
  runtime_state: TableRuntimeState;
  updated_at: string;
}

// ─── Table QR Token ────────────────────────────────────────────

export interface TableQrToken {
  id: string;
  tenant_id: string;
  table_id: string;
  public_token: string;
  is_active: boolean;
  rotated_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// ─── Table State History ───────────────────────────────────────

export interface TableStateHistory {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

// ─── Table Reservation ─────────────────────────────────────────

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
