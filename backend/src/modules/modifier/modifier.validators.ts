// ============================================================
// src/modules/modifier/modifier.validators.ts
// Zod schemas for request validation in the Core Modifier System.
// ============================================================

import { z } from 'zod';

// ─── Modifier Groups ──────────────────────────────────────────

export const CreateModifierGroupSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(255),
  description: z.string().max(1000).optional().nullable(),
  selection_mode: z.enum(['single', 'multiple']).optional().default('single'),
  min_select: z.number().int().min(0, 'min_select must be >= 0').optional().default(0),
  max_select: z.number().int().min(0, 'max_select must be >= 0').optional().default(1),
  allow_quantity: z.boolean().optional().default(false),
  min_quantity_per_option: z.number().int().min(1, 'min_quantity_per_option must be >= 1').optional().default(1),
  max_quantity_per_option: z.number().int().min(1, 'max_quantity_per_option must be >= 1').optional().default(1),
  display_order: z.number().int().min(0, 'display_order must be >= 0').optional().default(0),
  is_required: z.boolean().optional().default(false),
}).refine((data) => {
  return data.max_select >= data.min_select;
}, {
  message: 'max_select must be greater than or equal to min_select',
  path: ['max_select']
}).refine((data) => {
  if (data.selection_mode === 'single') {
    return data.max_select <= 1;
  }
  return true;
}, {
  message: 'single-select groups cannot exceed max_select = 1',
  path: ['max_select']
}).refine((data) => {
  if (data.is_required) {
    return data.min_select >= 1;
  }
  return true;
}, {
  message: 'required groups must have min_select >= 1',
  path: ['min_select']
}).refine((data) => {
  return data.max_quantity_per_option >= data.min_quantity_per_option;
}, {
  message: 'max_quantity_per_option must be greater than or equal to min_quantity_per_option',
  path: ['max_quantity_per_option']
});

export const UpdateModifierGroupSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  selection_mode: z.enum(['single', 'multiple']).optional(),
  min_select: z.number().int().min(0, 'min_select must be >= 0').optional(),
  max_select: z.number().int().min(0, 'max_select must be >= 0').optional(),
  allow_quantity: z.boolean().optional(),
  min_quantity_per_option: z.number().int().min(1, 'min_quantity_per_option must be >= 1').optional(),
  max_quantity_per_option: z.number().int().min(1, 'max_quantity_per_option must be >= 1').optional(),
  display_order: z.number().int().min(0, 'display_order must be >= 0').optional(),
  is_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Modifier Options ──────────────────────────────────────────

export const CreateModifierOptionSchema = z.object({
  modifier_group_id: z.string().uuid('modifier_group_id must be a valid UUID'),
  name: z.string().min(1, 'Name cannot be empty').max(255),
  description: z.string().max(1000).optional().nullable(),
  price_delta_minor: z.union([z.number().int(), z.string().regex(/^-?\d+$/)]).optional().default(0).transform(String),
  is_default: z.boolean().optional().default(false),
  display_order: z.number().int().min(0, 'display_order must be >= 0').optional().default(0),
  parent_modifier_option_id: z.string().uuid('parent_modifier_option_id must be a valid UUID').nullable().optional(),
});

export const UpdateModifierOptionSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  price_delta_minor: z.union([z.number().int(), z.string().regex(/^-?\d+$/)]).optional().transform(String),
  is_default: z.boolean().optional(),
  display_order: z.number().int().min(0, 'display_order must be >= 0').optional(),
  is_active: z.boolean().optional(),
  parent_modifier_option_id: z.string().uuid('parent_modifier_option_id must be a valid UUID').nullable().optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Assignments ───────────────────────────────────────────────

export const CreateMenuItemModifierGroupSchema = z.object({
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  modifier_group_id: z.string().uuid('modifier_group_id must be a valid UUID'),
  display_order: z.number().int().min(0, 'display_order must be >= 0').optional().default(0),
});

export const UpdateMenuItemModifierGroupSchema = z.object({
  display_order: z.number().int().min(0, 'display_order must be >= 0').optional(),
  is_active: z.boolean().optional(),
  version_num: z.number().int().min(1, 'version_num is required for OCC'),
});

// ─── Selection Validation DTO Schema ───────────────────────────

export const SelectionOptionInputSchema = z.object({
  option_id: z.string().uuid('option_id must be a valid UUID'),
  quantity: z.number().int().min(1, 'quantity must be at least 1'),
});

export const SelectionGroupInputSchema = z.object({
  group_id: z.string().uuid('group_id must be a valid UUID'),
  selections: z.array(SelectionOptionInputSchema).min(0),
});

export const ValidateModifierSelectionSchema = z.object({
  menu_item_id: z.string().uuid('menu_item_id must be a valid UUID'),
  selections: z.array(SelectionGroupInputSchema),
});
