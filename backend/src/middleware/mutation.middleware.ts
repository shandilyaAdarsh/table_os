// ============================================================
// src/middleware/mutation.middleware.ts
// Validates the deterministic MutationEnvelope for runtime mutations.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../shared/errors/AppError';
import { ErrorCode } from '../shared/errors/error-codes';
import crypto from 'crypto';

export const MutationEnvelopeSchema = z.object({
  mutation_id: z.string().uuid(),
  mutation_sequence: z.number().int().nonnegative(),
  runtime_version: z.number().int().nonnegative(),
  session_id: z.string().uuid().optional(), // For QR runtime
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  client_timestamp: z.string().datetime(),
  idempotency_key: z.string().uuid(),
  expected_cart_revision: z.number().int().nonnegative().optional(),
  payload: z.any(),
});

export type MutationEnvelope = z.infer<typeof MutationEnvelopeSchema>;

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      mutationContext?: Omit<MutationEnvelope, 'payload'> & {
        payload_hash: string;
      };
    }
  }
}

/**
 * Middleware that strictly enforces the MutationEnvelope for mutating requests.
 * Replaces req.body with the inner payload so existing controllers remain unaffected.
 */
export function requireMutationEnvelope() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only apply to mutations
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    try {
      const parsed = MutationEnvelopeSchema.safeParse(req.body);
      
      if (!parsed.success) {
        throw new AppError(
          'Invalid Mutation Envelope',
          400,
          ErrorCode.VALIDATION_ERROR,
          true,
          parsed.error.format()
        );
      }

      const envelope = parsed.data;

      // 1. Governance checks
      const contextTenantId = req.headers['x-tenant-id'] as string || req.qrSession?.tenant_id || req.user?.tenant_id;
      if (contextTenantId && contextTenantId !== envelope.tenant_id) {
        throw new AppError('Tenant context mismatch in mutation envelope', 403, ErrorCode.FORBIDDEN);
      }

      if (req.qrSession && req.qrSession.id !== envelope.session_id) {
        throw new AppError('Session context mismatch in mutation envelope', 403, ErrorCode.FORBIDDEN);
      }

      // Hash the payload for audit logs
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(envelope.payload)).digest('hex');

      // 2. Attach context for downstream idempotency and controllers
      req.mutationContext = {
        mutation_id: envelope.mutation_id,
        mutation_sequence: envelope.mutation_sequence,
        runtime_version: envelope.runtime_version,
        session_id: envelope.session_id,
        tenant_id: envelope.tenant_id,
        branch_id: envelope.branch_id,
        client_timestamp: envelope.client_timestamp,
        idempotency_key: envelope.idempotency_key,
        expected_cart_revision: envelope.expected_cart_revision,
        payload_hash: payloadHash,
      };

      // 3. Unwrap payload so existing validators work seamlessly
      req.body = envelope.payload;

      next();
    } catch (err) {
      next(err);
    }
  };
}
