// ============================================================
// src/modules/menu/services/menu-recommendation.service.ts
// Domain service for resolving deterministic recommendations.
//
// Hardening guarantees:
// - resolveEffectiveMenuItemsByIds is strictly read-only
//   (no projection rebuilds, no full menu hydration)
// - Backend hard-enforces limit cap (max 10, default 5)
// - Short-TTL in-memory cache (30s) keyed by tenant:branch:sortedIds
// - Failures never block cart rendering — return empty array + log
// - Observability: latency, counts, filtered/empty rates logged
// ============================================================

import { logger } from '../../../shared/utils/logger';
import { findRecommendationsForItems } from '../repositories/menu-recommendation.repository';
import { findAnyItemById, findAllBranchItemOverrides, findModifierGroupIdsForItem } from '../repositories/menu-item.repository';
import { findModifierGroupsWithOptions, findBranchModifierGroupOverrides, findBranchModifierOverrides } from '../repositories/modifier.repository';
import type { EffectiveMenuItemRecommendation, MenuItem, EffectiveMenuItem, ModifierGroupWithOptions, ModifierOption } from '../menu.types';

// ─── Constants ─────────────────────────────────────────────────

const HARD_LIMIT_MAX = 10;
const HARD_LIMIT_DEFAULT = 5;

// Weight map for deterministic sorting when priorities match
const RECOMMENDATION_WEIGHT: Record<string, number> = {
  popular_pair: 5,
  complementary: 4,
  beverage: 3,
  upsell: 2,
  variant: 1,
};

// ─── In-Memory Cache (Point 5) ─────────────────────────────────

const CACHE_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  data: EffectiveMenuItemRecommendation[];
  expiresAt: number;
}

const recommendationCache = new Map<string, CacheEntry>();

function buildCacheKey(tenantId: string, branchId: string, cartItemIds: string[]): string {
  const sorted = [...cartItemIds].sort();
  return `${tenantId}:${branchId}:${sorted.join(',')}`;
}

function getCachedRecommendations(key: string): EffectiveMenuItemRecommendation[] | null {
  const entry = recommendationCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    recommendationCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedRecommendations(key: string, data: EffectiveMenuItemRecommendation[]): void {
  recommendationCache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  // Evict stale entries periodically (simple hygiene — keeps map bounded)
  if (recommendationCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of recommendationCache) {
      if (now > v.expiresAt) recommendationCache.delete(k);
    }
  }
}

// ─── Targeted Item Resolution (Point 2) ─────────────────────────
//
// This function is STRICTLY READ-ONLY:
// - Fetches only the specific items by ID
// - Loads only their branch overrides
// - Does NOT trigger projection rebuilds
// - Does NOT perform full menu hydration
// - Does NOT bypass or invalidate cache layers

export async function resolveEffectiveMenuItemsByIds(
  tenantId: string,
  branchId: string,
  itemIds: string[]
): Promise<EffectiveMenuItem[]> {
  if (itemIds.length === 0) return [];

  // 1. Fetch only the exact items requested (read-only point lookups)
  const rawItems = await Promise.all(
    itemIds.map(id => findAnyItemById(tenantId, id))
  );

  const items = rawItems.filter((i): i is MenuItem => i !== null);
  if (items.length === 0) return [];

  // 2. Load branch overrides (read-only batch)
  const overrides = await findAllBranchItemOverrides(tenantId, branchId);
  const overrideMap = new Map(overrides.map((o) => [o.item_id, o]));

  // 3. Modifier groups (read-only batch)
  const groupIdSets = await Promise.all(
    items.map((i) => findModifierGroupIdsForItem(tenantId, i.id))
  );
  const allGroupIds = [...new Set(groupIdSets.flat())];

  const modGroups = await findModifierGroupsWithOptions(tenantId, allGroupIds);
  const groupMap = new Map(modGroups.map((g) => [g.id, g]));

  const modGroupOverrides = await findBranchModifierGroupOverrides(tenantId, branchId, allGroupIds);
  const modGroupOverrideMap = new Map(modGroupOverrides.map((o) => [o.modifier_group_id, o]));

  const allOptionIds = modGroups.flatMap((g) => g.options.map((o) => o.id));
  const modOptOverrides = await findBranchModifierOverrides(tenantId, branchId, allOptionIds);
  const modOptOverrideMap = new Map(modOptOverrides.map((o) => [o.modifier_option_id, o]));

  // 4. Assemble effective items (pure transform, no writes)
  const result: EffectiveMenuItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const override = overrideMap.get(item.id);
    const groupIds = groupIdSets[i];

    const effectivePrice = override?.override_price ?? item.base_price;
    const effectiveAvailable = override?.is_available ?? (item.status === 'active');
    const effectiveSortOrder = override?.sort_order ?? item.sort_order;
    const effectiveTaxGroup = override?.tax_group_id ?? item.tax_group_id;

    const effectiveModGroups: ModifierGroupWithOptions[] = groupIds
      .map((gid) => {
        const group = groupMap.get(gid);
        if (!group) return null;

        const groupOverride = modGroupOverrideMap.get(gid);
        if (groupOverride && !groupOverride.is_available) return null;

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
      id: item.id,
      tenant_id: item.tenant_id,
      branch_id: branchId,
      category_id: item.category_id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      short_description: item.short_description,
      sku: item.sku,
      effective_price: effectivePrice,
      pricing_type: item.pricing_type,
      effective_tax_group_id: effectiveTaxGroup,
      dietary_tags: item.dietary_tags,
      spice_level: item.spice_level,
      prep_time_minutes: item.prep_time_minutes,
      is_available: effectiveAvailable,
      is_featured: item.is_featured,
      image_url: item.image_url,
      thumbnail_url: item.thumbnail_url,
      sort_order: effectiveSortOrder,
      modifier_groups: effectiveModGroups,
    });
  }

  return result;
}

// ─── Cart Recommendations (Points 3, 4, 5, 6, 10) ──────────────

export async function getCartRecommendations(
  tenantId: string,
  branchId: string,
  cartItemIds: string[],
  limit: number = HARD_LIMIT_DEFAULT
): Promise<EffectiveMenuItemRecommendation[]> {
  const startMs = Date.now();

  // Point 3: Hard-enforce limit cap — never trust frontend-provided limits
  const safeLimitRaw = Math.min(Math.max(1, Math.floor(limit || HARD_LIMIT_DEFAULT)), HARD_LIMIT_MAX);
  const safeLimit = Number.isFinite(safeLimitRaw) ? safeLimitRaw : HARD_LIMIT_DEFAULT;

  if (cartItemIds.length === 0) {
    logger.debug({ tenantId, branchId }, '[Recommendations] Empty cart, returning []');
    return [];
  }

  // Point 5: Check cache first
  const cacheKey = buildCacheKey(tenantId, branchId, cartItemIds);
  const cached = getCachedRecommendations(cacheKey);
  if (cached) {
    logger.debug(
      { tenantId, branchId, cacheHit: true, count: cached.length, latencyMs: Date.now() - startMs },
      '[Recommendations] Cache hit'
    );
    return cached.slice(0, safeLimit);
  }

  // Point 4: Wrap entire resolution in try/catch — failures must NEVER block cart
  try {
    // 1. Fetch raw recommendations mapped from cart items
    const allRecs = await findRecommendationsForItems(tenantId, cartItemIds, 100);

    // 2. Filter out circular / already in cart, deduplicate
    const cartSet = new Set(cartItemIds);
    const candidatesMap = new Map<string, typeof allRecs[0]>();

    for (const rec of allRecs) {
      if (cartSet.has(rec.recommended_menu_item_id)) continue;

      const existing = candidatesMap.get(rec.recommended_menu_item_id);
      if (
        !existing ||
        rec.priority > existing.priority ||
        (rec.priority === existing.priority &&
          (RECOMMENDATION_WEIGHT[rec.recommendation_type] || 0) >
            (RECOMMENDATION_WEIGHT[existing.recommendation_type] || 0))
      ) {
        candidatesMap.set(rec.recommended_menu_item_id, rec);
      }
    }

    const candidateRecs = Array.from(candidatesMap.values());
    if (candidateRecs.length === 0) {
      // Point 10: Log empty recommendation rate
      logger.info(
        { tenantId, branchId, cartItemCount: cartItemIds.length, rawRecCount: allRecs.length, latencyMs: Date.now() - startMs },
        '[Recommendations] No candidates after dedup/filtering'
      );
      setCachedRecommendations(cacheKey, []);
      return [];
    }

    // 3. Resolve effective branch items (read-only, no projection rebuilds)
    const itemIdsToResolve = candidateRecs.map(r => r.recommended_menu_item_id);
    const effectiveItems = await resolveEffectiveMenuItemsByIds(tenantId, branchId, itemIdsToResolve);

    // 4. Map back, filter unavailable, sort, and limit
    const effectiveMap = new Map(effectiveItems.map(i => [i.id, i]));

    let filteredUnavailableCount = 0;

    const resolvedRecs: EffectiveMenuItemRecommendation[] = candidateRecs
      .map(rec => {
        const effectiveItem = effectiveMap.get(rec.recommended_menu_item_id);
        if (!effectiveItem || !effectiveItem.is_available) {
          filteredUnavailableCount++;
          return null;
        }

        return {
          ...effectiveItem,
          recommendation_type: rec.recommendation_type,
          currency: 'INR', // ISO 4217 — stable contract field
          _priority: rec.priority,
          _createdAt: rec.created_at,
        };
      })
      .filter((r): r is EffectiveMenuItemRecommendation & { _priority: number; _createdAt: string } => r !== null)
      .sort((a, b) => {
        // Priority DESC
        if (a._priority !== b._priority) return b._priority - a._priority;
        // Type Weight DESC
        const weightA = RECOMMENDATION_WEIGHT[a.recommendation_type] || 0;
        const weightB = RECOMMENDATION_WEIGHT[b.recommendation_type] || 0;
        if (weightA !== weightB) return weightB - weightA;
        // CreatedAt ASC (older first)
        return new Date(a._createdAt).getTime() - new Date(b._createdAt).getTime();
      })
      .slice(0, safeLimit)
      .map(({ _priority, _createdAt, ...rest }) => rest);

    // Point 5: Cache the resolved result
    setCachedRecommendations(cacheKey, resolvedRecs);

    // Point 10: Observability — log resolver metrics
    const latencyMs = Date.now() - startMs;
    logger.info(
      {
        tenantId,
        branchId,
        cartItemCount: cartItemIds.length,
        rawRecCount: allRecs.length,
        candidateCount: candidateRecs.length,
        filteredUnavailableCount,
        returnedCount: resolvedRecs.length,
        latencyMs,
        cacheHit: false,
      },
      '[Recommendations] Resolved successfully'
    );

    return resolvedRecs;
  } catch (err) {
    // Point 4: Recommendation failures must NEVER block cart/checkout/order
    const latencyMs = Date.now() - startMs;
    logger.warn(
      {
        tenantId,
        branchId,
        cartItemCount: cartItemIds.length,
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      },
      '[Recommendations] Resolver failed — returning empty array (non-critical)'
    );
    return [];
  }
}
