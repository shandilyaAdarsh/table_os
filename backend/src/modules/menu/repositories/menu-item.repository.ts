// ============================================================
// src/modules/menu/repositories/menu-item.repository.ts
// All DB access for menu items, including branch-effective views.
// Any DB schema error throws a descriptive exception — no local fallbacks.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { MenuItem, BranchMenuItemOverride } from '../menu.types';
import type { CreateMenuItemDto, UpdateMenuItemDto, MenuItemListQuery } from '../menu.dtos';
import { findCategoryById } from './menu-category.repository';

/** Columns from orderlyy_admin-app bootstrap SQL coexisting with the modern menu schema. */
type LegacyMenuItemColumns = {
  category: boolean;
  price: boolean;
  is_available: boolean;
};

let legacyColumnsCache: LegacyMenuItemColumns | null = null;

async function columnExistsOnMenuItems(column: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('menu_items').select(column).limit(0);
  if (!error) return true;

  const msg = error.message.toLowerCase();
  return !(
    msg.includes(column) &&
    (msg.includes('does not exist') || msg.includes('could not find'))
  );
}

async function getLegacyMenuItemColumns(): Promise<LegacyMenuItemColumns> {
  if (legacyColumnsCache) return legacyColumnsCache;

  const [category, price, is_available] = await Promise.all([
    columnExistsOnMenuItems('category'),
    columnExistsOnMenuItems('price'),
    columnExistsOnMenuItems('is_available'),
  ]);

  legacyColumnsCache = { category, price, is_available };
  return legacyColumnsCache;
}

async function legacyCategoryLabel(
  tenantId: string,
  categoryId: string
): Promise<string> {
  const category = await findCategoryById(tenantId, categoryId);
  if (!category) {
    throw new Error(`[MenuItemRepo] category not found: ${categoryId}`);
  }
  return category.name;
}

async function applyLegacyMenuItemFields(
  tenantId: string,
  row: Record<string, unknown>,
  opts: {
    categoryId: string;
    basePrice: number;
    status?: string;
  }
): Promise<void> {
  const legacy = await getLegacyMenuItemColumns();

  if (legacy.category) {
    row.category = await legacyCategoryLabel(tenantId, opts.categoryId);
  }
  if (legacy.price) {
    row.price = opts.basePrice;
  }
  if (legacy.is_available) {
    row.is_available = (opts.status ?? 'active') === 'active';
  }
}

// ─── Queries ──────────────────────────────────────────────────

export async function findItemsByTenant(
  tenantId: string,
  query: MenuItemListQuery
): Promise<{ data: MenuItem[]; total: number }> {
  const page  = query.page  ?? 1;
  const limit = query.limit ?? 50;
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  let q = supabaseAdmin
    .from('menu_items')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (query.search) {
    q = q.textSearch('search_vector', query.search, { type: 'websearch', config: 'simple' });
  }

  q = q.range(from, to).order('sort_order', { ascending: true });

  if (query.category_id)  q = q.eq('category_id', query.category_id);
  if (query.status)       q = q.eq('status', query.status);
  if (query.is_featured)  q = q.eq('is_featured', true);

  if (query.dietary_tags?.length) {
    q = q.contains('dietary_tags', query.dietary_tags);
  }

  const { data, error, count } = await q;
  if (error) {
    logger.error({ err: error, tenantId, query }, 'findItemsByTenant failed');
    throw new Error(`[MenuItemRepo] findItemsByTenant: ${error.message}`);
  }

  return { data: data ?? [], total: count ?? 0 };
}

export async function findItemById(
  tenantId: string,
  itemId: string
): Promise<MenuItem | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('id', itemId)
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] findItemById: ${error.message}`);
  }
  return data;
}

export async function findAnyItemById(
  tenantId: string,
  itemId: string
): Promise<MenuItem | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', itemId)
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] findAnyItemById: ${error.message}`);
  }
  return data;
}

export async function findAnyItemsByIds(
  tenantId: string,
  itemIds: string[]
): Promise<MenuItem[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('id', itemIds);

  if (error) {
    throw new Error(`[MenuItemRepo] findAnyItemsByIds: ${error.message}`);
  }
  return (data ?? []) as MenuItem[];
}

export async function findItemBySlug(
  tenantId: string,
  slug: string
): Promise<MenuItem | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] findItemBySlug: ${error.message}`);
  }
  return data;
}

export async function findItemBySku(
  tenantId: string,
  sku: string
): Promise<MenuItem | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('sku', sku)
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] findItemBySku: ${error.message}`);
  }
  return data;
}

// ─── Branch Override Queries ──────────────────────────────────

export async function findBranchItemOverride(
  tenantId: string,
  branchId: string,
  itemId: string
): Promise<BranchMenuItemOverride | null> {
  const { data, error } = await supabaseAdmin
    .from('branch_menu_item_overrides')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('item_id', itemId)
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] findBranchItemOverride: ${error.message}`);
  }
  return data;
}

export async function findAllBranchItemOverrides(
  tenantId: string,
  branchId: string
): Promise<BranchMenuItemOverride[]> {
  const { data, error } = await supabaseAdmin
    .from('branch_menu_item_overrides')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`[MenuItemRepo] findAllBranchItemOverrides: ${error.message}`);
  }
  return (data ?? []).map((r: any) => ({
    ...r,
    item_id: r.menu_item_id ?? r.item_id,
    is_available: r.is_visible ?? r.is_available ?? true,
  }));
}

// ─── Mutations ────────────────────────────────────────────────

export async function createMenuItem(
  tenantId: string,
  dto: CreateMenuItemDto,
  createdBy: string
): Promise<MenuItem> {
  const row: Record<string, unknown> = {
    tenant_id:         tenantId,
    category_id:       dto.category_id,
    name:              dto.name,
    slug:              dto.slug,
    description:       dto.description ?? null,
    short_description: dto.short_description ?? null,
    sku:               dto.sku ?? null,
    base_price:        dto.base_price,
    pricing_type:      dto.pricing_type ?? 'fixed',
    tax_group_id:      dto.tax_group_id ?? null,
    dietary_tags:      dto.dietary_tags ?? [],
    spice_level:       dto.spice_level ?? 'none',
    prep_time_minutes: dto.prep_time_minutes ?? null,
    sort_order:        dto.sort_order ?? 0,
    is_featured:       dto.is_featured ?? false,
    is_veg:            dto.is_veg ?? false,
    image_url:         dto.image_url ?? null,
    thumbnail_url:     dto.thumbnail_url ?? null,
    recommendation_enabled: dto.recommendation_enabled ?? true,
    recommendation_tags:    dto.recommendation_tags ? Array.from(new Set(dto.recommendation_tags.map(t => t.trim().toLowerCase()).filter(Boolean))) : [],
    created_by:        createdBy,
  };

  await applyLegacyMenuItemFields(tenantId, row, {
    categoryId: dto.category_id,
    basePrice: dto.base_price,
    status: 'active',
  });

  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .insert(row)
    .select()
    .single();

  if (error) {
    logger.error({ err: error, tenantId, dto }, 'createMenuItem failed');
    throw new Error(`[MenuItemRepo] createMenuItem: ${error.message}`);
  }

  return data;
}

export async function updateMenuItem(
  tenantId: string,
  itemId: string,
  dto: UpdateMenuItemDto,
  updatedBy: string
): Promise<MenuItem> {
  const { version_num, ...updateData } = dto;

  const patch: Record<string, unknown> = {
    ...updateData,
    updated_by: updatedBy,
    version_num: version_num + 1,
  };

  const legacy = await getLegacyMenuItemColumns();
  if (updateData.category_id && legacy.category) {
    patch.category = await legacyCategoryLabel(tenantId, updateData.category_id);
  }
  if (updateData.base_price !== undefined && legacy.price) {
    patch.price = updateData.base_price;
  }
  if (updateData.status !== undefined && legacy.is_available) {
    patch.is_available = updateData.status === 'active';
  }
  if (updateData.recommendation_tags !== undefined) {
    patch.recommendation_tags = Array.from(new Set(updateData.recommendation_tags.map(t => t.trim().toLowerCase()).filter(Boolean)));
  }

  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update(patch)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('id', itemId)
    .eq('version_num', version_num)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] updateMenuItem: ${error.message}`);
  }
  if (!data) throw new Error(`[MenuItemRepo] updateMenuItem: Concurrency conflict or item not found`);
  return data;
}

export async function softDeleteMenuItem(
  tenantId: string,
  itemId: string,
  deletedBy: string,
  versionNum: number
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({
      deleted_at: new Date().toISOString(),
      status: 'archived',
      updated_by: deletedBy,
      version_num: versionNum + 1
    })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .eq('id', itemId)
    .eq('version_num', versionNum)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] softDeleteMenuItem: ${error.message}`);
  }
  if (!data) throw new Error(`[MenuItemRepo] softDeleteMenuItem: Concurrency conflict or item not found`);
}

export async function restoreItem(
  tenantId: string,
  itemId: string,
  restoredBy: string,
  versionNum: number
): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({
      deleted_at: null,
      status: 'active',
      updated_by: restoredBy,
      version_num: versionNum + 1
    })
    .eq('tenant_id', tenantId)
    .eq('id', itemId)
    .eq('version_num', versionNum)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`[MenuItemRepo] restoreItem: ${error.message}`);
  }
  if (!data) throw new Error(`[MenuItemRepo] restoreItem: Concurrency conflict or item not found`);
  return data;
}

// ─── Branch Override Mutations ────────────────────────────────

export async function upsertBranchItemOverride(
  tenantId: string,
  branchId: string,
  itemId: string,
  overrides: Partial<{
    override_price: number | null;
    is_available:   boolean | null;
    sort_order:     number | null;
    tax_group_id:   string | null;
  }>
): Promise<BranchMenuItemOverride> {
  const isVisible = overrides.is_available ?? (overrides as any).is_visible ?? true;

  const { data: existing } = await supabaseAdmin
    .from('branch_menu_item_overrides')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('menu_item_id', itemId)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('branch_menu_item_overrides')
      .update({
        is_visible: isVisible,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(`[MenuItemRepo] upsertBranchItemOverride: ${error.message}`);
    }
    return { ...data, item_id: data.menu_item_id, is_available: data.is_visible };
  } else {
    const { data, error } = await supabaseAdmin
      .from('branch_menu_item_overrides')
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        menu_item_id: itemId,
        is_visible: isVisible,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`[MenuItemRepo] upsertBranchItemOverride: ${error.message}`);
    }
    return { ...data, item_id: data.menu_item_id, is_available: data.is_visible };
  }
}

export async function deleteBranchItemOverride(
  tenantId: string,
  branchId: string,
  itemId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('branch_menu_item_overrides')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('menu_item_id', itemId);

  if (error) {
    throw new Error(`[MenuItemRepo] deleteBranchItemOverride: ${error.message}`);
  }
}

// ─── Modifier Group Links ─────────────────────────────────────

export async function replaceItemModifierGroups(
  tenantId: string,
  itemId: string,
  modifierGroupIds: string[]
): Promise<void> {
  const { error: delError } = await supabaseAdmin
    .from('menu_item_modifier_groups')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('menu_item_id', itemId);

  if (delError) {
    throw new Error(`[MenuItemRepo] replaceItemModifierGroups (delete): ${delError.message}`);
  }

  if (modifierGroupIds.length === 0) return;

  const rows = modifierGroupIds.map((groupId, idx) => ({
    tenant_id:         tenantId,
    menu_item_id:      itemId,
    modifier_group_id: groupId,
    display_order:     idx,
  }));

  const { error: insError } = await supabaseAdmin
    .from('menu_item_modifier_groups')
    .insert(rows);

  if (insError) {
    throw new Error(`[MenuItemRepo] replaceItemModifierGroups (insert): ${insError.message}`);
  }
}

export async function findModifierGroupIdsForItem(
  tenantId: string,
  itemId: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_item_modifier_groups')
    .select('modifier_group_id')
    .eq('tenant_id', tenantId)
    .eq('menu_item_id', itemId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(`[MenuItemRepo] findModifierGroupIdsForItem: ${error.message}`);
  }
  return (data ?? []).map((r) => r.modifier_group_id);
}

export async function findModifierGroupIdsForItems(
  tenantId: string,
  itemIds: string[]
): Promise<Map<string, string[]>> {
  if (itemIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from('menu_item_modifier_groups')
    .select('menu_item_id, modifier_group_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('menu_item_id', itemIds)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(`[MenuItemRepo] findModifierGroupIdsForItems: ${error.message}`);
  }

  const map = new Map<string, string[]>();
  for (const row of data ?? []) {
    const arr = map.get(row.menu_item_id) || [];
    arr.push(row.modifier_group_id);
    map.set(row.menu_item_id, arr);
  }
  
  return map;
}
