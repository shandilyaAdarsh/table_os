// ============================================================
// src/modules/cart/cart.validators.ts
// Zod schemas for cart requests.
// ============================================================

import { z } from 'zod';

export const CreateCartSchema = z.object({
  session_id: z.string().uuid(),
}).strict();

export const AddCartItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  item_notes: z.string().max(500).optional(),
  modifiers: z.array(z.object({
    modifier_group_id: z.string().uuid(),
    modifier_option_id: z.string().uuid(),
  })).optional(),
}).strict();

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().min(1).max(99),
  item_notes: z.string().max(500).optional(),
  version_num: z.number().int().min(1),
}).strict();

export const RemoveCartItemSchema = z.object({
  version_num: z.number().int().min(1),
}).strict();

export const UpdateCartNotesSchema = z.object({
  order_notes: z.string().max(1000).optional(),
  version_num: z.number().int().min(1),
}).strict();

export const LockCartSchema = z.object({
  idempotency_key: z.string().uuid(),
  version_num: z.number().int().min(1),
}).strict();

export type CreateCartInput = z.infer<typeof CreateCartSchema>;
export type AddCartItemInput = z.infer<typeof AddCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;
export type RemoveCartItemInput = z.infer<typeof RemoveCartItemSchema>;
export type UpdateCartNotesInput = z.infer<typeof UpdateCartNotesSchema>;
export type LockCartInput = z.infer<typeof LockCartSchema>;
