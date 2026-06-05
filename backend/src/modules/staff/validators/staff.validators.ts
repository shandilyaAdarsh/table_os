import { z } from 'zod';

export const CreateStaffSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
  pin: z.string().min(4, 'PIN must be at least 4 digits'),
  is_active: z.boolean().default(true),
  branch_id: z.string().uuid().optional().nullable(),
  email: z.string().email().optional().nullable(),
  employee_id: z.string().optional().nullable(),
});

export const UpdateStaffSchema = CreateStaffSchema.partial();
