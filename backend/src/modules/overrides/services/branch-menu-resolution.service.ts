// ============================================================
// src/modules/overrides/services/branch-menu-resolution.service.ts
// Resolver service to compute effective branch-specific menus.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { BranchMenuResolverRepository } from '../repositories/branch-menu-resolver.repository';
import { AvailabilityRepository } from '../../availability/repositories/availability.repository';
import type {
  ResolvedEffectiveMenu,
  ResolvedCategory,
  ResolvedMenuItem,
  ResolvedModifierGroup,
  ResolvedModifierOption,
  ResolvedPrice,
} from '../overrides.types';

export class BranchMenuResolutionService {
  private readonly resolverRepo: BranchMenuResolverRepository;
  private readonly availabilityRepo: AvailabilityRepository;

  constructor(supabase: SupabaseClient) {
    this.resolverRepo = new BranchMenuResolverRepository(supabase);
    this.availabilityRepo = new AvailabilityRepository(supabase);
  }

  async resolveEffectiveMenu(params: {
    tenantId: string;
    branchId: string;
    timestamp: string;
  }): Promise<ResolvedEffectiveMenu> {
    const { tenantId, branchId, timestamp } = params;
    const targetDate = new Date(timestamp);

    // ─── STEP 1: PRE-LOAD ALL SYSTEM DATA IN PARALLEL ───────────────
    const baseData = await this.resolverRepo.fetchMenuResolutionData(tenantId, branchId);

    // ─── STEP 2: PRE-LOAD LIVE ITEM AVAILABILITY BATCH ─────────────
    const itemIds = baseData.items.map((it) => it.id);
    const availabilityList = itemIds.length > 0
      ? await this.availabilityRepo.resolveItemAvailabilityBatch(tenantId, itemIds, branchId, timestamp)
      : [];

    // Map availability status by menu_item_id for fast O(1) lookup
    const availabilityMap = new Map<string, string>();
    for (const av of availabilityList) {
      availabilityMap.set(av.menu_item_id, av.status);
    }

    // ─── STEP 3: CONSTRUCT O(1) LOOKUP MAPS FOR SPARE OVERRIDES ────
    // Indexed by parent / entity ID to avoid nested O(N) loops.
    
    // Category overrides Map (category_id -> override)
    const categoryOverridesMap = new Map<string, typeof baseData.categoryOverrides[0]>();
    for (const ov of baseData.categoryOverrides) {
      categoryOverridesMap.set(ov.category_id, ov);
    }

    // Item overrides Map (menu_item_id -> override)
    const itemOverridesMap = new Map<string, typeof baseData.itemOverrides[0]>();
    for (const ov of baseData.itemOverrides) {
      itemOverridesMap.set(ov.menu_item_id, ov);
    }

    // Modifier overrides Maps (modifier_group_id -> override, modifier_option_id -> override)
    const groupOverridesMap = new Map<string, typeof baseData.modifierGroupOverrides[0]>();
    const optionOverridesMap = new Map<string, typeof baseData.modifierOptionOverrides[0]>();
    for (const ov of baseData.modifierGroupOverrides) {
      groupOverridesMap.set(ov.modifier_group_id, ov);
    }
    for (const ov of baseData.modifierOptionOverrides) {
      optionOverridesMap.set(ov.modifier_option_id, ov);
    }

    // Branch Price overrides Map (menu_item_id -> list of price overrides)
    const priceOverridesByItem = new Map<string, typeof baseData.priceOverrides>();
    for (const ov of baseData.priceOverrides) {
      const list = priceOverridesByItem.get(ov.menu_item_id) ?? [];
      list.push(ov);
      priceOverridesByItem.set(ov.menu_item_id, list);
    }

    // Base menu_item_prices Map (menu_item_id -> list of prices)
    const basePricesByItem = new Map<string, typeof baseData.prices>();
    for (const pr of baseData.prices) {
      const list = basePricesByItem.get(pr.menu_item_id) ?? [];
      list.push(pr);
      basePricesByItem.set(pr.menu_item_id, list);
    }

    // Modifier groups assignments Map (menu_item_id -> list of assignments)
    const assignmentsByItem = new Map<string, typeof baseData.assignments>();
    for (const ass of baseData.assignments) {
      const list = assignmentsByItem.get(ass.menu_item_id) ?? [];
      list.push(ass);
      assignmentsByItem.set(ass.menu_item_id, list);
    }

    // Modifier groups by ID Map
    const groupsMap = new Map<string, typeof baseData.modifierGroups[0]>();
    for (const g of baseData.modifierGroups) {
      groupsMap.set(g.id, g);
    }

    // Modifier options Map (modifier_group_id -> list of options)
    const optionsByGroup = new Map<string, typeof baseData.modifierOptions>();
    for (const opt of baseData.modifierOptions) {
      const list = optionsByGroup.get(opt.modifier_group_id) ?? [];
      list.push(opt);
      optionsByGroup.set(opt.modifier_group_id, list);
    }

    // ─── STEP 4: RESOLVE CATEGORY HIERARCHY & ENTITY OVERRIDES ─────
    const resolvedCategories: ResolvedCategory[] = [];

    // Map of categories by ID to assemble child categories / parent references easily
    const resolvedCategoriesMap = new Map<string, ResolvedCategory>();

    for (const cat of baseData.categories) {
      // Fetch branch-specific category visibility override
      const categoryOverride = categoryOverridesMap.get(cat.id);
      const isVisible = categoryOverride ? categoryOverride.is_visible : cat.is_active;

      const resolvedCategory: ResolvedCategory = {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        is_visible: isVisible,
        display_order: cat.sort_order ?? 0,
        parent_id: cat.parent_id || null,
        items: [],
      };

      resolvedCategoriesMap.set(cat.id, resolvedCategory);
      resolvedCategories.push(resolvedCategory);
    }

    // ─── STEP 5: RESOLVE MENU ITEMS WITH PRECEDENCE CHAIN ──────────
    for (const item of baseData.items) {
      // 1. Compute visibility
      const itemOverride = itemOverridesMap.get(item.id);
      const visibilityOverride = itemOverride ? itemOverride.is_visible : true;
      const liveAvailability = availabilityMap.get(item.id) ?? 'available';

      // Computed is_visible = base active status AND override visibility AND not temporarily disabled
      const isVisible =
        item.status === 'active' &&
        visibilityOverride &&
        liveAvailability !== 'temporarily_disabled';

      // 2. Precedence price resolution
      let resolvedPrice: ResolvedPrice | null = null;

      // Chain A: Sparse Branch Override Price matching timestamp
      const itemPriceOverrides = priceOverridesByItem.get(item.id) ?? [];
      const activePriceOverride = itemPriceOverrides.find((ov) => {
        const start = new Date(ov.starts_at);
        const end = ov.ends_at ? new Date(ov.ends_at) : null;
        return start <= targetDate && (end === null || end > targetDate);
      });

      if (activePriceOverride) {
        resolvedPrice = {
          price_minor: Number(activePriceOverride.price_minor),
          currency: activePriceOverride.currency,
          source: 'override',
          override_id: activePriceOverride.id,
        };
      }

      // Chain B: Base Menu Item Prices matching timestamp
      if (!resolvedPrice) {
        const itemBasePrices = basePricesByItem.get(item.id) ?? [];
        const activeBasePrices = itemBasePrices.filter((bp) => {
          const start = new Date(bp.effective_from);
          const end = bp.effective_to ? new Date(bp.effective_to) : null;
          return bp.pricing_tier === 'base' && start <= targetDate && (end === null || end > targetDate);
        });

        if (activeBasePrices.length > 0) {
          // Sort by priority (descending) then effective_from (descending)
          activeBasePrices.sort((a, b) => {
            const pDiff = (b.priority ?? 0) - (a.priority ?? 0);
            if (pDiff !== 0) return pDiff;
            return new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime();
          });

          const chosenBase = activeBasePrices[0];
          resolvedPrice = {
            price_minor: Number(chosenBase.amount_minor),
            currency: chosenBase.currency_code,
            source: 'base',
          };
        }
      }

      // Chain C: Default fallback from legacy base_price
      if (!resolvedPrice) {
        resolvedPrice = {
          price_minor: Math.round(Number(item.base_price || 0) * 100),
          currency: 'USD',
          source: 'default',
        };
      }

      // 3. Resolve item modifiers
      const resolvedModifierGroups: ResolvedModifierGroup[] = [];
      const itemAssignments = assignmentsByItem.get(item.id) ?? [];
      
      // Sort assignments by display_order ASC
      itemAssignments.sort((a, b) => a.display_order - b.display_order);

      for (const ass of itemAssignments) {
        const group = groupsMap.get(ass.modifier_group_id);
        if (!group) continue;

        // Group availability override
        const groupOverride = groupOverridesMap.get(group.id);
        const groupAvailable = groupOverride ? groupOverride.is_available : group.is_active;

        const resolvedOptions: ResolvedModifierOption[] = [];
        const groupOptions = optionsByGroup.get(group.id) ?? [];

        // Sort options by display_order ASC
        groupOptions.sort((a, b) => a.display_order - b.display_order);

        for (const opt of groupOptions) {
          // Option availability override
          const optionOverride = optionOverridesMap.get(opt.id);
          const optionAvailable = optionOverride ? optionOverride.is_available : opt.is_active;

          resolvedOptions.push({
            id: opt.id,
            name: opt.name,
            price_delta_minor: Number(opt.price_delta_minor || 0),
            is_available: optionAvailable,
            is_default: opt.is_default,
            display_order: opt.display_order,
          });
        }

        resolvedModifierGroups.push({
          id: group.id,
          name: group.name,
          selection_mode: group.selection_mode,
          min_select: group.min_select,
          max_select: group.max_select,
          is_required: group.is_required,
          is_available: groupAvailable,
          display_order: group.display_order,
          options: resolvedOptions,
        });
      }

      const resolvedMenuItem: ResolvedMenuItem = {
        id: item.id,
        name: item.name,
        description: item.description,
        slug: item.slug,
        is_visible: isVisible,
        price: resolvedPrice,
        modifier_groups: resolvedModifierGroups,
      };

      // Assign to resolved category
      const targetCategory = resolvedCategoriesMap.get(item.category_id);
      if (targetCategory) {
        targetCategory.items.push(resolvedMenuItem);
      }
    }

    // Sort categories by display_order
    resolvedCategories.sort((a, b) => a.display_order - b.display_order);

    return {
      branch_id: branchId,
      tenant_id: tenantId,
      resolved_at: timestamp,
      categories: resolvedCategories,
    };
  }
}
