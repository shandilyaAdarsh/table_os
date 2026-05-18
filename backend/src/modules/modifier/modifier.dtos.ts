// ============================================================
// src/modules/modifier/modifier.dtos.ts
// Data Transfer Objects for the Core Modifier System.
// ============================================================

import type { ModifierSelectionMode, SelectionGroupInput } from './modifier.types';

// ─── Modifier Groups ──────────────────────────────────────────

export interface CreateModifierGroupDto {
  name: string;
  description?: string | null;
  selection_mode?: ModifierSelectionMode;
  min_select?: number;
  max_select?: number;
  allow_quantity?: boolean;
  min_quantity_per_option?: number;
  max_quantity_per_option?: number;
  display_order?: number;
  is_required?: boolean;
}

export interface UpdateModifierGroupDto {
  name?: string;
  description?: string | null;
  selection_mode?: ModifierSelectionMode;
  min_select?: number;
  max_select?: number;
  allow_quantity?: boolean;
  min_quantity_per_option?: number;
  max_quantity_per_option?: number;
  display_order?: number;
  is_required?: boolean;
  is_active?: boolean;
  version_num: number; // Mandatory for OCC
}

// ─── Modifier Options ──────────────────────────────────────────

export interface CreateModifierOptionDto {
  modifier_group_id: string;
  name: string;
  description?: string | null;
  price_delta_minor?: string | number; // Support string/number, stored as BIGINT string
  is_default?: boolean;
  display_order?: number;
  parent_modifier_option_id?: string | null;
}

export interface UpdateModifierOptionDto {
  name?: string;
  description?: string | null;
  price_delta_minor?: string | number;
  is_default?: boolean;
  display_order?: number;
  is_active?: boolean;
  parent_modifier_option_id?: string | null;
  version_num: number; // Mandatory for OCC
}

// ─── Menu Item Modifier Group Assignments ──────────────────────

export interface CreateMenuItemModifierGroupDto {
  menu_item_id: string;
  modifier_group_id: string;
  display_order?: number;
}

export interface UpdateMenuItemModifierGroupDto {
  display_order?: number;
  is_active?: boolean;
  version_num: number; // Mandatory for OCC
}

// ─── Validation DTOs ──────────────────────────────────────────

export interface ValidateModifierSelectionDto {
  menu_item_id: string;
  selections: SelectionGroupInput[];
}
