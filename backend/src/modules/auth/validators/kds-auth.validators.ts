import { z } from 'zod';

export const KdsLoginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
  tenantId: z
    .string()
    .uuid('Invalid Tenant ID')
    .optional(),
  branchId: z
    .string({ required_error: 'Branch ID is required' })
    .uuid('Invalid Branch ID'),
  device_fingerprint: z
    .string({ required_error: 'Device fingerprint is required' })
    .min(16, 'Invalid device fingerprint — too short')
    .max(128, 'Invalid device fingerprint — too long'),
  remember_me: z.boolean().optional().default(false),
});
