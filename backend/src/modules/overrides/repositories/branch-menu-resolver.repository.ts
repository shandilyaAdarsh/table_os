// ============================================================
// src/modules/overrides/repositories/branch-menu-resolver.repository.ts
// Resolver repository to load base entities and overrides in parallel.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';

export class BranchMenuResolverRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async fetchMenuResolutionData(tenantId: string, branchId: string) {
    // Perform parallel database queries to load all base items, modifier hierarchies, and sparse branch overrides.
    // This executes in a single round-trip, avoiding nested N+1 loops.
    const [
      categoriesResult,
      itemsResult,
      pricesResult,
      groupsResult,
      optionsResult,
      assignmentsResult,
      itemOverridesResult,
      categoryOverridesResult,
      modifierGroupOverridesResult,
      modifierOptionOverridesResult,
      priceOverridesResult,
    ] = await Promise.all([
      this.supabase.from('menu_categories').select('*').eq('tenant_id', tenantId).is('deleted_at', null),
      this.supabase.from('menu_items').select('*').eq('tenant_id', tenantId).is('deleted_at', null),
      this.supabase.from('menu_item_prices').select('*').eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true),
      this.supabase.from('modifier_groups').select('*').eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true),
      this.supabase.from('modifier_options').select('*').eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true),
      this.supabase.from('menu_item_modifier_groups').select('*').eq('tenant_id', tenantId).is('deleted_at', null).eq('is_active', true),
      this.supabase.from('branch_menu_item_overrides').select('*').eq('tenant_id', tenantId).eq('branch_id', branchId).is('deleted_at', null),
      this.supabase.from('branch_category_overrides').select('*').eq('tenant_id', tenantId).eq('branch_id', branchId).is('deleted_at', null),
      this.supabase.from('branch_modifier_group_overrides').select('*').eq('tenant_id', tenantId).eq('branch_id', branchId).is('deleted_at', null),
      this.supabase.from('branch_modifier_option_overrides').select('*').eq('tenant_id', tenantId).eq('branch_id', branchId).is('deleted_at', null),
      this.supabase.from('branch_price_overrides').select('*').eq('tenant_id', tenantId).eq('branch_id', branchId).is('deleted_at', null),
    ]);

    // Error handling
    const errors = [
      { name: 'menu_categories', error: categoriesResult.error },
      { name: 'menu_items', error: itemsResult.error },
      { name: 'menu_item_prices', error: pricesResult.error },
      { name: 'modifier_groups', error: groupsResult.error },
      { name: 'modifier_options', error: optionsResult.error },
      { name: 'menu_item_modifier_groups', error: assignmentsResult.error },
      { name: 'branch_menu_item_overrides', error: itemOverridesResult.error },
      { name: 'branch_category_overrides', error: categoryOverridesResult.error },
      { name: 'branch_modifier_group_overrides', error: modifierGroupOverridesResult.error },
      { name: 'branch_modifier_option_overrides', error: modifierOptionOverridesResult.error },
      { name: 'branch_price_overrides', error: priceOverridesResult.error },
    ].filter((x) => x.error !== null);

    if (errors.length > 0) {
      throw new AppError(
        `Failed to fetch menu resolution data: ${errors.map((e) => `${e.name} (${e.error?.message})`).join(', ')}`,
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        true,
        { errors }
      );
    }

    return {
      categories: categoriesResult.data || [],
      items: itemsResult.data || [],
      prices: pricesResult.data || [],
      modifierGroups: groupsResult.data || [],
      modifierOptions: optionsResult.data || [],
      assignments: assignmentsResult.data || [],
      itemOverrides: itemOverridesResult.data || [],
      categoryOverrides: categoryOverridesResult.data || [],
      modifierGroupOverrides: modifierGroupOverridesResult.data || [],
      modifierOptionOverrides: modifierOptionOverridesResult.data || [],
      priceOverrides: priceOverridesResult.data || [],
    };
  }
}
