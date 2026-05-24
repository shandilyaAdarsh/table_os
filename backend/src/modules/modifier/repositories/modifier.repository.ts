// ============================================================
// src/modules/modifier/repositories/modifier.repository.ts
// Repository layer for the Core Modifier System.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type {
  ModifierGroup,
  ModifierOption,
  MenuItemModifierGroup,
  ResolvedModifierGroupRPC,
  ResolvedModifierOptionRPC
} from '../modifier.types';
import type {
  CreateModifierGroupDto,
  UpdateModifierGroupDto,
  CreateModifierOptionDto,
  UpdateModifierOptionDto,
  CreateMenuItemModifierGroupDto,
  UpdateMenuItemModifierGroupDto
} from '../modifier.dtos';

const OCC_CONFLICT_MSG = 'Resource was modified by another request. Reload and retry.';

export class ModifierRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ─── Modifier Groups ──────────────────────────────────────────

  async createGroup(tenantId: string, userId: string, payload: CreateModifierGroupDto): Promise<ModifierGroup> {
    const { data, error } = await this.supabase
      .from('modifier_groups')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        name: payload.name,
        description: payload.description,
        selection_mode: payload.selection_mode,
        min_select: payload.min_select,
        max_select: payload.max_select,
        allow_quantity: payload.allow_quantity,
        min_quantity_per_option: payload.min_quantity_per_option,
        max_quantity_per_option: payload.max_quantity_per_option,
        display_order: payload.display_order,
        is_required: payload.is_required,
      })
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create modifier group', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ModifierGroup;
  }

  async getGroupById(tenantId: string, id: string): Promise<ModifierGroup> {
    const { data, error } = await this.supabase
      .from('modifier_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Modifier group');
      throw new AppError('Failed to fetch modifier group', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ModifierGroup;
  }

  async listGroups(
    tenantId: string,
    filters: { is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: ModifierGroup[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('modifier_groups')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error, count } = await query
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list modifier groups', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as ModifierGroup[],
      count: count ?? 0,
    };
  }

  async updateGroup(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateModifierGroupDto
  ): Promise<ModifierGroup> {
    const { data, error } = await this.supabase
      .from('modifier_groups')
      .update({
        ...payload,
        updated_by: userId,
        version_num: payload.version_num + 1, // OCC atomic increment
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', payload.version_num) // OCC stale check
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
      }
      throw new AppError('Failed to update modifier group', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ModifierGroup;
  }

  async softDeleteGroup(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('modifier_groups')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
        version_num: versionNum + 1, // OCC atomic increment
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', versionNum) // OCC stale check
      .is('deleted_at', null)
      .select();

    if (error) {
      throw new AppError('Failed to soft delete modifier group', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  // ─── Modifier Options ──────────────────────────────────────────

  async createOption(tenantId: string, userId: string, payload: CreateModifierOptionDto): Promise<ModifierOption> {
    const { data, error } = await this.supabase
      .from('modifier_options')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        modifier_group_id: payload.modifier_group_id,
        name: payload.name,
        description: payload.description,
        price_delta_minor: payload.price_delta_minor,
        is_default: payload.is_default,
        display_order: payload.display_order,
        parent_modifier_option_id: payload.parent_modifier_option_id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === 'P0001') {
        // Handled custom triggers (circular nesting, nesting depth limits)
        throw new AppError(error.message, 400, ErrorCode.BAD_REQUEST, true, { detail: error.details, hint: error.hint });
      }
      throw new AppError('Failed to create modifier option', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ModifierOption;
  }

  async getOptionById(tenantId: string, id: string): Promise<ModifierOption> {
    const { data, error } = await this.supabase
      .from('modifier_options')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Modifier option');
      throw new AppError('Failed to fetch modifier option', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ModifierOption;
  }

  async listOptionsByGroup(
    tenantId: string,
    groupId: string,
    filters: { is_active?: boolean } = {}
  ): Promise<ModifierOption[]> {
    let query = this.supabase
      .from('modifier_options')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('modifier_group_id', groupId)
      .is('deleted_at', null);

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error } = await query
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw new AppError('Failed to list modifier options', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ModifierOption[];
  }

  async updateOption(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateModifierOptionDto
  ): Promise<ModifierOption> {
    const { data, error } = await this.supabase
      .from('modifier_options')
      .update({
        ...payload,
        updated_by: userId,
        version_num: payload.version_num + 1, // OCC atomic increment
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', payload.version_num) // OCC stale check
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
      }
      if (error.code === 'P0001') {
        throw new AppError(error.message, 400, ErrorCode.BAD_REQUEST, true, { detail: error.details, hint: error.hint });
      }
      throw new AppError('Failed to update modifier option', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ModifierOption;
  }

  async softDeleteOption(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('modifier_options')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
        version_num: versionNum + 1, // OCC atomic increment
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', versionNum) // OCC stale check
      .is('deleted_at', null)
      .select();

    if (error) {
      throw new AppError('Failed to soft delete modifier option', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  // ─── Menu Item Modifier Group Assignments ──────────────────────

  async assignGroupToItem(
    tenantId: string,
    userId: string,
    payload: CreateMenuItemModifierGroupDto
  ): Promise<MenuItemModifierGroup> {
    const { data, error } = await this.supabase
      .from('menu_item_modifier_groups')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        menu_item_id: payload.menu_item_id,
        modifier_group_id: payload.modifier_group_id,
        display_order: payload.display_order,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique active assignment index violation
        throw new AppError(
          'This modifier group is already actively assigned to this menu item.',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw new AppError('Failed to assign modifier group to item', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as MenuItemModifierGroup;
  }

  async getAssignmentById(tenantId: string, id: string): Promise<MenuItemModifierGroup> {
    const { data, error } = await this.supabase
      .from('menu_item_modifier_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Menu item modifier group assignment');
      throw new AppError('Failed to fetch assignment', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as MenuItemModifierGroup;
  }

  async listAssignmentsByItem(
    tenantId: string,
    menuItemId: string
  ): Promise<MenuItemModifierGroup[]> {
    const { data, error } = await this.supabase
      .from('menu_item_modifier_groups')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('menu_item_id', menuItemId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw new AppError('Failed to list item assignments', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as MenuItemModifierGroup[];
  }

  async updateAssignment(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateMenuItemModifierGroupDto
  ): Promise<MenuItemModifierGroup> {
    const { data, error } = await this.supabase
      .from('menu_item_modifier_groups')
      .update({
        ...payload,
        updated_by: userId,
        version_num: payload.version_num + 1, // OCC atomic increment
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', payload.version_num) // OCC stale check
      .is('deleted_at', null)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
      }
      throw new AppError('Failed to update assignment', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as MenuItemModifierGroup;
  }

  async softDeleteAssignment(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('menu_item_modifier_groups')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
        version_num: versionNum + 1, // OCC atomic increment
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', versionNum) // OCC stale check
      .is('deleted_at', null)
      .select();

    if (error) {
      throw new AppError('Failed to soft delete assignment', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  // ─── RPC Resolvers ──────────────────────────────────────────

  async resolveMenuItemModifiers(tenantId: string, menuItemId: string): Promise<ResolvedModifierGroupRPC[]> {
    const { data, error } = await this.supabase.rpc('resolve_menu_item_modifiers', {
      p_tenant_id: tenantId,
      p_menu_item_id: menuItemId,
    });

    if (error) {
      throw new AppError('Failed to resolve menu item modifiers', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ResolvedModifierGroupRPC[];
  }

  async resolveModifierGroupOptions(tenantId: string, modifierGroupId: string): Promise<ResolvedModifierOptionRPC[]> {
    const { data, error } = await this.supabase.rpc('resolve_modifier_group_options', {
      p_tenant_id: tenantId,
      p_modifier_group_id: modifierGroupId,
    });

    if (error) {
      throw new AppError('Failed to resolve modifier group options', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ResolvedModifierOptionRPC[];
  }
}
