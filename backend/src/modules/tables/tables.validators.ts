// ============================================================
// src/modules/tables/tables.validators.ts
// Zod schemas for table management request validation.
// ============================================================

import { z } from 'zod';

const TABLE_STATUS_VALUES = [
  'available', 'reserved', 'occupied', 'ordering', 'payment_pending', 'dirty',
] as const;

const RESERVATION_STATUS_VALUES = [
  'pending', 'confirmed', 'seated', 'cancelled', 'no_show',
] as const;

export const CreateTableSchema = z.object({
  branch_id:    z.string().uuid(),
  table_number: z.string().min(1).max(20),
  display_name: z.string().min(1).max(100).optional(),
  capacity:     z.number().int().min(1).max(100),
  notes:        z.string().max(500).optional(),
}).strict();

export const UpdateTableSchema = z.object({
  table_number:       z.string().min(1).max(20).optional(),
  display_name:       z.string().min(1).max(100).optional(),
  capacity:           z.number().int().min(1).max(100).optional(),
  notes:              z.string().max(500).optional(),
  assigned_waiter_id: z.string().uuid().nullable().optional(),
  version_num:        z.number().int().min(1),
}).strict();

export const TransitionTableStatusSchema = z.object({
  status:     z.enum(TABLE_STATUS_VALUES),
  reason:     z.string().max(500).optional(),
  version_num: z.number().int().min(1),
}).strict();

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

export const TableListQuerySchema = z.object({
  branch_id: z.string().uuid().optional(),
  status:    z.enum(TABLE_STATUS_VALUES).optional(),
  is_active: z.coerce.boolean().optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateTableInput   = z.infer<typeof CreateTableSchema>;
export type UpdateTableInput   = z.infer<typeof UpdateTableSchema>;
export type TransitionTableStatusInput = z.infer<typeof TransitionTableStatusSchema>;
export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
export type UpdateReservationInput = z.infer<typeof UpdateReservationSchema>;
export type TableListQueryInput = z.infer<typeof TableListQuerySchema>;
