import { Request, Response, NextFunction } from 'express';
import { CreateStaffSchema, UpdateStaffSchema } from '../validators/staff.validators';
import { StaffService } from '../services/staff.service';
import { supabaseAdmin as supabase } from '../../../config/supabase';

export const listStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.tenantId as string;
    
    const staff = await StaffService.listStaff(supabase, tenantId);
    
    res.status(200).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    next(error);
  }
};

export const createStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.tenantId as string;
    
    console.log('Incoming create payload:', req.body);
    const payload = CreateStaffSchema.parse(req.body);
    console.log('Parsed payload:', payload);
    
    const staff = await StaffService.createStaff(supabase, tenantId, payload);
    
    res.status(201).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    next(error);
  }
};

export const updateStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.tenantId as string;
    const staffId = req.params.staffId as string;
    
    const payload = UpdateStaffSchema.parse(req.body);
    
    const staff = await StaffService.updateStaff(supabase, tenantId, staffId, payload);
    
    res.status(200).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.tenantId as string;
    const staffId = req.params.staffId as string;
    
    await StaffService.deleteStaff(supabase, tenantId, staffId);

    
    res.status(200).json({
      success: true,
      data: { success: true },
    });
  } catch (error) {
    next(error);
  }
};
