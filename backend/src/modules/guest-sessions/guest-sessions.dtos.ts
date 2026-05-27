import { z } from 'zod';

export const CreateGuestSessionSchema = z.object({
  tenant_id: z.string().uuid({ message: 'tenant_id must be a valid UUID' }),
  branch_id: z.string().uuid({ message: 'branch_id must be a valid UUID' }),
  table_id: z.string().uuid({ message: 'table_id must be a valid UUID' }),
  device_fingerprint: z.string().min(8, { message: 'device_fingerprint must be at least 8 characters' }),
});

export type CreateGuestSessionDto = z.infer<typeof CreateGuestSessionSchema>;

export const UpdateGuestSessionStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'EXPIRED', 'COMPLETED', 'ABANDONED']),
});

export type UpdateGuestSessionStatusDto = z.infer<typeof UpdateGuestSessionStatusSchema>;
