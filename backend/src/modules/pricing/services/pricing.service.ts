import { AppError } from '../../../shared/errors/AppError';
import * as pricingRepo from '../repositories/pricing.repository';
import type { CreateMenuItemPriceDto, UpdateMenuItemPriceDto, PricingListQueryDto } from '../pricing.dtos';
import type { MenuItemPrice, MenuItemPriceResolution } from '../pricing.types';
import { findItemById } from '../../menu/repositories/menu-item.repository';

export async function createPrice(
  tenantId: string,
  dto: CreateMenuItemPriceDto,
  userId: string
): Promise<MenuItemPrice> {
  // Validate item exists in tenant
  const item = await findItemById(tenantId, dto.menu_item_id);
  if (!item) {
    throw new AppError('Menu item not found', 404, 'NOT_FOUND');
  }

  // Enforce effective dates logic is safe at service layer
  if (dto.effective_to && dto.effective_from) {
    if (new Date(dto.effective_to) <= new Date(dto.effective_from)) {
      throw new AppError('effective_to must be after effective_from', 400, 'VALIDATION_ERROR');
    }
  }

  try {
    return await pricingRepo.createMenuItemPrice(tenantId, dto, userId);
  } catch (error: any) {
    if (error.message.includes('Conflict: Overlapping effective windows')) {
      throw new AppError('Pricing conflict: Overlapping effective windows are not allowed for the same tier and priority.', 409, 'CONFLICT');
    }
    throw error;
  }
}

export async function updatePrice(
  tenantId: string,
  priceId: string,
  versionNum: number,
  dto: UpdateMenuItemPriceDto,
  userId: string
): Promise<MenuItemPrice> {
  const existing = await pricingRepo.findPricingById(tenantId, priceId);
  if (!existing) {
    throw new AppError('Pricing record not found', 404, 'NOT_FOUND');
  }

  const effectiveFrom = dto.effective_from ?? existing.effective_from;
  const effectiveTo = dto.effective_to !== undefined ? dto.effective_to : existing.effective_to;

  if (effectiveTo && effectiveFrom) {
    if (new Date(effectiveTo) <= new Date(effectiveFrom)) {
      throw new AppError('effective_to must be after effective_from', 400, 'VALIDATION_ERROR');
    }
  }

  const financialChanged = 
    (dto.amount_minor !== undefined && dto.amount_minor !== existing.amount_minor) ||
    (dto.effective_from !== undefined && dto.effective_from !== existing.effective_from) ||
    (dto.effective_to !== undefined && dto.effective_to !== existing.effective_to);

  if (financialChanged) {
    // 1. Deactivate old row to preserve historical financial record
    const deleted = await pricingRepo.softDeleteMenuItemPrice(tenantId, priceId, versionNum, userId);
    if (!deleted) {
      throw new AppError('Pricing record was modified by another user. Please refresh and try again.', 409, 'CONCURRENCY_CONFLICT');
    }

    // 2. Insert new row with updated fields
    const newDto: CreateMenuItemPriceDto = {
      menu_item_id: existing.menu_item_id,
      pricing_tier: existing.pricing_tier,
      currency_code: existing.currency_code,
      amount_minor: dto.amount_minor ?? existing.amount_minor,
      priority: dto.priority ?? existing.priority,
      effective_from: dto.effective_from ?? existing.effective_from,
      effective_to: dto.effective_to !== undefined ? dto.effective_to : existing.effective_to,
    };

    try {
      return await pricingRepo.createMenuItemPrice(tenantId, newDto, userId);
    } catch (error: any) {
      if (error.message.includes('Conflict: Overlapping effective windows')) {
        throw new AppError('Pricing conflict: Overlapping effective windows are not allowed.', 409, 'CONFLICT');
      }
      throw error;
    }
  }

  // 3. If no financial fields changed, just update metadata (is_active, priority)
  let updated;
  try {
    const safeDto = { ...dto, amount_minor: undefined, effective_from: undefined, effective_to: undefined };
    updated = await pricingRepo.updateMenuItemPrice(tenantId, priceId, versionNum, safeDto, userId);
  } catch (error: any) {
    if (error.message.includes('Conflict: Overlapping effective windows')) {
      throw new AppError('Pricing conflict: Overlapping effective windows are not allowed.', 409, 'CONFLICT');
    }
    throw error;
  }
  
  if (!updated) {
    throw new AppError('Pricing record was modified by another user. Please refresh and try again.', 409, 'CONCURRENCY_CONFLICT');
  }

  return updated;
}

export async function deletePrice(
  tenantId: string,
  priceId: string,
  versionNum: number,
  userId: string
): Promise<void> {
  const existing = await pricingRepo.findPricingById(tenantId, priceId);
  if (!existing) {
    throw new AppError('Pricing record not found', 404, 'NOT_FOUND');
  }

  const success = await pricingRepo.softDeleteMenuItemPrice(tenantId, priceId, versionNum, userId);
  if (!success) {
    throw new AppError('Pricing record was modified by another user. Please refresh and try again.', 409, 'CONCURRENCY_CONFLICT');
  }
}

export async function listPrices(
  tenantId: string,
  query: PricingListQueryDto
): Promise<{ data: MenuItemPrice[], count: number }> {
  // Validate item
  const item = await findItemById(tenantId, query.menu_item_id);
  if (!item) {
    throw new AppError('Menu item not found', 404, 'NOT_FOUND');
  }

  return await pricingRepo.findPricingByItem(tenantId, query);
}

export async function resolvePrice(
  tenantId: string,
  menuItemId: string,
  currencyCode: string = 'USD',
  asOf?: string
): Promise<MenuItemPriceResolution | null> {
  const targetDate = asOf || new Date().toISOString();
  return await pricingRepo.resolvePrice(tenantId, menuItemId, currencyCode, targetDate);
}

export async function resolvePricesBatch(
  tenantId: string,
  menuItemIds: string[],
  currencyCode: string = 'USD',
  asOf?: string
): Promise<MenuItemPriceResolution[]> {
  if (!menuItemIds.length) return [];
  const targetDate = asOf || new Date().toISOString();
  return await pricingRepo.resolvePricesBatch(tenantId, menuItemIds, currencyCode, targetDate);
}
