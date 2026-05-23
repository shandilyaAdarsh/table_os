// ============================================================
// src/modules/waiter-call/waiter-call.validators.ts
// Zod validation schemas for waiter calls.
// ============================================================

import { z } from 'zod';

export const CreateWaiterCallSchema = z.object({
  type: z.enum(['service', 'bill', 'other']),
  notes: z.string().max(500).optional(),
}).strict();

export const UpdateWaiterCallStatusSchema = z.object({
  status: z.enum(['acknowledged', 'resolved']),
  version_num: z.number().int().min(1),
}).strict();

export type CreateWaiterCallInput = z.infer<typeof CreateWaiterCallSchema>;
export type UpdateWaiterCallStatusInput = z.infer<typeof UpdateWaiterCallStatusSchema>;
