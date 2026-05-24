// ============================================================
// src/modules/overrides/repositories/branch-modifier-option-override.repository.ts
// Repository for branch modifier option availability overrides.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type { BranchModifierOptionOverride } from '../overrides.types';
import type { CreateBranchModifierOptionOverrideDto, UpdateBranchModifierOptionOverrideDto } from '../overrides.dtos';

const OCC_CONFLICT_MSG = 'Resource was modified by another request. Reload and retry.';

export class BranchModifierOptionOverrideRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createModifierOptionOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchModifierOptionOverrideDto
  ): Promise<BranchModifierOptionOverride> {
    const { data, error } = await this.supabase
      .from('branch_modifier_option_overrides')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        branch_id: payload.branch_id,
        modifier_option_id: payload.modifier_option_id,
        is_available: payload.is_available,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError(
          'Override conflict: An active override already exists for this branch and modifier option.',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw new AppError('Failed to create branch modifier option override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierOptionOverride;
  }

  async getModifierOptionOverrideById(tenantId: string, id: string): Promise<BranchModifierOptionOverride> {
    const { data, error } = await this.supabase
      .from('branch_modifier_option_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Branch modifier option override');
      throw new AppError('Failed to fetch branch modifier option override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierOptionOverride;
  }

  async listModifierOptionOverrides(
    tenantId: string,
    filters: { branch_id?: string; modifier_option_id?: string; page?: number; limit?: number } = {}
  ): Promise<{ data: BranchModifierOptionOverride[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('branch_modifier_option_overrides')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.branch_id) {
      query = query.eq('branch_id', filters.branch_id);
    }
    if (filters.modifier_option_id) {
      query = query.eq('modifier_option_id', filters.modifier_option_id);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list branch modifier option overrides', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as BranchModifierOptionOverride[],
      count: count ?? 0,
    };
  }

  async updateModifierOptionOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchModifierOptionOverrideDto
  ): Promise<BranchModifierOptionOverride> {
    const { data, error } = await this.supabase
      .from('branch_modifier_option_overrides')
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
      throw new AppError('Failed to update branch modifier option override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierOptionOverride;
  }

  async softDeleteModifierOptionOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('branch_modifier_option_overrides')
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
      throw new AppError('Failed to soft delete branch modifier option override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  async restoreModifierOptionOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<BranchModifierOptionOverride> {
    // 1. Fetch the soft-deleted override to get its branch and target option details
    const { data: existing, error: fetchError } = await this.supabase
      .from('branch_modifier_option_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Branch modifier option override');
    }

    if (existing.deleted_at === null) {
      return existing as BranchModifierOptionOverride; // Already active
    }

    // 2. Uniqueness validation: Check if another active override already exists for this branch and modifier option
    const { data: activeOverride } = await this.supabase
      .from('branch_modifier_option_overrides')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', existing.branch_id)
      .eq('modifier_option_id', existing.modifier_option_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (activeOverride) {
      throw new AppError(
        'Override conflict: An active override already exists for this branch and modifier option.',
        409,
        ErrorCode.CONFLICT
      );
    }

    // 3. Perform resurrection (set deleted_at to null)
    const { data, error } = await this.supabase
      .from('branch_modifier_option_overrides')
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
      throw new AppError('Failed to restore branch modifier option override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchModifierOptionOverride;
  }
}
