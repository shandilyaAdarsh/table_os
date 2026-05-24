// ============================================================
// src/modules/snapshot/snapshot.controller.ts
// HTTP controller for the branch menu snapshot endpoint.
//
// Routes:
//   GET /api/v1/branches/:branchId/menu/snapshot
//
// Rules:
//   - ZERO business logic — delegates everything to SnapshotService
//   - Handles conditional GET (If-None-Match → 304 Not Modified)
//   - Sets CDN-friendly cache headers per cache_and_invalidation_strategy.md
//   - Sets ETag per snapshot_payload_spec.md §7
//   - Validates route params and query params via Zod
//   - Wraps response in standard API envelope (formatSuccess)
//   - All errors delegated to next() → global error handler
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { SnapshotService } from './snapshot.service';
import { SnapshotParamsSchema, SnapshotQuerySchema } from './snapshot.validators';
import { formatETag, parseIfNoneMatch } from './snapshot-hash.util';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { supabaseAdmin } from '../../config/supabase';

// ─── Cache-Control constants (per cache_and_invalidation_strategy.md §7) ──

const CDN_MAX_AGE_SECONDS = 60;
const CDN_SWR_SECONDS = 300;

// ─── Controller ──────────────────────────────────────────────

/**
 * GET /api/v1/branches/:branchId/menu/snapshot
 *
 * Public endpoint: no authentication required.
 * The branchId is in the route; tenantId is resolved from the branch.
 *
 * Note: This is a PUBLIC endpoint — no authenticate() middleware.
 * Branch ↔ tenant association is validated server-side in SnapshotService.
 */
export async function getMenuSnapshot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // ── 1. Validate route params ──────────────────────────────
    const paramsResult = SnapshotParamsSchema.safeParse(req.params);
    if (!paramsResult.success) {
      throw new AppError(
        'Invalid branch ID format',
        422,
        ErrorCode.VALIDATION_ERROR,
        true,
        paramsResult.error.flatten().fieldErrors
      );
    }

    // ── 2. Validate query params ──────────────────────────────
    const queryResult = SnapshotQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new AppError(
        'Invalid query parameters',
        422,
        ErrorCode.VALIDATION_ERROR,
        true,
        queryResult.error.flatten().fieldErrors
      );
    }

    const { branchId } = paramsResult.data;
    const { as_of } = queryResult.data;

    // ── 3. Resolve tenantId from branchId ─────────────────────
    // Public endpoint: we resolve the tenantId from the DB using the branchId.
    // This keeps the URL clean (/branches/:id/menu/snapshot) without
    // requiring the caller to know the tenantId.
    const { data: branchRow, error: branchErr } = await supabaseAdmin
      .from('branches')
      .select('tenant_id')
      .eq('id', branchId)
      .maybeSingle();

    if (branchErr || !branchRow) {
      throw new AppError(
        'Branch not found',
        404,
        ErrorCode.NOT_FOUND,
        true
      );
    }

    const tenantId = branchRow.tenant_id as string;

    // ── 4. Generate snapshot ──────────────────────────────────
    const service = new SnapshotService(supabaseAdmin);
    const { snapshot, metrics } = await service.generateSnapshot({
      tenantId,
      branchId,
      timestamp: as_of,
    });

    // ── 5. Conditional GET: If-None-Match ─────────────────────
    const requestETag = parseIfNoneMatch(
      req.headers['if-none-match'] as string | undefined
    );

    if (requestETag !== null && requestETag === snapshot.etag) {
      // Snapshot unchanged — return 304 without body
      res
        .set('ETag', formatETag(snapshot.etag))
        .set('Cache-Control', `public, max-age=${CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CDN_SWR_SECONDS}`)
        .set('Vary', 'Accept-Encoding')
        .set('X-Snapshot-Hash', snapshot.etag)
        .status(304)
        .end();
      return;
    }

    // ── 6. Set CDN cache headers ──────────────────────────────
    res
      .set('ETag', formatETag(snapshot.etag))
      .set('Cache-Control', `public, max-age=${CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CDN_SWR_SECONDS}`)
      .set('Vary', 'Accept-Encoding')
      .set('X-Snapshot-Hash', snapshot.etag)
      .set('X-Resolution-Ms', String(metrics.totalMs))
      .set('X-Snapshot-Categories', String(snapshot.categories.length));

    // ── 7. Return snapshot in standard envelope ───────────────
    res.status(200).json({
      success: true,
      data: snapshot,
      meta: {
        timestamp: new Date().toISOString(),
        performance: metrics,
        snapshot_version: 1,
      },
    });
  } catch (err) {
    next(err);
  }
}
