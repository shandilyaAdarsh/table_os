// ============================================================
// src/middleware/idempotency.middleware.ts
// Express middleware for deterministic response replay and deduplication.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { acquireLock, saveResponse } from '../modules/idempotency/idempotency.repository';
import { ErrorCode } from '../shared/errors/error-codes';

export function requestIdempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.mutationContext?.idempotency_key;
    
    // Non-mutating methods or requests without idempotency keys are bypassed
    if (!key || req.method === 'GET' || req.method === 'HEAD') {
      return next();
    }

    const tenantId = req.mutationContext?.tenant_id || req.context?.tenantId;
    if (!tenantId) {
      // If tenantId is not resolved yet, let route parsing fail appropriately later
      return next();
    }

    try {
      const lockResult = await acquireLock(tenantId, key, req.path);

      if (lockResult !== true) {
        // Lock not acquired: request already exists
        if (lockResult.status === 'started') {
          res.status(409).json({
            success: false,
            error: {
              code: ErrorCode.CONFLICT,
              message: 'A duplicate request is currently being processed. Please retry in a few seconds.',
            },
          });
          return;
        }

        // Completed: Replay the cached response
        res.status(lockResult.response_status).json(lockResult.response_body);
        return;
      }

      // Lock acquired successfully: Intercept the response to store it when finished
      const originalJson = res.json;
      
      res.json = function (body: any): Response {
        // Capture only successful or expected client error responses (don't cache 500s)
        if (res.statusCode < 500) {
          saveResponse(tenantId, key, res.statusCode, body).catch((err) => {
            console.error(`[Idempotency] Failed to cache response: ${err.message}`);
          });
        }
        
        return originalJson.call(this, body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
