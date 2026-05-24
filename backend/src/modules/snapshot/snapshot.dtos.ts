// ============================================================
// src/modules/snapshot/snapshot.dtos.ts
// Public-safe DTOs for the branch menu snapshot API.
// ALL internal fields (tenant_id, version_num, deleted_at,
// created_by, updated_by) are NEVER present in these types.
// Strict adherence to snapshot_payload_spec.md.
// ============================================================

// ─── Tax Profile DTO ───────────────────────────────────────────

export interface SnapshotTaxProfileDto {
  id: string;
  calculation_mode: 'inclusive' | 'exclusive';
  total_basis_points: number;
}

// ─── Modifier Option DTO ─────────────────────────────────────

export interface SnapshotModifierOptionDto {
  id: string;
  modifier_group_id: string;
  name: string;
  price_delta_minor: number;
  currency: string;
  is_default: boolean;
  is_available: boolean;
  display_order: number;
}

// ─── Modifier Group DTO ──────────────────────────────────────

export interface SnapshotModifierGroupDto {
  id: string;
  menu_item_id: string;
  name: string;
  selection_mode: 'single' | 'multiple';
  min_select: number;
  max_select: number;
  is_required: boolean;
  is_available: boolean;
  display_order: number;
}

// ─── Price DTO ───────────────────────────────────────────────

export interface SnapshotPriceDto {
  amount_minor: number;
  currency: string;
  /** True when a branch-specific price override is currently active */
  is_branch_override: boolean;
}

// ─── Availability DTO ────────────────────────────────────────

export interface SnapshotAvailabilityDto {
  is_available: boolean;
  is_out_of_stock: boolean;
  schedule_type: 'always' | 'windowed' | 'disabled';
  override_active: boolean;
}

// ─── Menu Item DTO ───────────────────────────────────────────

export interface SnapshotMenuItemDto {
  id: string;
  category_id: string;
  tax_profile_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_visible: boolean;
  price: SnapshotPriceDto;
  availability: SnapshotAvailabilityDto;
}

// ─── Category DTO ────────────────────────────────────────────

export interface SnapshotCategoryDto {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_visible: boolean;
  image_url: string | null;
}

// ─── Root Snapshot DTO ───────────────────────────────────────

export interface BranchMenuSnapshotDto {
  snapshot_id: string;
  tenant_id: string;
  branch_id: string;
  generated_at: string;
  currency_code: string;
  etag: string;
  categories: SnapshotCategoryDto[];
  items: SnapshotMenuItemDto[];
  modifier_groups: SnapshotModifierGroupDto[];
  modifier_options: SnapshotModifierOptionDto[];
  tax_profiles: SnapshotTaxProfileDto[];
}

// ─── Internal pre-hash payload (hash field excluded) ─────────

export interface BranchMenuSnapshotPayload {
  tenant_id: string;
  branch_id: string;
  generated_at: string;
  currency_code: string;
  categories: SnapshotCategoryDto[];
  items: SnapshotMenuItemDto[];
  modifier_groups: SnapshotModifierGroupDto[];
  modifier_options: SnapshotModifierOptionDto[];
  tax_profiles: SnapshotTaxProfileDto[];
}
