// ============================================================
// src/modules/cart/cart.service.ts
// Business logic for Cart engine and modifications.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as cartRepo from './cart.repository';
import { BranchMenuResolutionService } from '../overrides/services/branch-menu-resolution.service';
import type { AddCartItemDto, UpdateCartItemDto, UpdateCartNotesDto, CartDetailDto } from './cart.dtos';

export async function getOrCreateCart(
  tenantId: string,
  branchId: string,
  tableId: string,
  sessionId: string,
): Promise<CartDetailDto> {
  let cart = await cartRepo.findActiveCartBySession(tenantId, sessionId);
  if (!cart) {
    cart = await cartRepo.createCart({
      tenant_id: tenantId,
      branch_id: branchId,
      table_id: tableId,
      session_id: sessionId,
    });
  }

  const items = await cartRepo.listCartItems(cart.id);
  const itemIds = items.map((i) => i.id);
  const modifiers = itemIds.length > 0 ? await cartRepo.listCartItemModifiers(itemIds) : [];

  return { cart, items, modifiers };
}

export async function getCartDetail(tenantId: string, sessionId: string): Promise<CartDetailDto> {
  const cart = await cartRepo.findActiveCartBySession(tenantId, sessionId);
  if (!cart) {
    throw new AppError('No active cart found for this session', 404, ErrorCode.NOT_FOUND);
  }

  const items = await cartRepo.listCartItems(cart.id);
  const itemIds = items.map((i) => i.id);
  const modifiers = itemIds.length > 0 ? await cartRepo.listCartItemModifiers(itemIds) : [];

  return { cart, items, modifiers };
}

export async function addCartItem(
  tenantId: string,
  sessionId: string,
  dto: AddCartItemDto,
  expectedCartRevision?: number,
): Promise<CartDetailDto> {
  const cart = await cartRepo.findActiveCartBySession(tenantId, sessionId);
  if (!cart) {
    throw new AppError('No active cart found for this session', 404, ErrorCode.NOT_FOUND);
  }

  if (expectedCartRevision !== undefined && cart.version_num !== expectedCartRevision) {
    throw new AppError('STALE_RUNTIME_STATE: Cart was modified since your last known revision', 409, ErrorCode.CONFLICT);
  }

  if (cart.status !== 'open') {
    throw new AppError(`Cannot modify cart in status '${cart.status}'`, 422, ErrorCode.VALIDATION_ERROR);
  }

  // 1. Resolve menu item using BranchMenuResolutionService to get active prices, availability, name, SKU, modifiers
  const resolutionService = new BranchMenuResolutionService(supabaseAdmin);
  const effectiveMenu = await resolutionService.resolveEffectiveMenu({
    tenantId,
    branchId: cart.branch_id,
    timestamp: new Date().toISOString(),
  });

  let resolvedItem: any = null;
  for (const cat of effectiveMenu.categories) {
    const found = cat.items.find((it) => it.id === dto.menu_item_id);
    if (found) {
      resolvedItem = found;
      break;
    }
  }

  if (!resolvedItem || !resolvedItem.is_visible) {
    throw new AppError('Menu item not found or unavailable', 404, ErrorCode.NOT_FOUND);
  }

  // 2. Validate modifier options
  const inputModifiers = dto.modifiers ?? [];
  const modifiersToInsert: any[] = [];

  for (const inputMod of inputModifiers) {
    const group = resolvedItem.modifier_groups.find((g: any) => g.id === inputMod.modifier_group_id);
    if (!group) {
      throw new AppError(`Modifier group not found or unavailable: ${inputMod.modifier_group_id}`, 422, ErrorCode.VALIDATION_ERROR);
    }
    if (!group.is_available) {
      throw new AppError(`Modifier group is currently unavailable: ${group.name}`, 422, ErrorCode.VALIDATION_ERROR);
    }

    const option = group.options.find((o: any) => o.id === inputMod.modifier_option_id);
    if (!option) {
      throw new AppError(`Modifier option not found: ${inputMod.modifier_option_id}`, 422, ErrorCode.VALIDATION_ERROR);
    }
    if (!option.is_available) {
      throw new AppError(`Modifier option is currently unavailable: ${option.name}`, 422, ErrorCode.VALIDATION_ERROR);
    }

    modifiersToInsert.push({
      modifier_group_id: group.id,
      modifier_option_id: option.id,
      modifier_group_name_snapshot: group.name,
      modifier_option_name_snapshot: option.name,
      price_delta_minor_snapshot: option.price_delta_minor,
    });
  }

  // 3. Check modifier group requirements (min/max selection)
  for (const group of resolvedItem.modifier_groups) {
    if (!group.is_available) continue;
    const selectedOptions = inputModifiers.filter((m) => m.modifier_group_id === group.id);
    const count = selectedOptions.length;
    if (group.is_required && count === 0) {
      throw new AppError(`Modifier group '${group.name}' is required`, 422, ErrorCode.VALIDATION_ERROR);
    }
    if (count < group.min_select) {
      throw new AppError(`Select at least ${group.min_select} option(s) for '${group.name}'`, 422, ErrorCode.VALIDATION_ERROR);
    }
    if (count > group.max_select) {
      throw new AppError(`Select at most ${group.max_select} option(s) for '${group.name}'`, 422, ErrorCode.VALIDATION_ERROR);
    }
  }

  // 4. Calculate unit price snapshot
  const unitPrice = resolvedItem.price.price_minor;

  // 5. Insert item
  const displayOrder = (await cartRepo.listCartItems(cart.id)).length;
  const insertedItem = await cartRepo.insertCartItem(tenantId, cart.id, {
    menu_item_id: dto.menu_item_id,
    item_name_snapshot: resolvedItem.name,
    item_sku_snapshot: resolvedItem.slug ?? null,
    unit_price_minor_snapshot: unitPrice,
    quantity: dto.quantity,
    item_notes: dto.item_notes,
    display_order: displayOrder,
  });

  // 6. Insert modifiers
  if (modifiersToInsert.length > 0) {
    await cartRepo.insertCartItemModifiers(tenantId, insertedItem.id, modifiersToInsert);
  }

  // Reload and return full cart detail
  return getCartDetail(tenantId, sessionId);
}

export async function updateCartItem(
  tenantId: string,
  sessionId: string,
  itemId: string,
  dto: UpdateCartItemDto,
  expectedCartRevision?: number,
): Promise<CartDetailDto> {
  const cart = await cartRepo.findActiveCartBySession(tenantId, sessionId);
  if (!cart) {
    throw new AppError('No active cart found for this session', 404, ErrorCode.NOT_FOUND);
  }

  if (expectedCartRevision !== undefined && cart.version_num !== expectedCartRevision) {
    throw new AppError('STALE_RUNTIME_STATE: Cart was modified since your last known revision', 409, ErrorCode.CONFLICT);
  }

  if (cart.status !== 'open') {
    throw new AppError(`Cannot modify cart in status '${cart.status}'`, 422, ErrorCode.VALIDATION_ERROR);
  }

  const updatedItem = await cartRepo.updateCartItem(tenantId, itemId, dto);
  if (!updatedItem) {
    throw new AppError('Cart item not found or version mismatch', 409, ErrorCode.CONFLICT);
  }

  return getCartDetail(tenantId, sessionId);
}

export async function removeCartItem(
  tenantId: string,
  sessionId: string,
  itemId: string,
  versionNum: number,
  expectedCartRevision?: number,
): Promise<CartDetailDto> {
  const cart = await cartRepo.findActiveCartBySession(tenantId, sessionId);
  if (!cart) {
    throw new AppError('No active cart found for this session', 404, ErrorCode.NOT_FOUND);
  }

  if (expectedCartRevision !== undefined && cart.version_num !== expectedCartRevision) {
    throw new AppError('STALE_RUNTIME_STATE: Cart was modified since your last known revision', 409, ErrorCode.CONFLICT);
  }

  if (cart.status !== 'open') {
    throw new AppError(`Cannot modify cart in status '${cart.status}'`, 422, ErrorCode.VALIDATION_ERROR);
  }

  await cartRepo.deleteCartItem(tenantId, itemId, versionNum);

  return getCartDetail(tenantId, sessionId);
}

export async function updateCartNotes(
  tenantId: string,
  sessionId: string,
  dto: UpdateCartNotesDto,
  expectedCartRevision?: number,
): Promise<CartDetailDto> {
  const cart = await cartRepo.findActiveCartBySession(tenantId, sessionId);
  if (!cart) {
    throw new AppError('No active cart found for this session', 404, ErrorCode.NOT_FOUND);
  }

  if (expectedCartRevision !== undefined && cart.version_num !== expectedCartRevision) {
    throw new AppError('STALE_RUNTIME_STATE: Cart was modified since your last known revision', 409, ErrorCode.CONFLICT);
  }

  if (cart.status !== 'open') {
    throw new AppError(`Cannot modify cart in status '${cart.status}'`, 422, ErrorCode.VALIDATION_ERROR);
  }

  const updatedCart = await cartRepo.updateCartNotes(tenantId, cart.id, dto);
  if (!updatedCart) {
    throw new AppError('Cart was modified by another request. Reload and retry.', 409, ErrorCode.CONFLICT);
  }

  return getCartDetail(tenantId, sessionId);
}
