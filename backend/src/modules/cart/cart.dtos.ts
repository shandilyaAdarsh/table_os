// ============================================================
// src/modules/cart/cart.dtos.ts
// DTOs for cart operations.
// ============================================================

import type { Cart, CartItem, CartItemModifier } from './cart.types';

export interface CreateCartDto {
  session_id: string;
}

export interface AddCartItemModifierDto {
  modifier_group_id: string;
  modifier_option_id: string;
}

export interface AddCartItemDto {
  menu_item_id: string;
  quantity: number;
  item_notes?: string;
  modifiers?: AddCartItemModifierDto[];
}

export interface UpdateCartItemDto {
  quantity: number;
  item_notes?: string;
  version_num: number;
}

export interface RemoveCartItemDto {
  version_num: number;
}

export interface UpdateCartNotesDto {
  order_notes?: string;
  version_num: number;
}

export interface LockCartDto {
  idempotency_key: string;
  version_num: number;
}

export interface CartDetailDto {
  cart: Cart;
  items: CartItem[];
  modifiers: CartItemModifier[];
}
