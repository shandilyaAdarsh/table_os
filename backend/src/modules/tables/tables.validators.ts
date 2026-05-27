// ============================================================
// src/modules/tables/tables.validators.ts
// Zod schemas for table management request validation.
// ============================================================

import { z } from 'zod';

const RESERVATION_STATUS_VALUES = [
  'pending', 'confirmed', 'seated', 'cancelled', 'no_show',
] as const;

// ─── Floors ───────────────────────────────────────────────────

export const CreateFloorSchema = z.object({
  branch_id:  z.string().uuid(),
  name:       z.string().min(1).max(100),
  sort_order: z.number().int().default(0),
}).strict();

export const UpdateFloorSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  sort_order:  z.number().int().optional(),
  version_num: z.number().int().min(1),
}).strict();

// ─── Sections ─────────────────────────────────────────────────

export const CreateSectionSchema = z.object({
  branch_id:  z.string().uuid(),
  name:       z.string().min(1).max(100),
  sort_order: z.number().int().default(0),
}).strict();

export const UpdateSectionSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  sort_order:  z.number().int().optional(),
  version_num: z.number().int().min(1),
}).strict();

// ─── Tables ───────────────────────────────────────────────────

export const CreateTableSchema = z.object({
  branch_id:    z.string().uuid(),
  table_number: z.string().min(1).max(20),
  display_name: z.string().min(1).max(100).optional(),
  capacity:     z.number().int().min(1).max(100),
  floor_id:     z.string().uuid().optional(),
  section_id:   z.string().uuid().optional(),
  sort_order:   z.number().int().default(0),
  notes:        z.string().max(500).optional(),
}).strict();

export const UpdateTableSchema = z.object({
  table_number:       z.string().min(1).max(20).optional(),
  display_name:       z.string().min(1).max(100).optional(),
  capacity:           z.number().int().min(1).max(100).optional(),
  floor_id:           z.string().uuid().nullable().optional(),
  section_id:         z.string().uuid().nullable().optional(),
  sort_order:         z.number().int().optional(),
  notes:              z.string().max(500).optional(),
  assigned_waiter_id: z.string().uuid().nullable().optional(),
  version_num:        z.number().int().min(1),
}).strict();

// ─── Reservations ─────────────────────────────────────────────

export const CreateReservationSchema = z.object({
  branch_id:      z.string().uuid(),
  table_id:       z.string().uuid(),
  customer_name:  z.string().min(1).max(200),
  customer_phone: z.string().max(30).optional(),
  party_size:     z.number().int().min(1).max(100),
  reserved_at:    z.string().datetime(),
  notes:          z.string().max(500).optional(),
}).strict();

export const UpdateReservationSchema = z.object({
  status:              z.enum(RESERVATION_STATUS_VALUES),
  cancellation_reason: z.string().max(500).optional(),
  version_num:         z.number().int().min(1),
}).strict();

// ─── Queries ──────────────────────────────────────────────────

export const TableListQuerySchema = z.object({
  branch_id:  z.string().uuid().optional(),
  floor_id:   z.string().uuid().optional(),
  section_id: z.string().uuid().optional(),
  is_active:  z.coerce.boolean().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateFloorInput   = z.infer<typeof CreateFloorSchema>;
export type UpdateFloorInput   = z.infer<typeof UpdateFloorSchema>;
export type CreateSectionInput = z.infer<typeof CreateSectionSchema>;
export type UpdateSectionInput = z.infer<typeof UpdateSectionSchema>;
export type CreateTableInput   = z.infer<typeof CreateTableSchema>;
export type UpdateTableInput   = z.infer<typeof UpdateTableSchema>;
export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
export type UpdateReservationInput = z.infer<typeof UpdateReservationSchema>;
export type TableListQueryInput = z.infer<typeof TableListQuerySchema>;
