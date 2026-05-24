// ============================================================
// src/modules/menu/repositories/menu-category.repository.ts
// All DB access for menu categories.
// Uses supabaseAdmin — bypasses RLS.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { MenuCategory, MenuCategoryBranchVisibility } from '../menu.types';
import type { CreateMenuCategoryDto, UpdateMenuCategoryDto, MenuCategoryListQuery } from '../menu.dtos';

// ─── Queries ──────────────────────────────────────────────────

export async function findCategoriesByTenant(tenantId: string): Promise<MenuCategory[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (error) {
    logger.error({ err: error, tenantId }, 'findCategoriesByTenant failed');
    throw new Error(`[MenuCategoryRepo] findCategoriesByTenant: ${error.message}`);
  }

  return data ?? [];
}

export async function listMenuCategories(
  tenantId: string,
  query: MenuCategoryListQuery
): Promise<{ data: MenuCategory[]; total: number }> {
  let dbQuery = supabaseAdmin
    .from('menu_categories')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);

  if (query.parent_id !== undefined) {
    if (query.parent_id === null) {
      dbQuery = dbQuery.is('parent_id', null);
    } else {
      dbQuery = dbQuery.eq('parent_id', query.parent_id);
    }
  }

  if (query.search) {
    dbQuery = dbQuery.ilike('name', `%${query.search}%`);
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  dbQuery = dbQuery.order('sort_order', { ascending: true }).range(from, to);

  const { data, error, count } = await dbQuery;

  if (error) {
    logger.error({ err: error, tenantId, query }, 'listMenuCategories failed');
    throw new Error(`[MenuCategoryRepo] listMenuCategories: ${error.message}`);
  }

  return { data: data ?? [], total: count ?? 0 };
}

export async function findCategoryById(
  tenantId: string,
  categoryId: string
): Promise<MenuCategory | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', categoryId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, tenantId, categoryId }, 'findCategoryById failed');
    throw new Error(`[MenuCategoryRepo] findCategoryById: ${error.message}`);
  }

  return data;
}

export async function findAnyCategoryById(
  tenantId: string,
  categoryId: string
): Promise<MenuCategory | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', categoryId)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, tenantId, categoryId }, 'findAnyCategoryById failed');
    throw new Error(`[MenuCategoryRepo] findAnyCategoryById: ${error.message}`);
  }

  return data;
}

export async function findCategoryBySlug(
  tenantId: string,
  slug: string
): Promise<MenuCategory | null> {
  const { data, error } = await supabaseAdmin
    .from('menu_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new Error(`[MenuCategoryRepo] findCategoryBySlug: ${error.message}`);
  return data;
}

/** Returns categories visible at a specific branch. */
export async function findVisibleCategoriesForBranch(
  tenantId: string,
  branchId: string
): Promise<MenuCategory[]> {
  // Strategy: fetch all active tenant categories, then exclude those
  // explicitly hidden for this branch.
  const { data: hiddenData, error: hiddenError } = await supabaseAdmin
    .from('menu_category_branch_visibility')
    .select('category_id')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('is_visible', false);

  if (hiddenError) throw new Error(`[MenuCategoryRepo] findVisibleCategoriesForBranch: ${hiddenError.message}`);

  const hiddenIds = (hiddenData ?? []).map((r) => r.category_id);

  const query = supabaseAdmin
    .from('menu_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (hiddenIds.length > 0) {
    query.not('id', 'in', `(${hiddenIds.join(',')})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`[MenuCategoryRepo] findVisibleCategoriesForBranch: ${error.message}`);
  return data ?? [];
}

// ─── Mutations ────────────────────────────────────────────────

export async function createCategory(
  tenantId: string,
  dto: CreateMenuCategoryDto,
  createdBy: string
): Promise<MenuCategory> {
  const { data, error } = await supabaseAdmin
    .from('menu_categories')
    .insert({
      tenant_id:  tenantId,
      parent_id:  dto.parent_id ?? null,
      name:       dto.name,
      slug:       dto.slug,
      description: dto.description ?? null,
      image_url:  dto.image_url ?? null,
      sort_order: dto.sort_order ?? 0,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, tenantId, dto }, 'createCategory failed');
    throw new Error(`[MenuCategoryRepo] createCategory: ${error.message}`);
  }

  return data;
}

export async function updateCategory(
  tenantId: string,
  categoryId: string,
  dto: UpdateMenuCategoryDto,
  updatedBy: string
): Promise<MenuCategory> {
  const { version_num, ...updateData } = dto;
  
  // Optimistic locking: Must match existing version_num, then increment
  const { data, error } = await supabaseAdmin
    .from('menu_categories')
    .update({ 
      ...updateData,
      updated_by: updatedBy,
      version_num: version_num + 1 
    })
    .eq('tenant_id', tenantId)
    .eq('id', categoryId)
    .eq('version_num', version_num)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) throw new Error(`[MenuCategoryRepo] updateCategory: ${error.message}`);
  if (!data) throw new Error(`[MenuCategoryRepo] updateCategory: Concurrency conflict or category not found`);
  
  return data;
}

export async function softDeleteCategory(
  tenantId: string, 
  categoryId: string,
  deletedBy: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('menu_categories')
    .update({ 
      deleted_at: new Date().toISOString(), 
      is_active: false,
      updated_by: deletedBy 
    })
    .eq('tenant_id', tenantId)
    .eq('id', categoryId);

  if (error) throw new Error(`[MenuCategoryRepo] softDeleteCategory: ${error.message}`);
}

export async function restoreCategory(
  tenantId: string,
  categoryId: string,
  restoredBy: string,
  version_num: number
): Promise<MenuCategory> {
  const { data, error } = await supabaseAdmin
    .from('menu_categories')
    .update({ 
      deleted_at: null, 
      is_active: true,
      updated_by: restoredBy,
      version_num: version_num + 1
    })
    .eq('tenant_id', tenantId)
    .eq('id', categoryId)
    .eq('version_num', version_num)
    .select()
    .maybeSingle();

  if (error) throw new Error(`[MenuCategoryRepo] restoreCategory: ${error.message}`);
  if (!data) throw new Error(`[MenuCategoryRepo] restoreCategory: Concurrency conflict or category not found`);

  return data;
}

// ─── Branch Visibility ────────────────────────────────────────

export async function setCategoryBranchVisibility(
  tenantId: string,
  categoryId: string,
  branchId: string,
  isVisible: boolean,
  sortOrder?: number
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('menu_category_branch_visibility')
    .upsert(
      {
        tenant_id:   tenantId,
        branch_id:   branchId,
        category_id: categoryId,
        is_visible:  isVisible,
        sort_order:  sortOrder ?? null,
      },
      { onConflict: 'tenant_id,branch_id,category_id' }
    );

  if (error) throw new Error(`[MenuCategoryRepo] setCategoryBranchVisibility: ${error.message}`);
}

export async function getBranchVisibilityForCategory(
  tenantId: string,
  categoryId: string
): Promise<MenuCategoryBranchVisibility[]> {
  const { data, error } = await supabaseAdmin
    .from('menu_category_branch_visibility')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('category_id', categoryId);

  if (error) throw new Error(`[MenuCategoryRepo] getBranchVisibilityForCategory: ${error.message}`);
  return data ?? [];
}
