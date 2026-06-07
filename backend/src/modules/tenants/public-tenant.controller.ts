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
      .select('id, first_name, last_name, role, pin_code_hash as pin, status, employee_id, profile_completed, profile_completed_at, profile_setup_step, developer_mode_enabled')
      .eq('tenant_id', orgId)
      .eq('branch_id', branchId)
      .eq('status', 'active');

    if (error) {
      throw error;
    }

    const formattedData = ((data as any[]) || []).map((staff: any) => ({
      ...staff,
      name: `${staff.first_name} ${staff.last_name}`.trim(),
      is_active: staff.status === 'active'
    }));

    res.status(200).json(ResponseFormatter.success(formattedData));
  } catch (err) {
    next(err);
  }
}
