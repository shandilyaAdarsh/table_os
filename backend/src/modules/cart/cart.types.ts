// ============================================================
// src/modules/cart/cart.types.ts
// TypeScript interfaces for cart engine entities.
// ============================================================

export type CartStatus = 'open' | 'locked' | 'submitted' | 'abandoned';

export interface Cart {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  session_id: string;
  status: CartStatus;
  checkout_idempotency_key: string | null;
  locked_at: string | null;
  submitted_at: string | null;
  abandoned_at: string | null;
  order_notes: string | null;
  version_num: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  tenant_id: string;
  cart_id: string;
  menu_item_id: string;
  item_name_snapshot: string;
  item_sku_snapshot: string | null;
  unit_price_minor_snapshot: number;
  quantity: number;
  item_notes: string | null;
  display_order: number;
  version_num: number;
  created_at: string;
  updated_at: string;
}

export interface CartItemModifier {
  id: string;
  tenant_id: string;
  cart_item_id: string;
  modifier_group_id: string;
  modifier_option_id: string;
  modifier_group_name_snapshot: string;
  modifier_option_name_snapshot: string;
  price_delta_minor_snapshot: number;
  created_at: string;
}
