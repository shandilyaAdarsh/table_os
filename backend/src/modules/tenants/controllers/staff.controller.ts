// ============================================================
// src/modules/tenants/controllers/staff.controller.ts
// Controller for staff listing under a tenant.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../../config/supabase';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { logger as log } from '../../../shared/utils/logger';

export async function listStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const branchId = req.query.branchId as string | undefined;

    // Build query — always scope to tenant first
    let query = supabaseAdmin
      .from('staff')
      .select('id, employee_id, name, role, branch_id, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (branchId) {
      // PostgREST OR filter: staff assigned to this branch OR global staff (null branch_id)
      // Use two separate filters joined via .or() with proper PostgREST syntax
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      // Log the real Supabase error so we can diagnose it
      log.error({ tenantId, branchId, error }, 'listStaff: Supabase query failed');
      throw new AppError(
        `Failed to fetch staff: ${error.message} (code: ${error.code})`,
        500,
        ErrorCode.INTERNAL_SERVER_ERROR
      );
    }

    res.json({
      success: true,
      data: { staff: data ?? [] },
    });
  } catch (err) {
    next(err);
  }
}
