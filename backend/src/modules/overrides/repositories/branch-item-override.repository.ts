// ============================================================
// src/modules/overrides/repositories/branch-item-override.repository.ts
// Repository for branch item visibility overrides.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type { BranchMenuItemOverride } from '../overrides.types';
import type { CreateBranchMenuItemOverrideDto, UpdateBranchMenuItemOverrideDto } from '../overrides.dtos';

const OCC_CONFLICT_MSG = 'Resource was modified by another request. Reload and retry.';

export class BranchItemOverrideRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createItemOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchMenuItemOverrideDto
  ): Promise<BranchMenuItemOverride> {
    const { data, error } = await this.supabase
      .from('branch_menu_item_overrides')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        branch_id: payload.branch_id,
        menu_item_id: payload.menu_item_id,
        is_visible: payload.is_visible,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError(
          'Override conflict: An active override already exists for this branch and item.',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw new AppError('Failed to create branch item override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchMenuItemOverride;
  }

  async getItemOverrideById(tenantId: string, id: string): Promise<BranchMenuItemOverride> {
    const { data, error } = await this.supabase
      .from('branch_menu_item_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Branch item override');
      throw new AppError('Failed to fetch branch item override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchMenuItemOverride;
  }

  async listItemOverrides(
    tenantId: string,
    filters: { branch_id?: string; menu_item_id?: string; page?: number; limit?: number } = {}
  ): Promise<{ data: BranchMenuItemOverride[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('branch_menu_item_overrides')
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
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list branch item overrides', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as BranchMenuItemOverride[],
      count: count ?? 0,
    };
  }

  async updateItemOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchMenuItemOverrideDto
  ): Promise<BranchMenuItemOverride> {
    const { data, error } = await this.supabase
      .from('branch_menu_item_overrides')
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
      throw new AppError('Failed to update branch item override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchMenuItemOverride;
  }

  async softDeleteItemOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('branch_menu_item_overrides')
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
      throw new AppError('Failed to soft delete branch item override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  async restoreItemOverride(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<BranchMenuItemOverride> {
    const { data: existing, error: fetchError } = await this.supabase
      .from('branch_menu_item_overrides')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError('Branch item override');
    }

    if (existing.deleted_at === null) {
      return existing as BranchMenuItemOverride;
    }

    const { data: activeOverride } = await this.supabase
      .from('branch_menu_item_overrides')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', existing.branch_id)
      .eq('menu_item_id', existing.menu_item_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (activeOverride) {
      throw new AppError(
        'Override conflict: An active override already exists for this branch and item.',
        409,
        ErrorCode.CONFLICT
      );
    }

    const { data, error } = await this.supabase
      .from('branch_menu_item_overrides')
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
      throw new AppError('Failed to restore branch item override', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchMenuItemOverride;
  }
}
