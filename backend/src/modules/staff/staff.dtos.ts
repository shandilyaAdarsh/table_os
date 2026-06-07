import { z } from 'zod';

export const StaffRoleSchema = z.enum(['owner', 'manager', 'waiter']);

export const CreateStaffSchema = z.object({
  name: z.string().min(1).max(255),
  role: StaffRoleSchema,
  pin: z.string().min(4).max(10),
  is_active: z.boolean().default(true),
  employee_id: z.string().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
});

export const UpdateStaffSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: StaffRoleSchema.optional(),
  pin: z.string().min(4).max(10).optional(),
  is_active: z.boolean().optional(),
  employee_id: z.string().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
});

export type CreateStaffDTO = z.infer<typeof CreateStaffSchema>;
export type UpdateStaffDTO = z.infer<typeof UpdateStaffSchema>;
