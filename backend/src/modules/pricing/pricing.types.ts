export interface MenuItemPrice {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  pricing_tier: string;
  currency_code: string;
  amount_minor: number;
  priority: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MenuItemPriceResolution {
  price_id: string;
  menu_item_id: string;
  amount_minor: number;
  currency_code: string;
  pricing_tier: string;
  priority: number;
  effective_from: string;
  effective_to: string | null;
  resolved_at: string;
}

export interface MenuItemPriceBatchResolution {
  menu_item_id: string;
  price_id: string;
  amount_minor: number;
  currency_code: string;
  pricing_tier: string;
  priority: number;
}
