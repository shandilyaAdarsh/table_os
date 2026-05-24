// ============================================================
// src/modules/snapshot/snapshot.serializer.ts
// Public-safe serializer: transforms ResolvedEffectiveMenu
// into the frozen BranchMenuSnapshotDto contract.
//
// Rules (snapshot_payload_spec.md):
//   - NO internal fields leak
//   - Deterministic sort: categories, items, modifier groups, options
//   - Flattened JSON arrays for frontend repository integration
//   - Relational parent IDs injected (category_id, menu_item_id, etc.)
import type { 
  ResolvedEffectiveMenu, 
  ResolvedMenuItem
} from '../overrides/overrides.types';
import type {
  BranchMenuSnapshotPayload,
  SnapshotCategoryDto,
  SnapshotMenuItemDto,
  SnapshotModifierGroupDto,
  SnapshotModifierOptionDto,
  SnapshotPriceDto,
  SnapshotAvailabilityDto,
  SnapshotTaxProfileDto
} from './snapshot.dtos';

// ─── Deterministic sort comparator ───────────────────────────

function byDisplayOrderThenName<T extends { display_order: number; name: string }>(a: T, b: T): number {
  const orderDiff = a.display_order - b.display_order;
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

// ─── Utility Serializers ──────────────────────────────────────

function serializePrice(
  resolvedPrice: ResolvedMenuItem['price']
): SnapshotPriceDto {
  return {
    amount_minor: resolvedPrice.price_minor,
    currency: resolvedPrice.currency,
    is_branch_override: resolvedPrice.source === 'override',
  };
}

function serializeAvailability(item: ResolvedMenuItem): SnapshotAvailabilityDto {
  const scheduleType: 'always' | 'windowed' | 'disabled' =
    !item.is_visible ? 'disabled' : 'always';

  return {
    is_available: item.is_visible,
    is_out_of_stock: false,
    schedule_type: scheduleType,
    override_active: false,
  };
}

// ─── Root Serializer ──────────────────────────────────────────

export function serializeSnapshot(
  resolved: ResolvedEffectiveMenu,
  currency = 'USD'
): BranchMenuSnapshotPayload {
  const flatCategories: SnapshotCategoryDto[] = [];
  const flatItems: SnapshotMenuItemDto[] = [];
  const flatModifierGroups: SnapshotModifierGroupDto[] = [];
  const flatModifierOptions: SnapshotModifierOptionDto[] = [];
  
  // Tax profiles are already flat on the resolved object
  const flatTaxProfiles: SnapshotTaxProfileDto[] = (resolved.tax_profiles || []).map(t => ({
    id: t.id,
    calculation_mode: t.calculation_mode,
    total_basis_points: t.total_basis_points,
  }));

  const visibleCategories = resolved.categories.filter((cat) => cat.is_visible);
  const sortedCategories = [...visibleCategories].sort(byDisplayOrderThenName);

  for (const cat of sortedCategories) {
    flatCategories.push({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      display_order: cat.display_order,
      is_visible: cat.is_visible,
      image_url: null,
    });

    const sortedItems = [...cat.items].sort((a, b) => {
      // Items might not have display_order yet, so default to 0 for sorting
      return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    });

    for (let itemIdx = 0; itemIdx < sortedItems.length; itemIdx++) {
      const item = sortedItems[itemIdx];
      
      flatItems.push({
        id: item.id,
        category_id: cat.id, // Relational link injected
        tax_profile_id: item.tax_profile_id,
        name: item.name,
        slug: item.slug,
        description: item.description ?? null,
        image_url: null,
        display_order: itemIdx,
        is_visible: item.is_visible,
        price: serializePrice(item.price),
        availability: serializeAvailability(item),
      });

      const sortedGroups = [...item.modifier_groups].sort(byDisplayOrderThenName);

      for (const group of sortedGroups) {
        flatModifierGroups.push({
          id: group.id,
          menu_item_id: item.id, // Relational link injected
          name: group.name,
          selection_mode: group.selection_mode,
          min_select: group.min_select,
          max_select: group.max_select,
          is_required: group.is_required,
          is_available: group.is_available,
          display_order: group.display_order,
        });

        const sortedOptions = [...group.options].sort(byDisplayOrderThenName);

        for (const opt of sortedOptions) {
          flatModifierOptions.push({
            id: opt.id,
            modifier_group_id: group.id, // Relational link injected
            name: opt.name,
            price_delta_minor: opt.price_delta_minor,
            currency: 'USD',
            is_default: opt.is_default,
            is_available: opt.is_available,
            display_order: opt.display_order,
          });
        }
      }
    }
  }

  return {
    tenant_id: resolved.tenant_id,
    branch_id: resolved.branch_id,
    generated_at: resolved.resolved_at,
    currency_code: currency,
    categories: flatCategories,
    items: flatItems,
    modifier_groups: flatModifierGroups,
    modifier_options: flatModifierOptions,
    tax_profiles: flatTaxProfiles,
  };
}
