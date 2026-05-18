// ============================================================
// src/modules/tax/tax.types.ts
// Canonical TypeScript types for all core tax entities.
// ============================================================

export type TaxCalculationMode = 'inclusive' | 'exclusive';

export interface TaxProfile {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  calculation_mode: TaxCalculationMode;
  priority: number;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  version_num: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaxRate {
  id: string;
  tenant_id: string;
  tax_profile_id: string;
  name: string;
  rate_basis_points: number; // e.g. 500 = 5%, 1800 = 18%
  priority: number;
  effective_from: string; // ISO date string
  effective_to: string | null; // ISO date string
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  version_num: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MenuItemTaxProfile {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  tax_profile_id: string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  version_num: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── RPC Return Types ─────────────────────────────────────────

export interface ResolvedTaxRPC {
  tax_profile_id: string;
  calculation_mode: TaxCalculationMode;
  total_basis_points: number;
}

export interface ResolvedTaxBatchRPC {
  menu_item_id: string;
  tax_profile_id: string;
  calculation_mode: TaxCalculationMode;
  total_basis_points: number;
}
