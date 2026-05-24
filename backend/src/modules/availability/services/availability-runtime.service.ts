// ============================================================
// src/modules/availability/services/availability-runtime.service.ts
// Service for generating lightweight runtime availability overlays.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AvailabilityRepository } from '../repositories/availability.repository';
import type { 
  AvailabilityOverlayDto, 
  AvailabilityItemDto, 
  VisibilityState, 
  ResolutionSource 
} from '../availability.dtos';
import type { ResolvedAvailabilityBatchRPC } from '../availability.types';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';

export class AvailabilityRuntimeService {
  private repo: AvailabilityRepository;

  constructor(private readonly supabase: SupabaseClient) {
    this.repo = new AvailabilityRepository(supabase);
  }

  async getBranchAvailability(tenantId: string, branchId: string): Promise<AvailabilityOverlayDto> {
    const timestamp = new Date().toISOString();
    
    // 1. Fetch all active items for the tenant.
    // We fetch purely by tenant because the availability logic acts as a mask over structural snapshots.
    // The RPC will handle evaluating any branch-specific overrides vs global defaults.
    const { data: items, error } = await this.supabase
      .from('menu_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .is('deleted_at', null);

    if (error) {
      throw new AppError(
        'Failed to fetch menu items for availability resolution',
        500,
        ErrorCode.INTERNAL_SERVER_ERROR,
        true,
        { error }
      );
    }

    const itemIds = (items || []).map(i => i.id);

    if (itemIds.length === 0) {
      return {
        branch_id: branchId,
        generated_at: timestamp,
        items: []
      };
    }

    // 2. Resolve batch availability via Postgres RPC. No N+1 queries.
    const resolved = await this.repo.resolveItemAvailabilityBatch(tenantId, itemIds, branchId, timestamp);

    // 3. Map to normalized runtime DTOs
    const mappedItems: AvailabilityItemDto[] = resolved.map(res => this.mapResolvedAvailability(res));

    return {
      branch_id: branchId,
      generated_at: timestamp,
      items: mappedItems
    };
  }

  private mapResolvedAvailability(res: ResolvedAvailabilityBatchRPC): AvailabilityItemDto {
    let visibility_state: VisibilityState;
    let is_available: boolean;

    switch (res.status) {
      case 'available':
        is_available = true;
        visibility_state = 'VISIBLE';
        break;
      case 'temporarily_disabled':
        is_available = false;
        visibility_state = 'PAUSED';
        break;
      case 'out_of_stock':
        is_available = false;
        visibility_state = 'SOLD_OUT';
        break;
      case 'unavailable_schedule':
        is_available = false;
        visibility_state = 'SCHEDULE_RESTRICTED';
        break;
      case 'unavailable_exception':
        is_available = false;
        visibility_state = 'HIDDEN';
        break;
      default:
        is_available = true;
        visibility_state = 'VISIBLE';
    }

    let resolution_source: ResolutionSource;
    if (res.source_type === 'exception') {
      resolution_source = 'EXCEPTION_RULE';
    } else if (res.source_type === 'operational_state') {
      if (res.status === 'out_of_stock') {
        resolution_source = 'STOCK_ENGINE';
      } else {
        resolution_source = 'MANUAL_OVERRIDE';
      }
    } else if (res.source_type === 'schedule') {
      resolution_source = 'SCHEDULE_ENGINE';
    } else {
      resolution_source = 'DEFAULT';
    }

    return {
      menu_item_id: res.menu_item_id,
      is_available,
      visibility_state,
      reason: res.reason,
      resolution_source,
      last_resolved_at: res.resolved_at
    };
  }
}
