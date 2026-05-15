// ============================================================
// src/modules/menu/repositories/menu-item.repository.ts
// All DB access for menu items, including branch-effective views.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { MenuItem, BranchMenuItemOverride } from '../menu.types';
import type { CreateMenuItemDto, UpdateMenuItemDto, MenuItemListQuery } from '../menu.dtos';

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
    .is('deleted_at', null)
    .range(from, to)
    .order('sort_order', { ascending: true });

  if (query.category_id)  q = q.eq('category_id', query.category_id);
  if (query.status)       q = q.eq('status', query.status);
  if (query.is_featured)  q = q.eq('is_featured', true);
  if (query.search)       q = q.ilike('name', `%${query.search}%`);
  if (query.dietary_tags?.length) {
    // @> operator: all specified tags must be present
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
    .eq('id', itemId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[MenuItemRepo] findItemById: ${error.message}`);
  return data;
}

export async function findItemBySlug(
  tenantId: string,
  slug: string
): Promise<MenuItem | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[MenuItemRepo] findItemBySlug: ${error.message}`);
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
    .eq('sku', sku)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[MenuItemRepo] findItemBySku: ${error.message}`);
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

  if (error) throw new Error(`[MenuItemRepo] findBranchItemOverride: ${error.message}`);
  return data;
}

/** Returns ALL overrides for a branch (batch load for menu assembly). */
export async function findAllBranchItemOverrides(
  tenantId: string,
  branchId: string
): Promise<BranchMenuItemOverride[]> {
  const { data, error } = await supabaseAdmin
    .from('branch_menu_item_overrides')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId);

  if (error) throw new Error(`[MenuItemRepo] findAllBranchItemOverrides: ${error.message}`);
  return data ?? [];
}

// ─── Mutations ────────────────────────────────────────────────

export async function createMenuItem(
  tenantId: string,
  dto: CreateMenuItemDto,
  createdBy: string
): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .insert({
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
      image_url:         dto.image_url ?? null,
      thumbnail_url:     dto.thumbnail_url ?? null,
      created_by:        createdBy,
    })
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
  dto: UpdateMenuItemDto
): Promise<MenuItem> {
  const { data, error } = await supabaseAdmin
    .from('menu_items')
    .update({ ...dto })
    .eq('tenant_id', tenantId)
    .eq('id', itemId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw new Error(`[MenuItemRepo] updateMenuItem: ${error.message}`);
  return data;
}

export async function softDeleteMenuItem(tenantId: string, itemId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('menu_items')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('tenant_id', tenantId)
    .eq('id', itemId);

  if (error) throw new Error(`[MenuItemRepo] softDeleteMenuItem: ${error.message}`);
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
  const { data, error } = await supabaseAdmin
    .from('branch_menu_item_overrides')
    .upsert(
      { tenant_id: tenantId, branch_id: branchId, item_id: itemId, ...overrides },
      { onConflict: 'tenant_id,branch_id,item_id' }
    )
    .select()
    .single();

  if (error) throw new Error(`[MenuItemRepo] upsertBranchItemOverride: ${error.message}`);
  return data;
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
    .eq('item_id', itemId);

  if (error) throw new Error(`[MenuItemRepo] deleteBranchItemOverride: ${error.message}`);
}

// ─── Modifier Group Links ─────────────────────────────────────

export async function replaceItemModifierGroups(
  tenantId: string,
  itemId: string,
  modifierGroupIds: string[]
): Promise<void> {
  // Atomic replace: delete all, then insert new links
  const { error: delError } = await supabaseAdmin
    .from('menu_item_modifier_groups')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('item_id', itemId);

  if (delError) throw new Error(`[MenuItemRepo] replaceItemModifierGroups (delete): ${delError.message}`);

  if (modifierGroupIds.length === 0) return;

  const rows = modifierGroupIds.map((groupId, idx) => ({
    tenant_id:         tenantId,
    item_id:           itemId,
    modifier_group_id: groupId,
    sort_order:        idx,
  }));

  const { error: insError } = await supabaseAdmin
    .from('menu_item_modifier_groups')
    .insert(rows);

  if (insError) throw new Error(`[MenuItemRepo] replaceItemModifierGroups (insert): ${insError.message}`);
}

export async function findModifierGroupIdsForItem(
  tenantId: string,
  itemId: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_item_modifier_groups')
    .select('modifier_group_id')
    .eq('tenant_id', tenantId)
    .eq('item_id', itemId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`[MenuItemRepo] findModifierGroupIdsForItem: ${error.message}`);
  return (data ?? []).map((r) => r.modifier_group_id);
}
