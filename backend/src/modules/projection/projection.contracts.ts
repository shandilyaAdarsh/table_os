import { z } from 'zod';

// ============================================================
// Projection Governance Contracts
// ============================================================

export const ProjectionEnvelopeSchema = z.object({
  projection_id: z.string().uuid(),
  projection_type: z.string(),
  branch_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  projection_revision: z.number().int().nonnegative(),
  source_revision: z.number().int().nonnegative(),
  source_mutation_id: z.string().uuid().optional(),
  projection_checksum: z.string(),
  occurred_at: z.string().datetime(),
  payload: z.any(),
});

export type ProjectionEnvelope = z.infer<typeof ProjectionEnvelopeSchema>;

export const ProjectionInvalidationSignalSchema = z.object({
  type: z.literal('INVALIDATE'),
  projection_id: z.string().uuid(),
  projection_type: z.string(),
  reason: z.enum(['SEQUENCE_GAP', 'CHECKSUM_MISMATCH', 'REBUILD_REQUIRED', 'STALE_STATE']),
});

export type ProjectionInvalidationSignal = z.infer<typeof ProjectionInvalidationSignalSchema>;
