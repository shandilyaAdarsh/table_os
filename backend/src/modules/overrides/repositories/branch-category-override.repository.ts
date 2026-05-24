// ============================================================
// src/modules/overrides/repositories/branch-category-override.repository.ts
// Repository for branch category visibility overrides.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type { BranchCategoryOverride } from '../overrides.types';
import type { CreateBranchCategoryOverrideDto, UpdateBranchCategoryOverrideDto } from '../overrides.dtos';

const OCC_CONFLICT_MSG = 'Resource was modified by another request. Reload and retry.';

export class BranchCategoryOverrideRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createCategoryOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchCategoryOverrideDto
  ): Promise<BranchCategoryOverride> {
    const { data, error } = await this.supabase
      .from('branch_category_overrides')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        branch_id: payload.branch_id,
        category_id: payload.category_id,
        is_visible: payload.is_visible,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError(
          'Override conflict: An active override already exists for this branch and category.',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw new AppError('Failed to create branch category override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchCategoryOverride;
  }

  async getCategoryOverrideById(tenantId: string, id: string): Promise<BranchCategoryOverride> {
    const { data, error } = await this.supabase
      .from('branch_category_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Branch category override');
      throw new AppError('Failed to fetch branch category override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchCategoryOverride;
  }

  async listCategoryOverrides(
    tenantId: string,
    filters: { branch_id?: string; category_id?: string; page?: number; limit?: number } = {}
  ): Promise<{ data: BranchCategoryOverride[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('branch_category_overrides')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id);
    }
    if (filters.category_id) {
      query = query.eq('category_id', filters.category_id);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list branch category overrides', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as BranchCategoryOverride[],
      count: count ?? 0,
    };
  }

  async updateCategoryOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchCategoryOverrideDto
  ): Promise<BranchCategoryOverride> {
    const { data, error } = await this.supabase
      .from('branch_category_overrides')
      .update({
        is_visible: payload.is_visible,
        updated_by: userId,
        version_num: payload.version_num + 1,
      })
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
      throw new AppError('Failed to update branch category override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchCategoryOverride;
  }

  async softDeleteCategoryOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('branch_category_overrides')
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
      throw new AppError('Failed to soft delete branch category override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  async restoreCategoryOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<BranchCategoryOverride> {
    const { data: existing, error: fetchError } = await this.supabase
      .from('branch_category_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Branch category override');
    }

    if (existing.deleted_at === null) {
      return existing as BranchCategoryOverride;
    }

    const { data: activeOverride } = await this.supabase
      .from('branch_category_overrides')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', existing.branch_id)
      .eq('category_id', existing.category_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (activeOverride) {
      throw new AppError(
        'Override conflict: An active override already exists for this branch and category.',
        409,
        ErrorCode.CONFLICT
      );
    }

    const { data, error } = await this.supabase
      .from('branch_category_overrides')
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
      throw new AppError('Failed to restore branch category override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchCategoryOverride;
  }
}
