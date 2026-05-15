// ============================================================
// src/modules/menu/menu.validators.ts
// Zod validation schemas for all menu module DTOs.
// Used by controllers before passing to services.
// ============================================================

import { z } from 'zod';

// ─── Shared primitives ────────────────────────────────────────

const uuid     = z.string().uuid();
const optUuid  = z.string().uuid().optional();
const nonEmpty = z.string().min(1).max(500);
const slug     = z.string().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format');
const price    = z.number().min(0);
const sortOrder = z.number().int().min(0).max(9999).optional().default(0);

const TAX_CALC_MODES = ['inclusive', 'exclusive'] as const;
const PRICING_TYPES  = ['fixed', 'variable', 'complimentary'] as const;
const ITEM_STATUSES  = ['active', 'inactive', 'archived'] as const;
const SPICE_LEVELS   = ['none', 'mild', 'medium', 'hot', 'extra_hot'] as const;
const SERVICE_TYPES  = ['dine_in', 'takeaway', 'delivery'] as const;
const WEEKDAYS       = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM

// ─── Tax Schemas ──────────────────────────────────────────────

export const CreateTaxGroupSchema = z.object({
  name:        nonEmpty,
  description: z.string().max(1000).optional(),
  is_default:  z.boolean().optional().default(false),
});

export const UpdateTaxGroupSchema = z.object({
  name:        z.string().min(1).max(500).optional(),
  description: z.string().max(1000).nullable().optional(),
  is_default:  z.boolean().optional(),
  is_active:   z.boolean().optional(),
});

export const CreateTaxRateSchema = z.object({
  tax_group_id:     uuid,
  branch_id:        optUuid,
  name:             nonEmpty,
  rate:             z.number().min(0).max(100),
  calculation_mode: z.enum(TAX_CALC_MODES),
  effective_from:   z.string().date().optional(),
  effective_until:  z.string().date().optional(),
}).refine(
  (d) => !d.effective_from || !d.effective_until || d.effective_from <= d.effective_until,
  { message: 'effective_from must be before effective_until', path: ['effective_from'] }
);

// ─── Category Schemas ─────────────────────────────────────────

export const CreateMenuCategorySchema = z.object({
  parent_id:   optUuid,
  name:        nonEmpty,
  slug,
  description: z.string().max(2000).optional(),
  image_url:   z.string().url().optional(),
  sort_order:  sortOrder,
});

export const UpdateMenuCategorySchema = z.object({
  parent_id:   uuid.nullable().optional(),
  name:        z.string().min(1).max(500).optional(),
  slug:        slug.optional(),
  description: z.string().max(2000).nullable().optional(),
  image_url:   z.string().url().nullable().optional(),
  sort_order:  z.number().int().min(0).optional(),
  is_active:   z.boolean().optional(),
});

export const SetCategoryBranchVisibilitySchema = z.object({
  branch_id:  uuid,
  is_visible: z.boolean(),
  sort_order: z.number().int().min(0).nullable().optional(),
});

// ─── Menu Item Schemas ────────────────────────────────────────

export const CreateMenuItemSchema = z.object({
  category_id:        uuid,
  name:               nonEmpty,
  slug,
  description:        z.string().max(5000).optional(),
  short_description:  z.string().max(500).optional(),
  sku:                z.string().max(100).optional(),
  base_price:         price,
  pricing_type:       z.enum(PRICING_TYPES).optional().default('fixed'),
  tax_group_id:       optUuid,
  dietary_tags:       z.array(z.string().max(50)).max(20).optional().default([]),
  spice_level:        z.enum(SPICE_LEVELS).optional().default('none'),
  prep_time_minutes:  z.number().int().min(0).max(600).optional(),
  sort_order:         sortOrder,
  is_featured:        z.boolean().optional().default(false),
  image_url:          z.string().url().optional(),
  thumbnail_url:      z.string().url().optional(),
  modifier_group_ids: z.array(uuid).max(20).optional(),
});

export const UpdateMenuItemSchema = z.object({
  category_id:        optUuid,
  name:               z.string().min(1).max(500).optional(),
  slug:               slug.optional(),
  description:        z.string().max(5000).nullable().optional(),
  short_description:  z.string().max(500).nullable().optional(),
  sku:                z.string().max(100).nullable().optional(),
  base_price:         z.number().min(0).optional(),
  pricing_type:       z.enum(PRICING_TYPES).optional(),
  tax_group_id:       uuid.nullable().optional(),
  dietary_tags:       z.array(z.string().max(50)).max(20).optional(),
  spice_level:        z.enum(SPICE_LEVELS).optional(),
  prep_time_minutes:  z.number().int().min(0).max(600).nullable().optional(),
  sort_order:         z.number().int().min(0).optional(),
  is_featured:        z.boolean().optional(),
  status:             z.enum(ITEM_STATUSES).optional(),
  image_url:          z.string().url().nullable().optional(),
  thumbnail_url:      z.string().url().nullable().optional(),
});

// ─── Modifier Schemas ─────────────────────────────────────────

export const CreateModifierOptionSchema = z.object({
  modifier_group_id: uuid,
  name:              nonEmpty,
  price_delta:       z.number().optional().default(0),
  is_default:        z.boolean().optional().default(false),
  sort_order:        sortOrder,
});

export const CreateModifierGroupSchema = z.object({
  name:        nonEmpty,
  description: z.string().max(1000).optional(),
  is_required: z.boolean().optional().default(false),
  min_select:  z.number().int().min(0).optional().default(0),
  max_select:  z.number().int().min(1).nullable().optional(),
  sort_order:  sortOrder,
  options:     z.array(CreateModifierOptionSchema.omit({ modifier_group_id: true })).max(50).optional(),
}).refine(
  (d) => d.max_select == null || d.max_select >= d.min_select,
  { message: 'max_select must be >= min_select', path: ['max_select'] }
).refine(
  (d) => !d.is_required || d.min_select >= 1,
  { message: 'Required groups must have min_select >= 1', path: ['min_select'] }
);

export const UpdateModifierGroupSchema = z.object({
  name:        z.string().min(1).max(500).optional(),
  description: z.string().max(1000).nullable().optional(),
  is_required: z.boolean().optional(),
  min_select:  z.number().int().min(0).optional(),
  max_select:  z.number().int().min(1).nullable().optional(),
  sort_order:  z.number().int().min(0).optional(),
  is_active:   z.boolean().optional(),
});

export const LinkModifierGroupsSchema = z.object({
  modifier_group_ids: z.array(uuid).max(20),
});

// ─── Branch Override Schemas ──────────────────────────────────

export const SetBranchItemOverrideSchema = z.object({
  override_price: z.number().min(0).nullable().optional(),
  is_available:   z.boolean().nullable().optional(),
  sort_order:     z.number().int().min(0).nullable().optional(),
  tax_group_id:   uuid.nullable().optional(),
});

export const SetBranchModifierOptionOverrideSchema = z.object({
  override_price_delta: z.number().nullable().optional(),
  is_available:         z.boolean().nullable().optional(),
});

export const SetBranchModifierGroupOverrideSchema = z.object({
  is_available: z.boolean(),
});

// ─── Availability Schemas ─────────────────────────────────────

export const CreateAvailabilityScheduleSchema = z.object({
  branch_id:    optUuid,
  day_of_week:  z.enum(WEEKDAYS),
  start_time:   z.string().regex(TIME_REGEX, 'Invalid time format; use HH:MM'),
  end_time:     z.string().regex(TIME_REGEX, 'Invalid time format; use HH:MM'),
  service_types: z.array(z.enum(SERVICE_TYPES)).min(1).optional().default(['dine_in', 'takeaway', 'delivery']),
}).refine(
  (d) => d.start_time < d.end_time,
  { message: 'start_time must be before end_time', path: ['start_time'] }
);

export const CreateTemporaryDisablementSchema = z.object({
  branch_id:     uuid,
  reason:        z.string().max(500).optional(),
  disable_until: z.string().datetime({ offset: true }).optional(),
});

// ─── Query Schemas ────────────────────────────────────────────

export const MenuItemListQuerySchema = z.object({
  category_id:  optUuid,
  status:       z.enum(ITEM_STATUSES).optional(),
  is_featured:  z.coerce.boolean().optional(),
  dietary_tags: z.array(z.string()).optional(),
  search:       z.string().max(200).optional(),
  page:         z.coerce.number().int().min(1).optional().default(1),
  limit:        z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const BranchMenuQuerySchema = z.object({
  branch_id:           uuid,
  category_id:         optUuid,
  service_type:        z.enum(SERVICE_TYPES).optional(),
  search:              z.string().max(200).optional(),
  include_unavailable: z.coerce.boolean().optional().default(false),
});
