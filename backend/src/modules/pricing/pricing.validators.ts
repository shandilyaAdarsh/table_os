import { z } from 'zod';

const ISO8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

export const CreateMenuItemPriceSchema = z.object({
  menu_item_id: z.string().uuid(),
  pricing_tier: z.string().min(1).max(50).optional().default('base'),
  currency_code: z.string().length(3).toUpperCase().regex(/^[A-Z]{3}$/, 'Must be valid ISO-4217').optional().default('USD'),
  amount_minor: z.number().int().min(0, 'Amount must be positive integer (minor units)'),
  priority: z.number().int().min(0).max(1000).optional().default(0),
  effective_from: z.string().regex(ISO8601Regex, 'Must be valid ISO8601 UTC timestamp').optional(),
  effective_to: z.string().regex(ISO8601Regex, 'Must be valid ISO8601 UTC timestamp').nullable().optional(),
}).refine((data) => {
  if (data.effective_to && data.effective_from) {
    return new Date(data.effective_to) > new Date(data.effective_from);
  }
  return true;
}, {
  message: 'effective_to must be strictly greater than effective_from',
  path: ['effective_to']
});

export const UpdateMenuItemPriceSchema = z.object({
  amount_minor: z.number().int().min(0).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  effective_from: z.string().regex(ISO8601Regex, 'Must be valid ISO8601 UTC timestamp').optional(),
  effective_to: z.string().regex(ISO8601Regex, 'Must be valid ISO8601 UTC timestamp').nullable().optional(),
  is_active: z.boolean().optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
}).refine((data) => {
  if (data.effective_to && data.effective_from) {
    return new Date(data.effective_to) > new Date(data.effective_from);
  }
  return true;
}, {
  message: 'effective_to must be strictly greater than effective_from',
  path: ['effective_to']
});

export const DeleteMenuItemPriceSchema = z.object({
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

export const PricingListQuerySchema = z.object({
  menu_item_id: z.string().uuid(),
  is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const ResolvePriceQuerySchema = z.object({
  menu_item_id: z.string().uuid(),
  currency_code: z.string().length(3).toUpperCase().regex(/^[A-Z]{3}$/).optional().default('USD'),
  as_of: z.string().regex(ISO8601Regex, 'Must be valid ISO8601 UTC timestamp').optional(),
});
