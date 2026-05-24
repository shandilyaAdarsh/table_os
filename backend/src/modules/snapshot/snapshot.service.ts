// ============================================================
// src/modules/snapshot/snapshot.service.ts
// Snapshot service: orchestrates resolution, serialization,
// hashing, and performance instrumentation.
//
// Rules:
//   - Delegates resolution to BranchMenuResolutionService (no N+1)
//   - Delegates serialization to snapshot.serializer
//   - Computes SHA-256 hash via snapshot-hash.util
//   - Records timing metrics for benchmarking
//   - Contains ZERO business logic of its own
//
// Per performance_guarantees.md — O(n) resolver, batch loads.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { BranchMenuResolutionService } from '../overrides/services/branch-menu-resolution.service';
import { serializeSnapshot } from './snapshot.serializer';
import { generateSnapshotHash } from './snapshot-hash.util';
import type { BranchMenuSnapshotDto } from './snapshot.dtos';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { logger } from '../../shared/utils/logger';

// ─── Performance timing record ────────────────────────────────

export interface SnapshotTimingMetrics {
  resolutionMs: number;
  serializationMs: number;
  hashingMs: number;
  totalMs: number;
}

// ─── Snapshot result ──────────────────────────────────────────

export interface SnapshotResult {
  snapshot: BranchMenuSnapshotDto;
  metrics: SnapshotTimingMetrics;
}

// ─── Snapshot service ─────────────────────────────────────────

export class SnapshotService {
  private readonly resolutionService: BranchMenuResolutionService;

  constructor(private readonly supabase: SupabaseClient) {
    this.resolutionService = new BranchMenuResolutionService(supabase);
  }

  /**
   * Generates a fully resolved, serialized, and hashed branch menu snapshot.
   *
   * Flow:
   *   1. Validate branch belongs to tenant (lightweight pre-check)
   *   2. Resolve effective menu via BranchMenuResolutionService (O(n), batch loads)
   *   3. Serialize into public DTO (strips all internal fields)
   *   4. Generate deterministic SHA-256 hash
   *   5. Return assembled snapshot + timing metrics
   */
  async generateSnapshot(params: {
    tenantId: string;
    branchId: string;
    timestamp?: string;
  }): Promise<SnapshotResult> {
    const { tenantId, branchId, timestamp } = params;
    const resolveAt = timestamp ?? new Date().toISOString();
    const overallStart = performance.now();

    // ── Step 1: Validate branch ownership ──────────────────────
    await this.validateBranchBelongsToTenant(tenantId, branchId);

    // ── Step 2: Resolve effective menu (batch parallel queries) ─
    const resolutionStart = performance.now();
    let resolved;
    try {
      resolved = await this.resolutionService.resolveEffectiveMenu({
        tenantId,
        branchId,
        timestamp: resolveAt,
      });
    } catch (err) {
      throw new AppError(
        `Snapshot resolution failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        true,
        { tenantId, branchId }
      );
    }
    const resolutionMs = performance.now() - resolutionStart;

    // ── Step 3: Serialize into public DTO ──────────────────────
    const serializationStart = performance.now();
    const payload = serializeSnapshot(resolved);
    const serializationMs = performance.now() - serializationStart;

    // ── Step 4: Generate deterministic hash ────────────────────
    const hashStart = performance.now();
    const snapshotHash = generateSnapshotHash(payload);
    const hashingMs = performance.now() - hashStart;

    const totalMs = performance.now() - overallStart;

    // ── Step 5: Assemble final snapshot DTO ────────────────────
    const snapshot: BranchMenuSnapshotDto = {
      snapshot_id: snapshotHash,
      ...payload,
      etag: snapshotHash,
    };

    const metrics: SnapshotTimingMetrics = {
      resolutionMs: Math.round(resolutionMs * 100) / 100,
      serializationMs: Math.round(serializationMs * 100) / 100,
      hashingMs: Math.round(hashingMs * 100) / 100,
      totalMs: Math.round(totalMs * 100) / 100,
    };

    logger.debug(
      { branchId, tenantId, ...metrics },
      '[SnapshotService] Snapshot generated'
    );

    return { snapshot, metrics };
  }

  /**
   * Defense-in-depth: verify branch belongs to tenant before resolving.
   * Lightweight — selects only the branch id column.
   */
  private async validateBranchBelongsToTenant(
    tenantId: string,
    branchId: string
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new AppError(
        `Branch validation failed: ${error.message}`,
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        true
      );
    }

    if (!data) {
      throw new AppError(
        'Branch not found or does not belong to this tenant',
        404,
        ErrorCode.NOT_FOUND,
        true
      );
    }
  }
}
