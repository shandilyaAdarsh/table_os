// ============================================================
// src/modules/cart/cart.repository.ts
// Repository for cart persistence (no business logic).
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { Cart, CartItem, CartItemModifier, CartStatus } from './cart.types';
import type { UpdateCartItemDto, UpdateCartNotesDto } from './cart.dtos';

export async function findCartById(tenantId: string, cartId: string): Promise<Cart | null> {
  const { data, error } = await supabaseAdmin
    .from('carts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', cartId)
    .maybeSingle();

  if (error) throw new AppError('Failed to fetch cart', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as Cart | null;
}

export async function findActiveCartBySession(tenantId: string, sessionId: string): Promise<Cart | null> {
  const { data, error } = await supabaseAdmin
    .from('carts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('session_id', sessionId)
    .in('status', ['open', 'locked'])
    .maybeSingle();

  if (error) throw new AppError('Failed to fetch active cart', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as Cart | null;
}

export async function createCart(payload: {
  tenant_id: string;
  branch_id: string;
  table_id: string;
  session_id: string;
}): Promise<Cart> {
  const { data, error } = await supabaseAdmin
    .from('carts')
    .insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      table_id: payload.table_id,
      session_id: payload.session_id,
      status: 'open',
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to create cart', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as Cart;
}

export async function updateCartNotes(
  tenantId: string,
  cartId: string,
  payload: UpdateCartNotesDto,
): Promise<Cart | null> {
  const { data, error } = await supabaseAdmin
    .from('carts')
    .update({
      order_notes: payload.order_notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', cartId)
    .eq('version_num', payload.version_num)
    .select()
    .maybeSingle();

  if (error) throw new AppError('Failed to update cart notes', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as Cart | null;
}

export async function updateCartStatus(
  tenantId: string,
  cartId: string,
  status: CartStatus,
  versionNum: number,
  extra: Record<string, unknown> = {},
): Promise<Cart | null> {
  const { data, error } = await supabaseAdmin
    .from('carts')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('tenant_id', tenantId)
    .eq('id', cartId)
    .eq('version_num', versionNum)
    .select()
    .maybeSingle();

  if (error) throw new AppError('Failed to update cart status', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as Cart | null;
}

export async function listCartItems(cartId: string): Promise<CartItem[]> {
  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .select('*')
    .eq('cart_id', cartId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new AppError('Failed to list cart items', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as CartItem[];
}

export async function listCartItemModifiers(cartItemIds: string[]): Promise<CartItemModifier[]> {
  if (cartItemIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('cart_item_modifiers')
    .select('*')
    .in('cart_item_id', cartItemIds);

  if (error) throw new AppError('Failed to list cart item modifiers', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as CartItemModifier[];
}

export async function insertCartItem(
  tenantId: string,
  cartId: string,
  payload: {
    menu_item_id: string;
    item_name_snapshot: string;
    item_sku_snapshot: string | null;
    unit_price_minor_snapshot: number;
    quantity: number;
    item_notes?: string | null;
    display_order: number;
  }
): Promise<CartItem> {
  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .insert({
      tenant_id: tenantId,
      cart_id: cartId,
      menu_item_id: payload.menu_item_id,
      item_name_snapshot: payload.item_name_snapshot,
      item_sku_snapshot: payload.item_sku_snapshot,
      unit_price_minor_snapshot: payload.unit_price_minor_snapshot,
      quantity: payload.quantity,
      item_notes: payload.item_notes ?? null,
      display_order: payload.display_order,
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to add cart item', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as CartItem;
}

export async function updateCartItem(
  tenantId: string,
  itemId: string,
  payload: UpdateCartItemDto,
): Promise<CartItem | null> {
  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .update({
      quantity: payload.quantity,
      item_notes: payload.item_notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', itemId)
    .eq('version_num', payload.version_num)
    .select()
    .maybeSingle();

  if (error) throw new AppError('Failed to update cart item', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as CartItem | null;
}

export async function deleteCartItem(
  tenantId: string,
  itemId: string,
  versionNum: number,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('cart_items')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', itemId)
    .eq('version_num', versionNum);

  if (error) throw new AppError('Failed to remove cart item', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
}

export async function clearCart(cartId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('cart_items')
    .delete()
    .eq('cart_id', cartId);

  if (error) throw new AppError('Failed to clear cart items', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
}

export async function insertCartItemModifiers(
  tenantId: string,
  cartItemId: string,
  modifiers: {
    modifier_group_id: string;
    modifier_option_id: string;
    modifier_group_name_snapshot: string;
    modifier_option_name_snapshot: string;
    price_delta_minor_snapshot: number;
  }[]
): Promise<void> {
  if (modifiers.length === 0) return;
  const { error } = await supabaseAdmin
    .from('cart_item_modifiers')
    .insert(modifiers.map((m) => ({
      tenant_id: tenantId,
      cart_item_id: cartItemId,
      modifier_group_id: m.modifier_group_id,
      modifier_option_id: m.modifier_option_id,
      modifier_group_name_snapshot: m.modifier_group_name_snapshot,
      modifier_option_name_snapshot: m.modifier_option_name_snapshot,
      price_delta_minor_snapshot: m.price_delta_minor_snapshot,
    })));

  if (error) throw new AppError('Failed to add cart item modifiers', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
}
