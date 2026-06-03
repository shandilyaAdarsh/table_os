// ============================================================
// src/modules/auth/validators/auth.validators.ts
// Input validation using Zod. Always call before hitting service layer.
// ============================================================

import { z } from 'zod';
import { ValidationError } from '../../../shared/errors/AppError';

// ─── Schemas ──────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters'),
  device_fingerprint: z
    .string({ required_error: 'Device fingerprint is required' })
    .min(16, 'Invalid device fingerprint — too short')
    .max(128, 'Invalid device fingerprint — too long'),
  remember_me: z.boolean().optional().default(false),
});

export const StaffLoginSchema = z.object({
  tenantId: z.string({ required_error: 'Tenant ID is required' }).uuid('Invalid tenant ID format'),
  branchId: z.string({ required_error: 'Branch ID is required' }).uuid('Invalid branch ID format'),
  employeeId: z.string({ required_error: 'Employee ID is required' }).min(1, 'Employee ID is required'),
  pin: z.string({ required_error: 'PIN is required' }).min(4, 'PIN must be at least 4 digits'),
});

export const RefreshTokenSchema = z.object({
  refresh_token: z
    .string({ required_error: 'Refresh token is required' })
    .min(1, 'Refresh token cannot be empty'),
  device_fingerprint: z
    .string({ required_error: 'Device fingerprint is required' })
    .min(16, 'Invalid device fingerprint'),
});

export const ForgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
});

export const ResetPasswordSchema = z
  .object({
    new_password: z
      .string({ required_error: 'New password is required' })
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
        'Password must contain uppercase, lowercase, a number, and a special character'
      ),
    confirm_password: z.string({ required_error: 'Password confirmation is required' }),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const LogoutSchema = z.object({
  device_session_id: z.string().uuid('Invalid device session ID format').optional(),
  revoke_all_sessions: z.boolean().optional().default(false),
});

// ─── Validator Helper ─────────────────────────────────────────

/**
 * Validates data against a Zod schema.
 * Throws ValidationError with field-level errors on failure.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const fields: Record<string, string> = {};
    result.error.errors.forEach((err) => {
      const key = err.path.join('.');
      if (key && !fields[key]) {
        fields[key] = err.message;
      }
    });
    throw new ValidationError(fields);
  }

  return result.data;
}
