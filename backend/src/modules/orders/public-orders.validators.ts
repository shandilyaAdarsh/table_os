// ============================================================
// src/modules/orders/public-orders.validators.ts
// Zod validators for public order operations.
// ============================================================

import { z } from 'zod';

export const PublicCheckoutItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  item_notes: z.string().max(500).optional(),
  modifiers: z.array(z.object({
    modifier_group_id: z.string().uuid(),
    modifier_option_id: z.string().uuid(),
  })).optional(),
});

export const PublicCheckoutSchema = z.object({
  items: z.array(PublicCheckoutItemSchema).min(1),
  order_notes: z.string().max(1000).optional(),
}).strict();

export type PublicCheckoutInput = z.infer<typeof PublicCheckoutSchema>;
