// ============================================================
// src/modules/menu/services/menu.service.ts
// Core orchestration service for the menu foundation.
// Handles business rules — never calls the DB directly.
// ============================================================

import { logger } from '../../../shared/utils/logger';
import { AppError } from '../../../shared/errors/AppError';
import {
  findCategoriesByTenant,
  findCategoryById,
  findCategoryBySlug,
  findVisibleCategoriesForBranch,
  createCategory,
  updateCategory,
  softDeleteCategory,
  setCategoryBranchVisibility,
} from '../repositories/menu-category.repository';
import {
  findItemsByTenant,
  findItemById,
  findItemBySlug,
  findItemBySku,
  findBranchItemOverride,
  findAllBranchItemOverrides,
  createMenuItem,
  updateMenuItem,
  softDeleteMenuItem,
  upsertBranchItemOverride,
  deleteBranchItemOverride,
  replaceItemModifierGroups,
  findModifierGroupIdsForItem,
} from '../repositories/menu-item.repository';
import {
  findModifierGroupsWithOptions,
  createModifierGroup,
  updateModifierGroup,
  softDeleteModifierGroup,
  createModifierOption,
  updateModifierOption,
  softDeleteModifierOption,
  upsertBranchModifierOptionOverride,
  upsertBranchModifierGroupOverride,
  findBranchModifierOverrides,
  findBranchModifierGroupOverrides,
} from '../repositories/modifier.repository';
import type {
  MenuCategory, MenuCategoryTree, MenuItem, EffectiveMenuItem,
  ModifierGroupWithOptions, ModifierOption,
} from '../menu.types';
import type {
  CreateMenuCategoryDto, UpdateMenuCategoryDto, SetCategoryBranchVisibilityDto,
  CreateMenuItemDto, UpdateMenuItemDto, MenuItemListQuery,
  CreateModifierGroupDto, UpdateModifierGroupDto,
  CreateModifierOptionDto, UpdateModifierOptionDto,
  SetBranchItemOverrideDto, SetBranchModifierOptionOverrideDto, SetBranchModifierGroupOverrideDto,
  BranchMenuQuery,
} from '../menu.dtos';

// ─── Category Service ─────────────────────────────────────────

export async function getCategoryTree(tenantId: string): Promise<MenuCategoryTree[]> {
  const all = await findCategoriesByTenant(tenantId);

  const map = new Map<string, MenuCategoryTree>();
  for (const cat of all) map.set(cat.id, { ...cat, children: [] });

  const roots: MenuCategoryTree[] = [];
  for (const cat of map.values()) {
    if (!cat.parent_id) {
      roots.push(cat);
    } else {
      const parent = map.get(cat.parent_id);
      if (parent) parent.children.push(cat);
    }
  }

  return roots;
}

export async function getVisibleCategoriesForBranch(
  tenantId: string,
  branchId: string
): Promise<MenuCategory[]> {
  return findVisibleCategoriesForBranch(tenantId, branchId);
}

export async function createMenuCategory(
  tenantId: string,
  dto: CreateMenuCategoryDto,
  createdBy: string
): Promise<MenuCategory> {
  // Guard: slug uniqueness
  const existing = await findCategoryBySlug(tenantId, dto.slug);
  if (existing) throw new AppError('CONFLICT', `Category slug '${dto.slug}' already exists`, 409);

  // Guard: parent must belong to same tenant
  if (dto.parent_id) {
    const parent = await findCategoryById(tenantId, dto.parent_id);
    if (!parent) throw new AppError('NOT_FOUND', 'Parent category not found', 404);
  }

  return createCategory(tenantId, dto, createdBy);
}

export async function updateMenuCategory(
  tenantId: string,
  categoryId: string,
  dto: UpdateMenuCategoryDto
): Promise<MenuCategory> {
  const existing = await findCategoryById(tenantId, categoryId);
  if (!existing) throw new AppError('NOT_FOUND', 'Category not found', 404);

  if (dto.slug && dto.slug !== existing.slug) {
    const slugConflict = await findCategoryBySlug(tenantId, dto.slug);
    if (slugConflict) throw new AppError('CONFLICT', `Slug '${dto.slug}' is already in use`, 409);
  }

  // Prevent circular parent assignment
  if (dto.parent_id === categoryId) {
    throw new AppError('VALIDATION_ERROR', 'A category cannot be its own parent', 400);
  }

  return updateCategory(tenantId, categoryId, dto);
}

export async function deleteMenuCategory(tenantId: string, categoryId: string): Promise<void> {
  const existing = await findCategoryById(tenantId, categoryId);
  if (!existing) throw new AppError('NOT_FOUND', 'Category not found', 404);
  await softDeleteCategory(tenantId, categoryId);
}

export async function setCategoryVisibilityForBranch(
  tenantId: string,
  categoryId: string,
  dto: SetCategoryBranchVisibilityDto
): Promise<void> {
  const existing = await findCategoryById(tenantId, categoryId);
  if (!existing) throw new AppError('NOT_FOUND', 'Category not found', 404);
  await setCategoryBranchVisibility(tenantId, categoryId, dto.branch_id, dto.is_visible, dto.sort_order ?? undefined);
}

// ─── Menu Item Service ────────────────────────────────────────

export async function listMenuItems(
  tenantId: string,
  query: MenuItemListQuery
): Promise<{ data: MenuItem[]; total: number; page: number; limit: number }> {
  const result = await findItemsByTenant(tenantId, query);
  return { ...result, page: query.page ?? 1, limit: query.limit ?? 50 };
}

export async function getMenuItemById(
  tenantId: string,
  itemId: string
): Promise<MenuItem> {
  const item = await findItemById(tenantId, itemId);
  if (!item) throw new AppError('NOT_FOUND', 'Menu item not found', 404);
  return item;
}

export async function createNewMenuItem(
  tenantId: string,
  dto: CreateMenuItemDto,
  createdBy: string
): Promise<MenuItem> {
  // Guard: slug uniqueness
  const slugConflict = await findItemBySlug(tenantId, dto.slug);
  if (slugConflict) throw new AppError('CONFLICT', `Item slug '${dto.slug}' already exists`, 409);

  // Guard: SKU uniqueness
  if (dto.sku) {
    const skuConflict = await findItemBySku(tenantId, dto.sku);
    if (skuConflict) throw new AppError('CONFLICT', `SKU '${dto.sku}' already exists`, 409);
  }

  const item = await createMenuItem(tenantId, dto, createdBy);

  // Link modifier groups if provided
  if (dto.modifier_group_ids?.length) {
    await replaceItemModifierGroups(tenantId, item.id, dto.modifier_group_ids);
  }

  logger.info({ tenantId, itemId: item.id }, 'Menu item created');
  return item;
}

export async function updateExistingMenuItem(
  tenantId: string,
  itemId: string,
  dto: UpdateMenuItemDto
): Promise<MenuItem> {
  const existing = await findItemById(tenantId, itemId);
  if (!existing) throw new AppError('NOT_FOUND', 'Menu item not found', 404);

  if (dto.slug && dto.slug !== existing.slug) {
    const conflict = await findItemBySlug(tenantId, dto.slug);
    if (conflict) throw new AppError('CONFLICT', `Slug '${dto.slug}' is already in use`, 409);
  }

  if (dto.sku && dto.sku !== existing.sku) {
    const conflict = await findItemBySku(tenantId, dto.sku);
    if (conflict) throw new AppError('CONFLICT', `SKU '${dto.sku}' already in use`, 409);
  }

  return updateMenuItem(tenantId, itemId, dto);
}

export async function deleteMenuItem(tenantId: string, itemId: string): Promise<void> {
  const existing = await findItemById(tenantId, itemId);
  if (!existing) throw new AppError('NOT_FOUND', 'Menu item not found', 404);
  await softDeleteMenuItem(tenantId, itemId);
}

export async function linkModifierGroupsToItem(
  tenantId: string,
  itemId: string,
  groupIds: string[]
): Promise<void> {
  const existing = await findItemById(tenantId, itemId);
  if (!existing) throw new AppError('NOT_FOUND', 'Menu item not found', 404);
  await replaceItemModifierGroups(tenantId, itemId, groupIds);
}

// ─── Branch Override Service ──────────────────────────────────

export async function setBranchItemOverride(
  tenantId: string,
  branchId: string,
  itemId: string,
  dto: SetBranchItemOverrideDto
): Promise<void> {
  const item = await findItemById(tenantId, itemId);
  if (!item) throw new AppError('NOT_FOUND', 'Menu item not found', 404);

  if (Object.keys(dto).length === 0) {
    // Empty override = clear override (reset to tenant defaults)
    await deleteBranchItemOverride(tenantId, branchId, itemId);
    return;
  }

  await upsertBranchItemOverride(tenantId, branchId, itemId, dto);
}

export async function setBranchModifierOptionOverride(
  tenantId: string,
  branchId: string,
  modifierOptionId: string,
  dto: SetBranchModifierOptionOverrideDto
): Promise<void> {
  await upsertBranchModifierOptionOverride(tenantId, branchId, modifierOptionId, dto);
}

export async function setBranchModifierGroupOverride(
  tenantId: string,
  branchId: string,
  modifierGroupId: string,
  dto: SetBranchModifierGroupOverrideDto
): Promise<void> {
  await upsertBranchModifierGroupOverride(tenantId, branchId, modifierGroupId, dto.is_available);
}

// ─── Effective Branch Menu Assembly ──────────────────────────
/**
 * Assembles the fully resolved effective menu for a branch.
 * Merges base item data with branch overrides and modifier group data.
 *
 * Design notes:
 * - Loads all overrides in one batch query (avoids N+1)
 * - Caller filters by availability/service type after assembly
 * - This is the canonical data source for POS, KDS, ordering
 */
export async function getEffectiveMenuForBranch(
  tenantId: string,
  query: BranchMenuQuery
): Promise<EffectiveMenuItem[]> {
  // 1. Load all items for the tenant
  const { data: items } = await findItemsByTenant(tenantId, {
    category_id: query.category_id,
    status:      query.include_unavailable ? undefined : 'active',
    search:      query.search,
    limit:       500, // Conservative limit; paginate at router level
  });

  if (items.length === 0) return [];

  // 2. Batch load all branch overrides for this branch
  const overrides = await findAllBranchItemOverrides(tenantId, query.branch_id);
  const overrideMap = new Map(overrides.map((o) => [o.item_id, o]));

  // 3. Collect all unique modifier group IDs across all items
  const itemIds       = items.map((i) => i.id);
  const groupIdSets   = await Promise.all(
    itemIds.map((id) => findModifierGroupIdsForItem(tenantId, id))
  );
  const allGroupIds   = [...new Set(groupIdSets.flat())];

  // 4. Batch load modifier groups + options
  const modGroups     = await findModifierGroupsWithOptions(tenantId, allGroupIds);
  const groupMap      = new Map(modGroups.map((g) => [g.id, g]));

  // 5. Load branch-level modifier group overrides
  const modGroupOverrides = await findBranchModifierGroupOverrides(tenantId, query.branch_id, allGroupIds);
  const modGroupOverrideMap = new Map(modGroupOverrides.map((o) => [o.modifier_group_id, o]));

  // 6. Load branch-level modifier option overrides
  const allOptionIds = modGroups.flatMap((g) => g.options.map((o) => o.id));
  const modOptOverrides = await findBranchModifierOverrides(tenantId, query.branch_id, allOptionIds);
  const modOptOverrideMap = new Map(modOptOverrides.map((o) => [o.modifier_option_id, o]));

  // 7. Assemble effective items
  const result: EffectiveMenuItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item       = items[i];
    const override   = overrideMap.get(item.id);
    const groupIds   = groupIdSets[i];

    const effectivePrice     = override?.override_price  ?? item.base_price;
    const effectiveAvailable = override?.is_available    ?? (item.status === 'active');
    const effectiveSortOrder = override?.sort_order      ?? item.sort_order;
    const effectiveTaxGroup  = override?.tax_group_id    ?? item.tax_group_id;

    // Apply branch override to modifier groups + options
    const effectiveModGroups: ModifierGroupWithOptions[] = groupIds
      .map((gid) => {
        const group = groupMap.get(gid);
        if (!group) return null;

        const groupOverride = modGroupOverrideMap.get(gid);
        if (groupOverride && !groupOverride.is_available) return null; // Group hidden for branch

        const effectiveOptions: ModifierOption[] = group.options
          .filter((opt) => {
            const optOverride = modOptOverrideMap.get(opt.id);
            if (optOverride?.is_available === false) return false;
            return opt.is_active;
          })
          .map((opt) => {
            const optOverride = modOptOverrideMap.get(opt.id);
            return {
              ...opt,
              price_delta: optOverride?.override_price_delta ?? opt.price_delta,
            };
          });

        return { ...group, options: effectiveOptions };
      })
      .filter((g): g is ModifierGroupWithOptions => g !== null);

    result.push({
      id:                    item.id,
      tenant_id:             tenantId,
      branch_id:             query.branch_id,
      category_id:           item.category_id,
      name:                  item.name,
      slug:                  item.slug,
      description:           item.description,
      short_description:     item.short_description,
      sku:                   item.sku,
      effective_price:       effectivePrice,
      pricing_type:          item.pricing_type,
      effective_tax_group_id: effectiveTaxGroup,
      dietary_tags:          item.dietary_tags,
      spice_level:           item.spice_level,
      prep_time_minutes:     item.prep_time_minutes,
      is_available:          effectiveAvailable,
      is_featured:           item.is_featured,
      image_url:             item.image_url,
      thumbnail_url:         item.thumbnail_url,
      sort_order:            effectiveSortOrder,
      modifier_groups:       effectiveModGroups,
    });
  }

  // Filter by availability if needed
  if (!query.include_unavailable) {
    return result.filter((i) => i.is_available);
  }

  return result;
}

// ─── Modifier Group/Option Service ────────────────────────────

export async function createNewModifierGroup(
  tenantId: string,
  dto: CreateModifierGroupDto
): Promise<ModifierGroupWithOptions> {
  const group = await createModifierGroup(tenantId, dto);

  const options = [];
  if (dto.options?.length) {
    for (const optDto of dto.options) {
      const opt = await createModifierOption(tenantId, {
        ...optDto,
        modifier_group_id: group.id,
      });
      options.push(opt);
    }
  }

  return { ...group, options };
}

export async function updateExistingModifierGroup(
  tenantId: string,
  groupId: string,
  dto: UpdateModifierGroupDto
): Promise<ModifierGroupWithOptions> {
  const [updated, groupIds] = await Promise.all([
    updateModifierGroup(tenantId, groupId, dto),
    findModifierGroupsWithOptions(tenantId, [groupId]),
  ]);
  const existing = groupIds[0];
  return { ...updated, options: existing?.options ?? [] };
}

export async function addOptionToGroup(
  tenantId: string,
  dto: CreateModifierOptionDto
): Promise<ModifierOption> {
  return createModifierOption(tenantId, dto);
}

export async function updateModifierOptionData(
  tenantId: string,
  optionId: string,
  dto: UpdateModifierOptionDto
): Promise<ModifierOption> {
  return updateModifierOption(tenantId, optionId, dto);
}
