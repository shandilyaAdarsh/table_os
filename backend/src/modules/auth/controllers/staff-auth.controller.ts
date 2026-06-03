import type { Request, Response, NextFunction } from 'express';
import { StaffAuthService } from '../services/staff-auth.service';
import { StaffLoginSchema, validate } from '../validators/auth.validators';
import { ResponseFormatter } from '../../../shared/utils/response-formatter';

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
