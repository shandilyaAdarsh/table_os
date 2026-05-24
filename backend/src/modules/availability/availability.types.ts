// ============================================================
// src/modules/availability/availability.types.ts
// Canonical TypeScript types for all core availability entities.
// ============================================================

export interface AvailabilitySchedule {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  branch_id: string | null;
  timezone: string;
  day_of_week: number;
  start_time: string; // e.g. "06:00:00"
  end_time: string; // e.g. "11:00:00"
  priority: number;
  is_active: boolean;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type AvailabilityStatus = 'available' | 'temporarily_disabled' | 'out_of_stock';

export interface BranchItemAvailability {
  id: string;
  tenant_id: string;
  branch_id: string;
  menu_item_id: string;
  availability_status: AvailabilityStatus;
  reason: string | null;
  disabled_until: string | null;
  priority: number;
  is_active: boolean;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ExceptionType = 'force_available' | 'force_unavailable';

export interface ItemAvailabilityException {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  branch_id: string | null;
  exception_type: ExceptionType;
  starts_at: string;
  ends_at: string;
  priority: number;
  is_active: boolean;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── RPC Return Types ─────────────────────────────────────────

export interface ResolvedAvailabilityRPC {
  status: string;
  source_type: string;
  active_schedule_id: string | null;
  branch_scope: boolean;
  reason: string | null;
  resolved_at: string;
}

export interface ResolvedAvailabilityBatchRPC {
  menu_item_id: string;
  status: string;
  source_type: string;
  active_schedule_id: string | null;
  branch_scope: boolean;
  reason: string | null;
  resolved_at: string;
}
