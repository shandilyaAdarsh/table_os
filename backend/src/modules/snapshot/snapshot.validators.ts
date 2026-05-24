// ============================================================
// src/modules/snapshot/snapshot.validators.ts
// Zod validators for snapshot route params.
// ============================================================

import { z } from 'zod';

// ─── Route param: branchId ────────────────────────────────────

export const SnapshotParamsSchema = z.object({
  branchId: z.string().uuid({ message: 'branchId must be a valid UUID' }),
});

export type SnapshotParams = z.infer<typeof SnapshotParamsSchema>;

// ─── Query params (optional timestamp override) ───────────────

export const SnapshotQuerySchema = z.object({
  /**
   * Optional ISO-8601 timestamp to resolve availability at a specific point in time.
   * Defaults to the current server time when not provided.
   */
  as_of: z
    .string()
    .datetime({ message: 'as_of must be a valid ISO-8601 datetime string' })
    .optional(),
});

export type SnapshotQuery = z.infer<typeof SnapshotQuerySchema>;
