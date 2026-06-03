import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { ResponseFormatter } from '../../shared/utils/response-formatter';
import { ErrorCode } from '../../shared/errors/error-codes';

export async function getPublicOrganizations(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .neq('status', 'suspended');

    if (error) {
      throw error;
    }

    res.status(200).json(ResponseFormatter.success(data || []));
  } catch (err) {
    next(err);
  }
}

export async function getPublicBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orgId } = req.params;

    if (!orgId) {
      res.status(400).json(ResponseFormatter.error(ErrorCode.BAD_REQUEST, 'orgId is required'));
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('branches')
      .select('id, name, status, tenant_id')
      .eq('tenant_id', orgId)
      .neq('status', 'suspended');

    if (error) {
      throw error;
    }

    res.status(200).json(ResponseFormatter.success(data || []));
  } catch (err) {
    next(err);
  }
}

export async function getPublicStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orgId, branchId } = req.params;

    if (!orgId || !branchId) {
      res.status(400).json(ResponseFormatter.error(ErrorCode.BAD_REQUEST, 'orgId and branchId are required'));
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('staff')
      .select('id, name, role, pin, is_active, employee_id')
      .eq('tenant_id', orgId)
      .eq('branch_id', branchId)
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    res.status(200).json(ResponseFormatter.success(data || []));
  } catch (err) {
    next(err);
  }
}
