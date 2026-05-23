// ============================================================
// src/modules/overrides/repositories/branch-price-override.repository.ts
// Repository for branch pricing overrides.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type { BranchPriceOverride } from '../overrides.types';
import type { CreateBranchPriceOverrideDto, UpdateBranchPriceOverrideDto } from '../overrides.dtos';

const OCC_CONFLICT_MSG = 'Resource was modified by another request. Reload and retry.';

export class BranchPriceOverrideRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createPriceOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchPriceOverrideDto
  ): Promise<BranchPriceOverride> {
    const { data, error } = await this.supabase
      .from('branch_price_overrides')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        branch_id: payload.branch_id,
        menu_item_id: payload.menu_item_id,
        price_minor: payload.price_minor,
        currency: payload.currency,
        starts_at: payload.starts_at,
        ends_at: payload.ends_at || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23P01' || error.code === '23505') {
        throw new AppError(
          'Overlap conflict: Overlapping active branch pricing windows detected for this branch, item, and currency.',
          409,
          ErrorCode.CONFLICT,
          true,
          { detail: error.details }
        );
      }
      throw new AppError('Failed to create branch price override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchPriceOverride;
  }

  async getPriceOverrideById(tenantId: string, id: string): Promise<BranchPriceOverride> {
    const { data, error } = await this.supabase
      .from('branch_price_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Branch price override');
      throw new AppError('Failed to fetch branch price override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchPriceOverride;
  }

  async listPriceOverrides(
    tenantId: string,
    filters: { branch_id?: string; menu_item_id?: string; page?: number; limit?: number } = {}
  ): Promise<{ data: BranchPriceOverride[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('branch_price_overrides')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id);
    }
    if (filters.menu_item_id) {
      query = query.eq('menu_item_id', filters.menu_item_id);
    }

    const { data, error, count } = await query
      .order('starts_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list branch price overrides', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as BranchPriceOverride[],
      count: count ?? 0,
    };
  }

  async updatePriceOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchPriceOverrideDto
  ): Promise<BranchPriceOverride> {
    const updatePayload: Record<string, any> = {
      updated_by: userId,
      version_num: payload.version_num + 1,
    };

    if (payload.price_minor !== undefined) updatePayload.price_minor = payload.price_minor;
    if (payload.ends_at !== undefined) updatePayload.ends_at = payload.ends_at;

    const { data, error } = await this.supabase
      .from('branch_price_overrides')
      .update(updatePayload)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', payload.version_num)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
      }
      if (error.code === '23P01' || error.code === '23505') {
        throw new AppError(
          'Overlap conflict: Overlapping active branch pricing windows detected for this branch, item, and currency.',
          409,
          ErrorCode.CONFLICT,
          true,
          { detail: error.details }
        );
      }
      throw new AppError('Failed to update branch price override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchPriceOverride;
  }

  async softDeletePriceOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('branch_price_overrides')
      .update({
        deleted_at: new Date().toISOString(),
        updated_by: userId,
        version_num: versionNum + 1,
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', versionNum)
      .is('deleted_at', null)
      .select();

    if (error) {
      throw new AppError('Failed to soft delete branch price override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  async restorePriceOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<BranchPriceOverride> {
    const { data, error } = await this.supabase
      .from('branch_price_overrides')
      .update({
        deleted_at: null,
        updated_by: userId,
        version_num: versionNum + 1,
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', versionNum)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
      }
      if (error.code === '23P01' || error.code === '23505') {
        throw new AppError(
          'Overlap conflict: Overlapping active branch pricing windows detected for this branch, item, and currency.',
          409,
          ErrorCode.CONFLICT,
          true,
          { detail: error.details }
        );
      }
      throw new AppError('Failed to restore branch price override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchPriceOverride;
  }
}
