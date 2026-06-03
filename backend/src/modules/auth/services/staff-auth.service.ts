import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../../../config/supabase';
import { AuthenticationError } from '../../../shared/errors/AppError';
import { env } from '../../../config/env';
import { RuntimeJwtPayload } from './runtime-auth.service';

export interface StaffLoginRequest {
  tenantId: string;
  branchId: string;
  employeeId: string;
  pin: string;
}

export class StaffAuthService {
  static async loginStaff(request: StaffLoginRequest): Promise<{ runtime_token: string }> {
    const { tenantId, branchId, employeeId, pin } = request;

    // 1. Find staff by employee_id, branch_id, and tenant_id
    const { data: staff, error } = await supabaseAdmin
      .from('staff')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('employee_id', employeeId)
      .eq('is_active', true)
      .single();

    if (error || !staff) {
      throw new AuthenticationError('Invalid employee ID or branch');
    }

    // 2. Verify PIN
    if (staff.pin !== pin) {
      throw new AuthenticationError('Invalid PIN');
    }

    // 3. Construct Runtime JWT Payload
    const payload: Omit<RuntimeJwtPayload, 'iat' | 'exp'> = {
      sub: staff.id, // Using staff.id as the subject
      tenant_id: tenantId,
      branch_id: branchId,
      role: staff.role, // e.g. 'waiter' or 'manager'
      permissions: [], // Base permissions, can expand if needed
      session_id: 'staff-session', // Generic session ID for now, could map to a device session
    };

    // 4. Sign token
    const token = jwt.sign(payload, env.RUNTIME_JWT_SECRET, { expiresIn: '12h' });

    return { runtime_token: token };
  }
}
