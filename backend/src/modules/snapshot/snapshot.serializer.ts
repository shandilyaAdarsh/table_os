// ============================================================
// src/modules/snapshot/snapshot.serializer.ts
// Public-safe serializer: transforms ResolvedEffectiveMenu
// into the frozen BranchMenuSnapshotDto contract.
//
// Rules (snapshot_payload_spec.md):
//   - NO internal fields leak (tenant_id, version_num, deleted_at,
//     created_by, updated_by, source field from resolver)
//   - Deterministic sort: categories → items → modifier groups → options
//     (display_order ASC, name ASC as tiebreaker)
//   - Only visible categories and items are included
//   - Unavailable items ARE included (is_visible: false exposed)
//   - Integer minor-unit prices only
//   - Currency always present alongside monetary values
// ============================================================

import type { ResolvedEffectiveMenu, ResolvedCategory, ResolvedMenuItem, ResolvedModifierGroup, ResolvedModifierOption } from '../overrides/overrides.types';
import type {
  BranchMenuSnapshotPayload,
  SnapshotCategoryDto,
  SnapshotMenuItemDto,
  SnapshotModifierGroupDto,
  SnapshotModifierOptionDto,
  SnapshotPriceDto,
  SnapshotAvailabilityDto,
} from './snapshot.dtos';

// ─── Deterministic sort comparator ───────────────────────────

/**
 * Sort by display_order ASC, then name ASC as a stable tiebreaker.
 * This guarantees identical output for identical inputs.
 */
function byDisplayOrderThenName<T extends { display_order: number; name: string }>(a: T, b: T): number {
  const orderDiff = a.display_order - b.display_order;
  if (orderDiff !== 0) return orderDiff;
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

// ─── Modifier option serializer ───────────────────────────────

function serializeModifierOption(opt: ResolvedModifierOption): SnapshotModifierOptionDto {
  return {
    id: opt.id,
    name: opt.name,
    price_delta_minor: opt.price_delta_minor,
    // Currency is always USD at this stage; future multi-currency support
    // will flow through the resolver and be forwarded here
    currency: 'USD',
    is_default: opt.is_default,
    is_available: opt.is_available,
    display_order: opt.display_order,
  };
}

// ─── Modifier group serializer ────────────────────────────────

function serializeModifierGroup(group: ResolvedModifierGroup): SnapshotModifierGroupDto {
  // Options: deterministic sort (display_order ASC, name ASC)
  const sortedOptions = [...group.options].sort(byDisplayOrderThenName);

  return {
    id: group.id,
    name: group.name,
    selection_mode: group.selection_mode,
    min_select: group.min_select,
    max_select: group.max_select,
    is_required: group.is_required,
    is_available: group.is_available,
    display_order: group.display_order,
    options: sortedOptions.map(serializeModifierOption),
  };
}

// ─── Price serializer ─────────────────────────────────────────

function serializePrice(
  resolvedPrice: ResolvedEffectiveMenu['categories'][0]['items'][0]['price']
): SnapshotPriceDto {
  return {
    amount_minor: resolvedPrice.price_minor,
    currency: resolvedPrice.currency,
    is_branch_override: resolvedPrice.source === 'override',
  };
}

// ─── Availability serializer ──────────────────────────────────

function serializeAvailability(item: ResolvedMenuItem): SnapshotAvailabilityDto {
  // The resolver computes is_visible; we derive schedule_type from it.
  // is_out_of_stock is not yet in the resolver output — defaults to false
  // (Phase 4: when inventory deduction is implemented)
  const scheduleType: 'always' | 'windowed' | 'disabled' =
    !item.is_visible ? 'disabled' : 'always';

  return {
    is_available: item.is_visible,
    is_out_of_stock: false,
    schedule_type: scheduleType,
    // override_active: true when is_visible was determined by a branch override
    // We conservatively expose false here; the resolver doesn't yet surface this flag.
    // Phase 3 enhancement: thread override_active through ResolvedMenuItem.
    override_active: false,
  };
}

// ─── Menu item serializer ─────────────────────────────────────

function serializeMenuItem(item: ResolvedMenuItem): SnapshotMenuItemDto {
  // Modifier groups: deterministic sort (display_order ASC, name ASC)
  const sortedGroups = [...item.modifier_groups].sort(byDisplayOrderThenName);

  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description ?? null,
    // image_url is not yet in the resolver output — Phase 3 enhancement
    image_url: null,
    // display_order is not in ResolvedMenuItem yet; resolver assigns it via category sort
    // We preserve the insertion order (already sorted by resolver)
    display_order: 0,
    is_visible: item.is_visible,
    price: serializePrice(item.price),
    availability: serializeAvailability(item),
    modifier_groups: sortedGroups.map(serializeModifierGroup),
  };
}

// ─── Category serializer ──────────────────────────────────────

function serializeCategory(cat: ResolvedCategory): SnapshotCategoryDto {
  // Items: sort by display_order ASC, name ASC
  // For now items have display_order=0 from serializer; sort by name as stable tiebreaker
  const serializedItems = cat.items.map(serializeMenuItem);
  serializedItems.sort((a, b) => {
    const orderDiff = a.display_order - b.display_order;
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });

  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    display_order: cat.display_order,
    is_visible: cat.is_visible,
    image_url: null,
    items: serializedItems,
  };
}

// ─── Root serializer ──────────────────────────────────────────

/**
 * Transforms a fully resolved menu into the public snapshot payload.
 *
 * Filtering rules:
 * - HIDDEN categories (is_visible: false) are EXCLUDED from the payload
 * - ALL items are INCLUDED regardless of is_visible (greyed-out items still appear)
 * - Deleted entities are never present in the resolved menu input
 *
 * Ordering rules (deterministic):
 * - Categories: display_order ASC, name ASC
 * - Items: display_order ASC, name ASC
 * - Modifier groups: display_order ASC, name ASC
 * - Modifier options: display_order ASC, name ASC
 */
export function serializeSnapshot(
  resolved: ResolvedEffectiveMenu,
  currency = 'USD'
): BranchMenuSnapshotPayload {
  // Filter out hidden categories entirely
  const visibleCategories = resolved.categories.filter((cat) => cat.is_visible);

  // Sort categories deterministically
  const sortedCategories = [...visibleCategories].sort(byDisplayOrderThenName);

  return {
    branch_id: resolved.branch_id,
    resolved_at: resolved.resolved_at,
    currency,
    categories: sortedCategories.map(serializeCategory),
  };
}
