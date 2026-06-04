// ============================================================
// src/modules/menu/menu.dtos.ts
// Data Transfer Objects for API requests.
// All validated against Zod schemas in menu.validators.ts.
// ============================================================

import type {
  MenuItemStatus, SpiceLevel, PricingType, TaxCalcMode,
  ServiceType, AvailabilityDay
} from './menu.types';

// ─── Tax DTOs ────────────────────────────────────────────────

export interface CreateTaxGroupDto {
  name:        string;
  description?: string;
  is_default?: boolean;
}

export interface UpdateTaxGroupDto {
  name?:        string;
  description?: string;
  is_default?:  boolean;
  is_active?:   boolean;
}

export interface CreateTaxRateDto {
  tax_group_id:     string;
  branch_id?:       string;
  name:             string;
  rate:             number;
  calculation_mode: TaxCalcMode;
  effective_from?:  string;
  effective_until?: string;
}

export interface UpdateTaxRateDto {
  name?:             string;
  rate?:             number;
  calculation_mode?: TaxCalcMode;
  is_active?:        boolean;
  effective_from?:   string | null;
  effective_until?:  string | null;
}

// ─── Category DTOs ───────────────────────────────────────────

export interface CreateMenuCategoryDto {
  parent_id?:   string | null;
  name:         string;
  slug:         string;
  description?: string | null;
  image_url?:   string | null;
  sort_order?:  number;
}

export interface UpdateMenuCategoryDto {
  parent_id?:   string | null;
  name?:        string;
  slug?:        string;
  description?: string | null;
  image_url?:   string | null;
  sort_order?:  number;
  is_active?:   boolean;
  version_num:  number; // Required for optimistic locking
}

export interface SetCategoryBranchVisibilityDto {
  branch_id:  string;
  is_visible: boolean;
  sort_order?: number | null;
}

// ─── Menu Item DTOs ───────────────────────────────────────────

export interface CreateMenuItemDto {
  category_id:           string;
  name:                  string;
  slug:                  string;
  description?:          string | null;
  short_description?:    string | null;
  sku?:                  string | null;
  base_price:            number;
  pricing_type?:         PricingType;
  tax_group_id?:         string | null;
  dietary_tags?:         string[];
  spice_level?:          SpiceLevel;
  prep_time_minutes?:    number | null;
  sort_order?:           number;
  is_featured?:          boolean;
  image_url?:            string | null;
  thumbnail_url?:        string | null;
  modifier_group_ids?:   string[] | null;  // Link existing groups at creation
}

export interface UpdateMenuItemDto {
  category_id?:          string;
  name?:                 string;
  slug?:                 string;
  description?:          string | null;
  short_description?:    string | null;
  sku?:                  string | null;
  base_price?:           number;
  pricing_type?:         PricingType;
  tax_group_id?:         string | null;
  dietary_tags?:         string[];
  spice_level?:          SpiceLevel;
  prep_time_minutes?:    number | null;
  sort_order?:           number;
  is_featured?:          boolean;
  status?:               MenuItemStatus;
  image_url?:            string | null;
  thumbnail_url?:        string | null;
  version_num:           number; // Required for optimistic locking
}

// ─── Modifier DTOs ────────────────────────────────────────────

export interface CreateModifierGroupDto {
  name:         string;
  description?: string;
  is_required?: boolean;
  min_select?:  number;
  max_select?:  number | null;
  sort_order?:  number;
  options?:     Omit<CreateModifierOptionDto, 'modifier_group_id'>[];  // Create with initial options
}

export interface UpdateModifierGroupDto {
  name?:        string;
  description?: string | null;
  is_required?: boolean;
  min_select?:  number;
  max_select?:  number | null;
  sort_order?:  number;
  is_active?:   boolean;
}

export interface CreateModifierOptionDto {
  modifier_group_id: string;
  name:              string;
  price_delta?:      number;
  is_default?:       boolean;
  sort_order?:       number;
}

export interface UpdateModifierOptionDto {
  name?:        string;
  price_delta?: number;
  is_default?:  boolean;
  sort_order?:  number;
  is_active?:   boolean;
}

export interface LinkModifierGroupsDto {
  modifier_group_ids: string[];  // Replace all linked groups for an item
}

// ─── Branch Override DTOs ─────────────────────────────────────

export interface SetBranchItemOverrideDto {
  override_price?:  number | null;
  is_available?:    boolean | null;
  sort_order?:      number | null;
  tax_group_id?:    string | null;
}

export interface SetBranchModifierOptionOverrideDto {
  override_price_delta?: number | null;
  is_available?:         boolean | null;
}

export interface SetBranchModifierGroupOverrideDto {
  is_available: boolean;
}

// ─── Availability DTOs ────────────────────────────────────────

export interface CreateAvailabilityScheduleDto {
  branch_id?:     string;
  day_of_week:    AvailabilityDay;
  start_time:     string;  // "HH:MM"
  end_time:       string;
  service_types?: ServiceType[];
}

export interface CreateTemporaryDisablementDto {
  branch_id:     string;
  reason?:       string;
  disable_until?: string;  // ISO datetime; null = indefinite
}

// ─── Pagination / Filter Query DTOs ──────────────────────────

export interface MenuItemListQuery {
  category_id?:  string;
  status?:       MenuItemStatus;
  is_featured?:  boolean;
  dietary_tags?: string[];  // Filter items that have ALL of these tags
  search?:       string;    // Partial match on name/sku
  page?:         number;
  limit?:        number;
}

export interface BranchMenuQuery {
  branch_id:     string;
  category_id?:  string;
  service_type?: ServiceType;
  search?:       string;
  include_unavailable?: boolean; // Default false — omit 86'd items
}

export interface MenuCategoryListQuery {
  search?:       string;
  parent_id?:    string | null; // null for roots
  page?:         number;
  limit?:        number;
}

// ─── Recommendation DTOs ──────────────────────────────────────

import type { RecommendationType } from './menu.types';

export interface CreateRecommendationDto {
  branch_id?:                string;
  recommended_menu_item_id: string;
  recommendation_type:      RecommendationType;
  priority?:                 number;
}

export interface UpdateRecommendationDto {
  branch_id?:                string | null;
  recommended_menu_item_id?: string;
  recommendation_type?:      RecommendationType;
  priority?:                 number;
  is_active?:                boolean;
}
