// ============================================================
// src/modules/overrides/overrides.types.ts
// TypeScript definitions for the Branch Override System.
// ============================================================

export interface BranchMenuItemOverride {
  id: string;
  tenant_id: string;
  branch_id: string;
  menu_item_id: string;
  is_visible: boolean;
  version_num: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface BranchCategoryOverride {
  id: string;
  tenant_id: string;
  branch_id: string;
  category_id: string;
  is_visible: boolean;
  version_num: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface BranchModifierGroupOverride {
  id: string;
  tenant_id: string;
  branch_id: string;
  modifier_group_id: string;
  is_available: boolean;
  version_num: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface BranchModifierOptionOverride {
  id: string;
  tenant_id: string;
  branch_id: string;
  modifier_option_id: string;
  is_available: boolean;
  version_num: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}


export interface BranchPriceOverride {
  id: string;
  tenant_id: string;
  branch_id: string;
  menu_item_id: string;
  price_minor: number;
  currency: string;
  starts_at: string;
  ends_at?: string | null;
  version_num: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// ─── RESOLVER ENGINE CONTRACTS ───────────────────────────────

export interface ResolvedPrice {
  price_minor: number;
  currency: string;
  source: 'override' | 'base' | 'default';
  override_id?: string | null;
}

export interface ResolvedModifierOption {
  id: string;
  name: string;
  price_delta_minor: number;
  is_available: boolean;
  is_default: boolean;
  display_order: number;
}

export interface ResolvedModifierGroup {
  id: string;
  name: string;
  selection_mode: 'single' | 'multiple';
  min_select: number;
  max_select: number;
  is_required: boolean;
  is_available: boolean;
  display_order: number;
  options: ResolvedModifierOption[];
}

export interface ResolvedMenuItem {
  id: string;
  name: string;
  description?: string | null;
  slug: string;
  is_visible: boolean; // Computed: base hidden check + availability check + branch override visibility
  price: ResolvedPrice;
  tax_profile_id: string | null;
  modifier_groups: ResolvedModifierGroup[];
}

export interface ResolvedCategory {
  id: string;
  name: string;
  slug: string;
  is_visible: boolean; // Computed: base hidden check + branch override visibility
  display_order: number;
  parent_id?: string | null;
  items: ResolvedMenuItem[];
}

export interface ResolvedTaxProfile {
  id: string;
  calculation_mode: 'inclusive' | 'exclusive';
  total_basis_points: number;
}

export interface ResolvedEffectiveMenu {
  branch_id: string;
  tenant_id: string;
  resolved_at: string;
  categories: ResolvedCategory[];
  tax_profiles: ResolvedTaxProfile[];
}
