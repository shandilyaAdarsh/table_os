import { supabaseAdmin } from '../../../config/supabase';
import type { MenuItemPrice, MenuItemPriceResolution } from '../pricing.types';
import type { CreateMenuItemPriceDto, UpdateMenuItemPriceDto, PricingListQueryDto } from '../pricing.dtos';

export async function createMenuItemPrice(
  tenantId: string,
  dto: CreateMenuItemPriceDto,
  createdBy: string
): Promise<MenuItemPrice> {
  const { data, error } = await supabaseAdmin
    .from('menu_item_prices')
    .insert({
      tenant_id: tenantId,
      menu_item_id: dto.menu_item_id,
      pricing_tier: dto.pricing_tier,
      currency_code: dto.currency_code,
      amount_minor: dto.amount_minor,
      priority: dto.priority,
      effective_from: dto.effective_from,
      effective_to: dto.effective_to,
      created_by: createdBy,
      updated_by: createdBy
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23P01') {
      throw new Error(`[PricingRepo] Conflict: Overlapping effective windows for identical price tiers.`);
    }
    throw new Error(`[PricingRepo] createMenuItemPrice: ${error.message}`);
  }
  return data;
}

export async function updateMenuItemPrice(
  tenantId: string,
  priceId: string,
  versionNum: number,
  dto: UpdateMenuItemPriceDto,
  updatedBy: string
): Promise<MenuItemPrice | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_item_prices')
    .update({
      amount_minor: dto.amount_minor,
      priority: dto.priority,
      effective_from: dto.effective_from,
      effective_to: dto.effective_to,
      is_active: dto.is_active,
      updated_by: updatedBy,
      version_num: versionNum + 1
    })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('id', priceId)
    .eq('version_num', versionNum)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23P01') {
      throw new Error(`[PricingRepo] Conflict: Overlapping effective windows for identical price tiers.`);
    }
    throw new Error(`[PricingRepo] updateMenuItemPrice: ${error.message}`);
  }
  return data;
}

export async function softDeleteMenuItemPrice(
  tenantId: string,
  priceId: string,
  versionNum: number,
  deletedBy: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('menu_item_prices')
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: deletedBy,
      version_num: versionNum + 1,
      is_active: false
    })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('id', priceId)
    .eq('version_num', versionNum)
    .select()
    .maybeSingle();

  if (error) throw new Error(`[PricingRepo] softDeleteMenuItemPrice: ${error.message}`);
  return !!data;
}

export async function findPricingById(
  tenantId: string,
  priceId: string
): Promise<MenuItemPrice | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_item_prices')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('id', priceId)
    .maybeSingle();

  if (error) throw new Error(`[PricingRepo] findPricingById: ${error.message}`);
  return data;
}

export async function findPricingByItem(
  tenantId: string,
  query: PricingListQueryDto
): Promise<{ data: MenuItemPrice[], count: number }> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabaseAdmin
    .from('menu_item_prices')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('menu_item_id', query.menu_item_id);

  if (query.is_active !== undefined) {
    q = q.eq('is_active', query.is_active);
  }

  q = q.range(from, to).order('priority', { ascending: false }).order('effective_from', { ascending: false });

  const { data, count, error } = await q;

  if (error) throw new Error(`[PricingRepo] findPricingByItem: ${error.message}`);
  return { data: data || [], count: count || 0 };
}

export async function resolvePrice(
  tenantId: string,
  menuItemId: string,
  currencyCode: string,
  asOf: string
): Promise<MenuItemPriceResolution | null> {
  const { data, error } = await supabaseAdmin
    .rpc('resolve_menu_item_price', {
      p_tenant_id: tenantId,
      p_menu_item_id: menuItemId,
      p_currency_code: currencyCode,
      p_as_of: asOf
    });

  if (error) throw new Error(`[PricingRepo] resolvePrice: ${error.message}`);
  return data && data.length > 0 ? data[0] : null;
}

export async function resolvePricesBatch(
  tenantId: string,
  menuItemIds: string[],
  currencyCode: string,
  asOf: string
): Promise<MenuItemPriceResolution[]> {
  const { data, error } = await supabaseAdmin
    .rpc('resolve_menu_item_prices_batch', {
      p_tenant_id: tenantId,
      p_menu_item_ids: menuItemIds,
      p_currency_code: currencyCode,
      p_as_of: asOf
    });

  if (error) throw new Error(`[PricingRepo] resolvePricesBatch: ${error.message}`);
  return data || [];
}
