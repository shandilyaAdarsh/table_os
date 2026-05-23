// ============================================================
// src/modules/overrides/overrides.validators.ts
// Zod schemas for request validation in the Branch Override System.
// ============================================================

import { z } from 'zod';

// ─── Item Overrides ──────────────────────────────────────────

export const CreateBranchMenuItemOverrideSchema = z.object({
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  is_visible: z.boolean(),
});

export const UpdateBranchMenuItemOverrideSchema = z.object({
  is_visible: z.boolean(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Category Overrides ──────────────────────────────────────

export const CreateBranchCategoryOverrideSchema = z.object({
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  category_id: z.string().uuid('category_id must be a valid UUID'),
  is_visible: z.boolean(),
});

export const UpdateBranchCategoryOverrideSchema = z.object({
  is_visible: z.boolean(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Modifier Group Overrides ─────────────────────────────────

export const CreateBranchModifierGroupOverrideSchema = z.object({
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  modifier_group_id: z.string().uuid('modifier_group_id must be a valid UUID'),
  is_available: z.boolean(),
});

export const UpdateBranchModifierGroupOverrideSchema = z.object({
  is_available: z.boolean(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Modifier Option Overrides ────────────────────────────────

export const CreateBranchModifierOptionOverrideSchema = z.object({
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  modifier_option_id: z.string().uuid('modifier_option_id must be a valid UUID'),
  is_available: z.boolean(),
});

export const UpdateBranchModifierOptionOverrideSchema = z.object({
  is_available: z.boolean(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Price Overrides ─────────────────────────────────────────

export const CreateBranchPriceOverrideSchema = z.object({
  branch_id: z.string().uuid('branch_id must be a valid UUID'),
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  price_minor: z.number().int().nonnegative('price_minor must be a non-negative integer'),
  currency: z.string().length(3, 'currency must be a 3-character ISO code (e.g. USD)'),
  starts_at: z.string().datetime({ message: 'starts_at must be a valid ISO 8601 UTC timestamp' }),
  ends_at: z.string().datetime({ message: 'ends_at must be a valid ISO 8601 UTC timestamp' }).nullable().optional(),
}).refine((data) => {
  if (data.ends_at && data.starts_at) {
    return new Date(data.ends_at) > new Date(data.starts_at);
  }
  return true;
}, {
  message: 'ends_at must be chronologically after starts_at',
  path: ['ends_at'],
});

export const UpdateBranchPriceOverrideSchema = z.object({
  price_minor: z.number().int().nonnegative('price_minor must be a non-negative integer').optional(),
  ends_at: z.string().datetime({ message: 'ends_at must be a valid ISO 8601 UTC timestamp' }).nullable().optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});
