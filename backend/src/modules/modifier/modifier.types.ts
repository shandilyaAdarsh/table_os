// ============================================================
// src/modules/modifier/modifier.types.ts
// Canonical TypeScript types for all core modifier entities.
// ============================================================

export type ModifierSelectionMode = 'single' | 'multiple';

export interface ModifierGroup {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  selection_mode: ModifierSelectionMode;
  min_select: number;
  max_select: number;
  allow_quantity: boolean;
  min_quantity_per_option: number;
  max_quantity_per_option: number;
  display_order: number;
  is_required: boolean;
  is_active: boolean;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ModifierOption {
  id: string;
  tenant_id: string;
  modifier_group_id: string;
  name: string;
  description: string | null;
  price_delta_minor: string; // BIGINT is returned as string by pg/supabase-js
  is_default: boolean;
  display_order: number;
  is_active: boolean;
  parent_modifier_option_id: string | null;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MenuItemModifierGroup {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  modifier_group_id: string;
  display_order: number;
  is_active: boolean;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── RPC Return Types ─────────────────────────────────────────

export interface ResolvedModifierOptionRPC {
  id: string;
  name: string;
  description: string | null;
  price_delta_minor: string;
  is_default: boolean;
  display_order: number;
  parent_modifier_option_id: string | null;
}

export interface ResolvedModifierGroupRPC {
  assignment_id: string;
  modifier_group_id: string;
  group_name: string;
  description: string | null;
  selection_mode: ModifierSelectionMode;
  min_select: number;
  max_select: number;
  allow_quantity: boolean;
  min_qty_per_opt: number;
  max_qty_per_opt: number;
  display_order: number;
  is_required: boolean;
  options: ResolvedModifierOptionRPC[];
}

// ─── Selection Payload Types ──────────────────────────────────

export interface SelectionOptionInput {
  option_id: string;
  quantity: number;
}

export interface SelectionGroupInput {
  group_id: string;
  selections: SelectionOptionInput[];
}

export interface ModifierValidationResult {
  isValid: boolean;
  errors: Array<{
    code: string;
    message: string;
    group_id?: string;
    option_id?: string;
  }>;
  pricing: {
    total_delta_minor: string; // BIGINT as string to prevent overflow
  };
}
