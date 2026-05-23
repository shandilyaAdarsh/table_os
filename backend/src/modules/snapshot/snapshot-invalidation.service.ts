// ============================================================
// src/modules/snapshot/snapshot-invalidation.service.ts
// Snapshot cache invalidation interface and stub.
//
// Architecture:
//   - Phase 2: Stubs only — CDN cache headers provide TTL-based
//     invalidation (max-age=60, stale-while-revalidate=300)
//   - Phase 3: CDN purge API calls will be wired here on mutation
//   - Phase 4: Redis pub/sub invalidation will be added here
//
// All invalidation logic flows through this service.
// Mutation handlers MUST call the relevant method here after
// any successful write to ensure cache consistency.
//
// Per cache_and_invalidation_strategy.md.
// ============================================================

import { logger } from '../../shared/utils/logger';

// ─── Invalidation event types ─────────────────────────────────

export type SnapshotInvalidationScope =
  | { scope: 'branch'; tenantId: string; branchId: string }
  | { scope: 'tenant'; tenantId: string };

// ─── Cache backend interface (for future Redis/CDN injection) ──

export interface SnapshotCacheBackend {
  /**
   * Purge snapshot cache for a specific branch.
   */
  purgeBranch(tenantId: string, branchId: string): Promise<void>;

  /**
   * Purge all snapshot caches for all branches belonging to a tenant.
   * Used when base-menu entities change (categories, items).
   */
  purgeTenant(tenantId: string): Promise<void>;
}

// ─── No-op stub (Phase 2) ─────────────────────────────────────

/**
 * Phase 2 no-op implementation.
 * CDN cache headers (Cache-Control: max-age=60) provide
 * time-bounded invalidation. Explicit purge is not yet wired.
 *
 * Replace this with a real implementation in Phase 3:
 *   - CdnPurgeCacheBackend (Cloudflare / Vercel purge API)
 *   - RedisCacheBackend (pub/sub invalidation)
 */
class NoOpCacheBackend implements SnapshotCacheBackend {
  async purgeBranch(tenantId: string, branchId: string): Promise<void> {
    logger.debug({ tenantId, branchId }, '[SnapshotInvalidation] STUB: purgeBranch (no-op)');
  }

  async purgeTenant(tenantId: string): Promise<void> {
    logger.debug({ tenantId }, '[SnapshotInvalidation] STUB: purgeTenant (no-op)');
  }
}

// ─── Invalidation service ─────────────────────────────────────

export class SnapshotInvalidationService {
  private readonly backend: SnapshotCacheBackend;

  constructor(backend: SnapshotCacheBackend = new NoOpCacheBackend()) {
    this.backend = backend;
  }

  /**
   * Invalidate snapshot for a specific branch.
   * Call after: branch item override, branch category override,
   * branch price override, or branch modifier override changes.
   */
  async invalidateBranchSnapshot(tenantId: string, branchId: string): Promise<void> {
    logger.info({ tenantId, branchId }, '[SnapshotInvalidation] Invalidating branch snapshot');
    try {
      await this.backend.purgeBranch(tenantId, branchId);
    } catch (err) {
      // Invalidation failures are logged but never rethrown.
      // A failed purge means stale cache — not a service failure.
      logger.error(
        { tenantId, branchId, err },
        '[SnapshotInvalidation] Failed to purge branch snapshot cache'
      );
    }
  }

  /**
   * Invalidate snapshots for ALL branches in a tenant.
   * Call after: base menu item changes, base category changes,
   * tax strategy changes, or any tenant-wide data mutation.
   */
  async invalidateTenantSnapshots(tenantId: string): Promise<void> {
    logger.info({ tenantId }, '[SnapshotInvalidation] Invalidating all tenant branch snapshots');
    try {
      await this.backend.purgeTenant(tenantId);
    } catch (err) {
      logger.error(
        { tenantId, err },
        '[SnapshotInvalidation] Failed to purge tenant snapshot caches'
      );
    }
  }

  /**
   * Invalidate based on a resolved scope event.
   * Used by mutation hooks to decouple event type from invalidation logic.
   */
  async invalidate(event: SnapshotInvalidationScope): Promise<void> {
    if (event.scope === 'branch') {
      await this.invalidateBranchSnapshot(event.tenantId, event.branchId);
    } else {
      await this.invalidateTenantSnapshots(event.tenantId);
    }
  }
}

// ─── Singleton instance (Phase 2: no-op backend) ─────────────

/**
 * Shared singleton invalidation service.
 * Swap the backend by calling createSnapshotInvalidationService()
 * with a real backend when Phase 3 CDN purge is ready.
 */
export const snapshotInvalidationService = new SnapshotInvalidationService();

/**
 * Factory for injecting a real backend in production or tests.
 */
export function createSnapshotInvalidationService(
  backend: SnapshotCacheBackend
): SnapshotInvalidationService {
  return new SnapshotInvalidationService(backend);
}
