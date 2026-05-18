export interface CreateMenuItemPriceDto {
  menu_item_id: string;
  pricing_tier?: string;
  currency_code?: string;
  amount_minor: number;
  priority?: number;
  effective_from?: string; // ISO8601
  effective_to?: string | null;
}

export interface UpdateMenuItemPriceDto {
  amount_minor?: number;
  priority?: number;
  effective_from?: string;
  effective_to?: string | null;
  is_active?: boolean;
}

export interface PricingListQueryDto {
  menu_item_id: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}
