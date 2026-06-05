import type { Request, Response, NextFunction } from 'express';
import { StaffAuthService } from '../services/staff-auth.service';
import { StaffLoginSchema, validate } from '../validators/auth.validators';
import { ResponseFormatter } from '../../../shared/utils/response-formatter';
import { supabaseAdmin } from '../../../config/supabase';
import { ErrorCode } from '../../../shared/errors/error-codes';

export async function staffLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = validate(StaffLoginSchema, req.body);
    const result = await StaffAuthService.loginStaff(body);
    res.status(200).json(
      ResponseFormatter.success(
        { runtime_token: result.runtime_token, type: 'Bearer' },
        'Staff logged in successfully'
      )
    );
  } catch (err) {
    next(err);
  }
}

export async function updateStaffProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.context?.id;
    const tenantId = req.context?.tenant_id;

    if (!userId || !tenantId) {
      res.status(401).json(ResponseFormatter.error(ErrorCode.UNAUTHORIZED, 'Unauthorized'));
      return;
    }

    const { staff_id, first_name, last_name, mobile_number, gender, date_of_birth, address, emergency_contact_name, emergency_contact_number, profile_setup_step, profile_completed } = req.body;
    
    // The device uses an admin's runtime token, so we need the staff_id from the request body
    const targetUserId = staff_id || userId;

    const updates: any = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (mobile_number !== undefined) updates.mobile_number = mobile_number;
    if (gender !== undefined) updates.gender = gender;
    if (date_of_birth !== undefined) updates.dob = date_of_birth;
    if (address !== undefined) updates.address = address;
    if (emergency_contact_name !== undefined) updates.emergency_contact_name = emergency_contact_name;
    if (emergency_contact_number !== undefined) updates.emergency_contact_number = emergency_contact_number;
    if (profile_setup_step !== undefined) updates.profile_setup_step = profile_setup_step;
    if (profile_completed !== undefined) {
      updates.profile_completed = profile_completed;
      if (profile_completed) {
        updates.profile_completed_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabaseAdmin
      .from('staff')
      .update(updates)
      .eq('id', targetUserId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json(ResponseFormatter.success(data, 'Profile updated successfully'));
  } catch (err) {
    next(err);
  }
}
