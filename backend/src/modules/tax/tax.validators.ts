import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────

export const TaxCalculationModeSchema = z.enum(['inclusive', 'exclusive']);

// ─── Profiles ─────────────────────────────────────────────────

export const CreateTaxProfileSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  calculation_mode: TaxCalculationModeSchema.default('exclusive'),
  priority: z.number().int().min(0).max(1000).default(100),
  is_active: z.boolean().default(true),
});

export const UpdateTaxProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  calculation_mode: TaxCalculationModeSchema.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  is_active: z.boolean().optional(),
  version_num: z.number().int().min(1),
});

// ─── Rates (Append-only) ──────────────────────────────────────

export const CreateTaxRateSchema = z.object({
  tax_profile_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  rate_basis_points: z.number().int().min(0), // Integer maths, >= 0
  priority: z.number().int().min(0).max(1000).default(100),
  effective_from: z.string().datetime().default(() => new Date().toISOString()),
  effective_to: z.string().datetime().nullable().optional(),
}).refine(data => {
  if (data.effective_to) {
    return new Date(data.effective_from) < new Date(data.effective_to);
  }
  return true;
}, {
  message: "effective_to must be strictly greater than effective_from",
  path: ["effective_to"],
});

export const UpdateTaxRateSchema = z.object({
  is_active: z.boolean().optional(), // For soft deletion only
  version_num: z.number().int().min(1),
});

// ─── Menu Item Mapping ────────────────────────────────────────

export const AssignMenuItemTaxProfileSchema = z.object({
  menu_item_id: z.string().uuid(),
  tax_profile_id: z.string().uuid(),
});

// ─── Resolution ───────────────────────────────────────────────

export const ResolveTaxSchema = z.object({
  menu_item_id: z.string().uuid(),
  effective_at: z.string().datetime().optional(), // Optional, defaults to now in RPC
});

export const ResolveBatchTaxSchema = z.object({
  menu_item_ids: z.array(z.string().uuid()).min(1),
  effective_at: z.string().datetime().optional(),
});
