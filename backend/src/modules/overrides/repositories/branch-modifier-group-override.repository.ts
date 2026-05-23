// ============================================================
// src/modules/overrides/repositories/branch-modifier-group-override.repository.ts
// Repository for branch modifier group availability overrides.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type { BranchModifierGroupOverride } from '../overrides.types';
import type { CreateBranchModifierGroupOverrideDto, UpdateBranchModifierGroupOverrideDto } from '../overrides.dtos';

const OCC_CONFLICT_MSG = 'Resource was modified by another request. Reload and retry.';

export class BranchModifierGroupOverrideRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createModifierGroupOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchModifierGroupOverrideDto
  ): Promise<BranchModifierGroupOverride> {
    const { data, error } = await this.supabase
      .from('branch_modifier_group_overrides')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        branch_id: payload.branch_id,
        modifier_group_id: payload.modifier_group_id,
        is_available: payload.is_available,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError(
          'Override conflict: An active override already exists for this branch and modifier group.',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw new AppError('Failed to create branch modifier group override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierGroupOverride;
  }

  async getModifierGroupOverrideById(tenantId: string, id: string): Promise<BranchModifierGroupOverride> {
    const { data, error } = await this.supabase
      .from('branch_modifier_group_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Branch modifier group override');
      throw new AppError('Failed to fetch branch modifier group override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierGroupOverride;
  }

  async listModifierGroupOverrides(
    tenantId: string,
    filters: { branch_id?: string; modifier_group_id?: string; page?: number; limit?: number } = {}
  ): Promise<{ data: BranchModifierGroupOverride[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('branch_modifier_group_overrides')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id);
    }
    if (filters.modifier_group_id) {
      query = query.eq('modifier_group_id', filters.modifier_group_id);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list branch modifier group overrides', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as BranchModifierGroupOverride[],
      count: count ?? 0,
    };
  }

  async updateModifierGroupOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchModifierGroupOverrideDto
  ): Promise<BranchModifierGroupOverride> {
    const { data, error } = await this.supabase
      .from('branch_modifier_group_overrides')
      .update({
        is_available: payload.is_available,
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
      throw new AppError('Failed to update branch modifier group override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierGroupOverride;
  }

  async softDeleteModifierGroupOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('branch_modifier_group_overrides')
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
      throw new AppError('Failed to soft delete branch modifier group override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  async restoreModifierGroupOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<BranchModifierGroupOverride> {
    // 1. Fetch the soft-deleted override to get its branch and target group details
    const { data: existing, error: fetchError } = await this.supabase
      .from('branch_modifier_group_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Branch modifier group override');
    }

    if (existing.deleted_at === null) {
      return existing as BranchModifierGroupOverride; // Already active
    }

    // 2. Uniqueness validation: Check if another active override already exists for this branch and modifier group
    const { data: activeOverride } = await this.supabase
      .from('branch_modifier_group_overrides')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', existing.branch_id)
      .eq('modifier_group_id', existing.modifier_group_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (activeOverride) {
      throw new AppError(
        'Override conflict: An active override already exists for this branch and modifier group.',
        409,
        ErrorCode.CONFLICT
      );
    }

    // 3. Perform resurrection (set deleted_at to null)
    const { data, error } = await this.supabase
      .from('branch_modifier_group_overrides')
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
      throw new AppError('Failed to restore branch modifier group override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierGroupOverride;
  }
}
