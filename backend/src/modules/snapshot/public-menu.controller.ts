// ============================================================
// src/modules/snapshot/public-menu.controller.ts
// HTTP controller for the new public menu snapshot endpoint.
//
// Routes:
//   GET /public/menu/snapshot
//
// Rules:
//   - Supports resolving tenant via UUID or Slug (headers or query params)
//   - Supports resolving branch via UUID (headers or query params)
//   - Handles conditional GET (If-None-Match → 304 Not Modified)
//   - Sets CDN-friendly cache headers per cache_and_invalidation_strategy.md
//   - Sets ETag per snapshot_payload_spec.md §7
//   - Wraps response in standard API envelope
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SnapshotService } from './snapshot.service';
import { formatETag, parseIfNoneMatch } from './snapshot-hash.util';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { supabaseAdmin } from '../../config/supabase';
import { BranchMenuSnapshotDto } from './snapshot.dtos';

// ─── Cache-Control constants (60s CDN max-age, 300s SWR) ──────────────────────
const CDN_MAX_AGE_SECONDS = 60;
const CDN_SWR_SECONDS = 300;

// ─── Zod Schema for input extraction ──────────────────────────────────────────
export const PublicSnapshotSchema = z.object({
  tenant_id: z.string().uuid({ message: 'tenant_id must be a valid UUID' }).optional(),
  tenant_slug: z.string().min(1, { message: 'tenant_slug must be a non-empty string' }).optional(),
  branch_id: z.string().uuid({ message: 'branch_id must be a valid UUID' }),
  as_of: z
    .string()
    .datetime({ message: 'as_of must be a valid ISO-8601 datetime string' })
    .optional(),
}).refine(
  (data) => data.tenant_id !== undefined || data.tenant_slug !== undefined,
  {
    message: 'Either tenant_id or tenant_slug must be provided',
    path: ['tenant_id'],
  }
);

/**
 * GET /public/menu/snapshot
 *
 * Public endpoint: no auth required. Supports flexible client resolution:
 *   - Tenant resolved by tenant_id or tenant_slug (via query params or headers)
 *   - Branch resolved by branch_id (via query params or headers)
 *   - Optional as_of for point-in-time menu state
 */
export async function getPublicMenuSnapshot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // ── 1. Extract inputs from both query and headers ──────────────────────────
    const tenant_id =
      (req.query.tenant_id as string) ||
      (req.headers['x-tenant-id'] as string) ||
      undefined;

    const tenant_slug =
      (req.query.tenant_slug as string) ||
      (req.headers['x-tenant-slug'] as string) ||
      undefined;

    const branch_id =
      (req.query.branch_id as string) ||
      (req.headers['x-branch-id'] as string) ||
      undefined;

    const as_of =
      (req.query.as_of as string) ||
      (req.headers['x-as-of'] as string) ||
      undefined;

    // ── 2. Validate extracted input ────────────────────────────────────────────
    const validation = PublicSnapshotSchema.safeParse({
      tenant_id,
      tenant_slug,
      branch_id,
      as_of,
    });

    if (!validation.success) {
      throw new AppError(
        'Invalid public snapshot parameters',
        422,
        ErrorCode.VALIDATION_ERROR,
        true,
        validation.error.flatten().fieldErrors
      );
    }

    const params = validation.data;

    // ── 3. Resolve Tenant ID if slug is provided ──────────────────────────────
    let resolvedTenantId = params.tenant_id;
    if (!resolvedTenantId && params.tenant_slug) {
      const { data: tenantRow, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('slug', params.tenant_slug)
        .maybeSingle();

      if (tenantErr || !tenantRow) {
        throw new AppError(
          `Tenant with slug '${params.tenant_slug}' not found`,
          404,
          ErrorCode.NOT_FOUND,
          true
        );
      }
      resolvedTenantId = tenantRow.id;
    }

    if (!resolvedTenantId) {
      throw new AppError(
        'Unable to resolve tenant identity',
        400,
        ErrorCode.VALIDATION_ERROR,
        true
      );
    }

    // ── 4. Resolve pre-compiled Snapshot from menu_snapshots ───────────────────
    const resolutionStart = performance.now();
    const { data: snapshotRow, error: _snapshotErr } = await supabaseAdmin
      .from('menu_snapshots')
      .select('id, version_num, snapshot_data, updated_at')
      .eq('branch_id', params.branch_id)
      .eq('tenant_id', resolvedTenantId)
      .eq('is_active', true)
      .maybeSingle();

    let snapshot: BranchMenuSnapshotDto;
    let totalMs = 0;

    if (snapshotRow && snapshotRow.snapshot_data) {
      snapshot = {
        snapshot_id: snapshotRow.id,
        ...(snapshotRow.snapshot_data as any),
        etag: snapshotRow.id,
      };
      totalMs = Math.round(performance.now() - resolutionStart);
    } else {
      // If no pre-compiled snapshot exists, assert strict public isolation
      // Prevent querying live table models in production environments
      if (process.env['NODE_ENV'] === 'production') {
        throw new AppError(
          'Branch menu snapshot is not yet compiled. Direct menu access is disabled.',
          503,
          ErrorCode.INTERNAL_SERVER_ERROR,
          true
        );
      }

      // Safe dev-only fallback using dynamic snapshot engine
      const service = new SnapshotService(supabaseAdmin);
      const { snapshot: dynamicSnapshot, metrics } = await service.generateSnapshot({
        tenantId: resolvedTenantId,
        branchId: params.branch_id,
        timestamp: params.as_of,
      });
      snapshot = dynamicSnapshot;
      totalMs = metrics.totalMs;
    }

    const metrics = {
      resolutionMs: totalMs,
      serializationMs: 0,
      hashingMs: 0,
      totalMs,
    };

    // ── 5. Conditional GET: If-None-Match ──────────────────────────────────────
    const requestETag = parseIfNoneMatch(
      req.headers['if-none-match'] as string | undefined
    );

    if (requestETag !== null && requestETag === snapshot.etag) {
      // Snapshot unchanged — return 304 without body
      res
        .set('ETag', formatETag(snapshot.etag))
        .set('Cache-Control', `public, max-age=${CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CDN_SWR_SECONDS}`)
        .set('Vary', 'Accept-Encoding, X-Tenant-Id, X-Tenant-Slug, X-Branch-Id, X-Forwarded-Proto')
        .set('X-Snapshot-Hash', snapshot.etag)
        .status(304)
        .end();
      return;
    }

    // ── 6. Set CDN and client cache headers ──────────────────────────────────
    res
      .set('ETag', formatETag(snapshot.etag))
      .set('Cache-Control', `public, max-age=${CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CDN_SWR_SECONDS}`)
      .set('Vary', 'Accept-Encoding, X-Tenant-Id, X-Tenant-Slug, X-Branch-Id, X-Forwarded-Proto')
      .set('X-Snapshot-Hash', snapshot.etag)
      .set('X-Resolution-Ms', String(metrics.totalMs))
      .set('X-Snapshot-Categories', String(snapshot.categories.length));

    // ── 7. Return snapshot in standard envelope ────────────────────────────────
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
