// ============================================================
// src/modules/overrides/overrides.dtos.ts
// Data Transfer Objects for the Branch Override System.
// ============================================================

export interface CreateBranchMenuItemOverrideDto {
  branch_id: string;
  menu_item_id: string;
  is_visible: boolean;
}

export interface UpdateBranchMenuItemOverrideDto {
  is_visible: boolean;
  version_num: number;
}

export interface CreateBranchCategoryOverrideDto {
  branch_id: string;
  category_id: string;
  is_visible: boolean;
}

export interface UpdateBranchCategoryOverrideDto {
  is_visible: boolean;
  version_num: number;
}

export interface CreateBranchModifierGroupOverrideDto {
  branch_id: string;
  modifier_group_id: string;
  is_available: boolean;
}

export interface UpdateBranchModifierGroupOverrideDto {
  is_available: boolean;
  version_num: number;
}

export interface CreateBranchModifierOptionOverrideDto {
  branch_id: string;
  modifier_option_id: string;
  is_available: boolean;
}

export interface UpdateBranchModifierOptionOverrideDto {
  is_available: boolean;
  version_num: number;
}


export interface CreateBranchPriceOverrideDto {
  branch_id: string;
  menu_item_id: string;
  price_minor: number;
  currency: string;
  starts_at: string;
  ends_at?: string | null;
}

export interface UpdateBranchPriceOverrideDto {
  price_minor?: number;
  ends_at?: string | null;
  version_num: number;
}
