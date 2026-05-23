// ============================================================
// src/modules/availability/availability.dtos.ts
// Data Transfer Objects for the Core Availability System.
// ============================================================

import type { AvailabilityStatus, ExceptionType } from './availability.types';

// ─── Availability Schedules ───────────────────────────────────

export interface CreateAvailabilityScheduleDto {
  menu_item_id: string;
  branch_id?: string | null;
  timezone: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string; // "HH:MM:SS" or "HH:MM"
  priority?: number;
}

export interface UpdateAvailabilityScheduleDto {
  // Schedules are immutable at the database trigger level for core parameters.
  // Any update to is_active or priority requires version_num for OCC checks.
  is_active?: boolean;
  priority?: number;
  version_num: number; // Mandatory for OCC
}

// ─── Branch Item Availability ──────────────────────────────────

export interface CreateBranchItemAvailabilityDto {
  branch_id: string;
  menu_item_id: string;
  availability_status: AvailabilityStatus;
  reason?: string | null;
  disabled_until?: string | null;
  priority?: number;
}

export interface UpdateBranchItemAvailabilityDto {
  availability_status?: AvailabilityStatus;
  reason?: string | null;
  disabled_until?: string | null;
  priority?: number;
  is_active?: boolean;
  version_num: number; // Mandatory for OCC
}

// ─── Item Availability Exceptions ──────────────────────────────

export interface CreateItemAvailabilityExceptionDto {
  menu_item_id: string;
  branch_id?: string | null;
  exception_type: ExceptionType;
  starts_at: string; // ISO 8601 UTC
  ends_at: string; // ISO 8601 UTC
  priority?: number;
}

export interface UpdateItemAvailabilityExceptionDto {
  // Exceptions are immutable for core parameters at the DB trigger level.
  // Updates to non-core fields or status require version_num.
  is_active?: boolean;
  priority?: number;
  version_num: number; // Mandatory for OCC
}
