// ============================================================
// src/modules/availability/availability.validators.ts
// Zod schemas for request validation in the Core Availability System.
// ============================================================

import { z } from 'zod';

// IANA Timezone validation helper
const TimezoneSchema = z.string().refine((tz) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, {
  message: 'Invalid IANA timezone identifier (e.g., America/New_York or Asia/Kolkata)',
});

// Time-of-day validation helper: HH:MM or HH:MM:SS
const TimeStringSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, {
  message: 'Time must be in format HH:MM or HH:MM:SS',
});

// ─── Availability Schedules ───────────────────────────────────

export const CreateAvailabilityScheduleSchema = z.object({
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  branch_id: z.string().uuid('branch_id must be a valid UUID').nullable().optional(),
  timezone: TimezoneSchema,
  day_of_week: z.number().int().min(0, 'day_of_week must be between 0 (Sunday) and 6 (Saturday)').max(6),
  start_time: TimeStringSchema,
  end_time: TimeStringSchema,
  priority: z.number().int().min(0).max(1000).optional().default(100),
}).refine((data) => {
  return data.start_time !== data.end_time;
}, {
  message: 'start_time and end_time must not be identical',
  path: ['end_time']
});

export const UpdateAvailabilityScheduleSchema = z.object({
  is_active: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Branch Item Availability ──────────────────────────────────

export const CreateBranchItemAvailabilitySchema = z.object({
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  availability_status: z.enum(['available', 'temporarily_disabled', 'out_of_stock']),
  reason: z.string().max(500).nullable().optional(),
  disabled_until: z.string().datetime({ message: 'disabled_until must be a valid ISO 8601 UTC timestamp' }).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional().default(100),
});

export const UpdateBranchItemAvailabilitySchema = z.object({
  availability_status: z.enum(['available', 'temporarily_disabled', 'out_of_stock']).optional(),
  reason: z.string().max(500).nullable().optional(),
  disabled_until: z.string().datetime({ message: 'disabled_until must be a valid ISO 8601 UTC timestamp' }).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  is_active: z.boolean().optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Item Availability Exceptions ──────────────────────────────

export const CreateItemAvailabilityExceptionSchema = z.object({
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  branch_id: z.string().uuid('branch_id must be a valid UUID').nullable().optional(),
  exception_type: z.enum(['force_available', 'force_unavailable']),
  starts_at: z.string().datetime({ message: 'starts_at must be a valid ISO 8601 UTC timestamp' }),
  ends_at: z.string().datetime({ message: 'ends_at must be a valid ISO 8601 UTC timestamp' }),
  priority: z.number().int().min(0).max(1000).optional().default(100),
}).refine((data) => {
  const start = new Date(data.starts_at).getTime();
  const end = new Date(data.ends_at).getTime();
  return start < end;
}, {
  message: 'starts_at must be chronologically before ends_at',
  path: ['ends_at']
});

export const UpdateItemAvailabilityExceptionSchema = z.object({
  is_active: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Resolution API DTO Schemas ────────────────────────────────

export const ResolveItemAvailabilitySchema = z.object({
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  resolved_at: z.string().datetime({ message: 'resolved_at must be a valid ISO 8601 UTC timestamp' }).optional(),
});

export const ResolveItemAvailabilityBatchSchema = z.object({
  menu_item_ids: z.array(z.string().uuid('menu_item_ids must contain valid UUIDs')).min(1, 'At least one menu_item_id must be provided'),
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  resolved_at: z.string().datetime({ message: 'resolved_at must be a valid ISO 8601 UTC timestamp' }).optional(),
});
