// ============================================================
// src/modules/availability/public-availability.controller.ts
// HTTP controller for the public menu availability runtime overlay.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AvailabilityRuntimeService } from './services/availability-runtime.service';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { supabaseAdmin } from '../../config/supabase';

// Cache-Control constants (overlay is volatile runtime state, short SWR)
const SWR_SECONDS = 30;

export const PublicAvailabilitySchema = z.object({
  tenant_id: z.string().uuid().optional(),
  tenant_slug: z.string().min(1).optional(),
  branch_id: z.string().uuid({ message: 'branch_id must be a valid UUID' }),
}).refine(
  (data) => data.tenant_id !== undefined || data.tenant_slug !== undefined,
  {
    message: 'Either tenant_id or tenant_slug must be provided',
    path: ['tenant_id'],
  }
);

export async function getPublicMenuAvailability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenant_id =
      (req.query.tenant_id as string) ||
      (req.headers['x-tenant-id'] as string) ||
      undefined;

    const tenant_slug =
      (req.query.tenant_slug as string) ||
      (req.headers['x-tenant-slug'] as string) ||
      undefined;

    const branch_id = req.params.branchId || (req.query.branch_id as string) || undefined;

    const validation = PublicAvailabilitySchema.safeParse({
      tenant_id,
      tenant_slug,
      branch_id,
    });

    if (!validation.success) {
      throw new AppError(
        'Invalid public availability parameters',
        422,
        ErrorCode.VALIDATION_ERROR,
        true,
        validation.error.flatten().fieldErrors
      );
    }

    const params = validation.data;

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
      throw new AppError('Unable to resolve tenant identity', 400, ErrorCode.VALIDATION_ERROR, true);
    }

    const t = performance.now();
    const service = new AvailabilityRuntimeService(supabaseAdmin);
    const overlay = await service.getBranchAvailability(resolvedTenantId, params.branch_id);
    const duration = performance.now() - t;

    res
      .set('Cache-Control', `public, max-age=5, stale-while-revalidate=${SWR_SECONDS}`)
      .set('Vary', 'Accept-Encoding, X-Tenant-Id, X-Tenant-Slug')
      .set('X-Resolution-Ms', String(duration))
      .status(200)
      .json({
        success: true,
        data: overlay,
        meta: {
          overlay_version: 1,
        },
      });
  } catch (err) {
    next(err);
  }
}
