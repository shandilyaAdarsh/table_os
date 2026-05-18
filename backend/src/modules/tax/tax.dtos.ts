import type { z } from 'zod';
import type {
  CreateTaxProfileSchema,
  UpdateTaxProfileSchema,
  CreateTaxRateSchema,
  UpdateTaxRateSchema,
  AssignMenuItemTaxProfileSchema,
  ResolveTaxSchema,
  ResolveBatchTaxSchema
} from './tax.validators';

export type CreateTaxProfileDTO = z.infer<typeof CreateTaxProfileSchema>;
export type UpdateTaxProfileDTO = z.infer<typeof UpdateTaxProfileSchema>;
export type CreateTaxRateDTO    = z.infer<typeof CreateTaxRateSchema>;
export type UpdateTaxRateDTO    = z.infer<typeof UpdateTaxRateSchema>;
export type AssignMenuItemTaxProfileDTO = z.infer<typeof AssignMenuItemTaxProfileSchema>;
export type ResolveTaxDTO       = z.infer<typeof ResolveTaxSchema>;
export type ResolveBatchTaxDTO  = z.infer<typeof ResolveBatchTaxSchema>;
