// ============================================================
// src/modules/menu/menu.types.ts
// Canonical TypeScript types for all menu foundation entities.
// Single source of truth. Never define these inline elsewhere.
// ============================================================

// ─── Enums ────────────────────────────────────────────────────

export type MenuItemStatus = 'active' | 'inactive' | 'archived';
export type SpiceLevel     = 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';
export type PricingType    = 'fixed' | 'variable' | 'complimentary';
export type TaxCalcMode    = 'inclusive' | 'exclusive';
export type ServiceType    = 'dine_in' | 'takeaway' | 'delivery';
export type AvailabilityDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// ─── Tax ──────────────────────────────────────────────────────

// Tax profiles and rates are now managed in the tax module
// See src/modules/tax/tax.types.ts

// ─── Categories ───────────────────────────────────────────────

export interface MenuCategory {
  id:          string;
  tenant_id:   string;
  parent_id:   string | null;
  name:        string;
  slug:        string;
  description: string | null;
  image_url:   string | null;
  sort_order:  number;
  is_active:   boolean;
  created_by:  string | null;
  updated_by:  string | null;
  version_num: number;
  created_at:  string;
  updated_at:  string;
  deleted_at:  string | null;
}

export interface MenuCategoryBranchVisibility {
  tenant_id:   string;
  branch_id:   string;
  category_id: string;
  is_visible:  boolean;
  sort_order:  number | null;
  created_at:  string;
  updated_at:  string;
}

/** Category with optional children for tree views */
export interface MenuCategoryTree extends MenuCategory {
  children: MenuCategoryTree[];
}

// ─── Menu Items ───────────────────────────────────────────────

export interface MenuItem {
  id:                   string;
  tenant_id:            string;
  category_id:          string;
  name:                 string;
  slug:                 string;
  description:          string | null;
  short_description:    string | null;
  sku:                  string | null;
  status:               MenuItemStatus;
  is_featured:          boolean;
  image_url:            string | null;
  thumbnail_url:        string | null;
  base_price:           number;   // NUMERIC(12,4) → JS number (safe for display; use string for DB writes)
  pricing_type:         PricingType;
  tax_group_id:         string | null;
  dietary_tags:         string[];
  spice_level:          SpiceLevel;
  prep_time_minutes:    number | null;
  sort_order:           number;
  created_by:           string | null;
  updated_by:           string | null;
  version_num:          number;
  created_at:           string;
  updated_at:           string;
  deleted_at:           string | null;
}

export interface MenuItemImage {
  id:         string;
  tenant_id:  string;
  item_id:    string;
  url:        string;
  alt_text:   string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

// ─── Modifiers ────────────────────────────────────────────────

export interface ModifierGroup {
  id:          string;
  tenant_id:   string;
  name:        string;
  description: string | null;
  is_required: boolean;
  min_select:  number;
  max_select:  number | null;
  is_active:   boolean;
  sort_order:  number;
  created_at:  string;
  updated_at:  string;
  deleted_at:  string | null;
}

export interface ModifierOption {
  id:                string;
  tenant_id:         string;
  modifier_group_id: string;
  name:              string;
  price_delta:       number;
  is_default:        boolean;
  is_active:         boolean;
  sort_order:        number;
  created_at:        string;
  updated_at:        string;
  deleted_at:        string | null;
}

/** Modifier group with its options (for API responses) */
export interface ModifierGroupWithOptions extends ModifierGroup {
  options: ModifierOption[];
}

// ─── Branch Overrides ────────────────────────────────────────

export interface BranchMenuItemOverride {
  tenant_id:      string;
  branch_id:      string;
  item_id:        string;
  override_price: number | null;
  is_available:   boolean | null;
  sort_order:     number | null;
  tax_group_id:   string | null;
  created_at:     string;
  updated_at:     string;
}

export interface BranchModifierOptionOverride {
  tenant_id:           string;
  branch_id:           string;
  modifier_option_id:  string;
  override_price_delta: number | null;
  is_available:        boolean | null;
  created_at:          string;
  updated_at:          string;
}

export interface BranchModifierGroupOverride {
  tenant_id:         string;
  branch_id:         string;
  modifier_group_id: string;
  is_available:      boolean;
  created_at:        string;
  updated_at:        string;
}

// ─── Availability ─────────────────────────────────────────────

export interface ItemAvailabilitySchedule {
  id:            string;
  tenant_id:     string;
  item_id:       string;
  branch_id:     string | null;
  day_of_week:   AvailabilityDay;
  start_time:    string; // "HH:MM:SS"
  end_time:      string;
  service_types: ServiceType[];
  is_active:     boolean;
  created_at:    string;
  updated_at:    string;
}

export interface ItemTemporaryDisablement {
  id:            string;
  tenant_id:     string;
  item_id:       string;
  branch_id:     string;
  disabled_by:   string | null;
  reason:        string | null;
  disabled_at:   string;
  disable_until: string | null;
  re_enabled_at: string | null;
  is_active:     boolean;
  created_at:    string;
}

// ─── Resolved/Composed types (for API responses) ─────────────

/**
 * Effective item view for a specific branch — base item merged
 * with any branch overrides. This is what the POS/KDS receives.
 */
export interface EffectiveMenuItem {
  id:                string;
  tenant_id:         string;
  branch_id:         string;
  category_id:       string;
  name:              string;
  slug:              string;
  description:       string | null;
  short_description: string | null;
  sku:               string | null;
  effective_price:   number;           // override_price ?? base_price
  pricing_type:      PricingType;
  effective_tax_group_id: string | null;
  dietary_tags:      string[];
  spice_level:       SpiceLevel;
  prep_time_minutes: number | null;
  is_available:      boolean;          // from override or item status
  is_featured:       boolean;
  image_url:         string | null;
  thumbnail_url:     string | null;
  sort_order:        number;           // override_sort ?? item sort_order
  modifier_groups:   ModifierGroupWithOptions[];
}
