// ============================================================
// src/modules/availability/repositories/availability.repository.ts
// Repository layer for the Core Availability System.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type {
  AvailabilitySchedule,
  BranchItemAvailability,
  ItemAvailabilityException,
  ResolvedAvailabilityRPC,
  ResolvedAvailabilityBatchRPC
} from '../availability.types';
import type {
  CreateAvailabilityScheduleDto,
  UpdateAvailabilityScheduleDto,
  CreateBranchItemAvailabilityDto,
  UpdateBranchItemAvailabilityDto,
  CreateItemAvailabilityExceptionDto,
  UpdateItemAvailabilityExceptionDto
} from '../availability.dtos';

const OCC_CONFLICT_MSG = 'Resource was modified by another request. Reload and retry.';

export class AvailabilityRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ─── Availability Schedules ───────────────────────────────────

  async createSchedule(
    tenantId: string,
    userId: string,
    payload: CreateAvailabilityScheduleDto
  ): Promise<AvailabilitySchedule> {
    const { data, error } = await this.supabase
      .from('availability_schedules')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        menu_item_id: payload.menu_item_id,
        branch_id: payload.branch_id,
        timezone: payload.timezone,
        day_of_week: payload.day_of_week,
        start_time: payload.start_time,
        end_time: payload.end_time,
        priority: payload.priority,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError(
          'Overlap conflict: An active schedule with overlapping times already exists for this scope and priority.',
          409,
          ErrorCode.CONFLICT,
          true,
          { detail: error.details }
        );
      }
      throw new AppError('Failed to create availability schedule', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as AvailabilitySchedule;
  }

  async getScheduleById(tenantId: string, id: string): Promise<AvailabilitySchedule> {
    const { data, error } = await this.supabase
      .from('availability_schedules')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Availability schedule');
      throw new AppError('Failed to fetch availability schedule', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as AvailabilitySchedule;
  }

  async listSchedules(
    tenantId: string,
    filters: { menu_item_id?: string; branch_id?: string | null; is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: AvailabilitySchedule[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('availability_schedules')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.menu_item_id !== undefined) {
      query = query.eq('menu_item_id', filters.menu_item_id);
    }
    if (filters.branch_id !== undefined) {
      if (filters.branch_id === null) {
        query = query.is('branch_id', null);
      } else {
        query = query.eq('branch_id', filters.branch_id);
      }
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error, count } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list availability schedules', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as AvailabilitySchedule[],
      count: count ?? 0,
    };
  }

  async updateSchedule(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateAvailabilityScheduleDto
  ): Promise<AvailabilitySchedule> {
    const { data, error } = await this.supabase
      .from('availability_schedules')
      .update({
        ...payload,
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
      if (error.code === '42501') {
        throw new AppError('Database Immutability check failed: Core schedule properties cannot be mutated.', 400, ErrorCode.BAD_REQUEST);
      }
      if (error.code === '23505') {
        throw new AppError('Overlap conflict: Overlapping time ranges detected.', 409, ErrorCode.CONFLICT);
      }
      throw new AppError('Failed to update availability schedule', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as AvailabilitySchedule;
  }

  async softDeleteSchedule(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('availability_schedules')
      .update({
        is_active: false,
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
      throw new AppError('Failed to soft delete availability schedule', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  // ─── Branch Item Availability ──────────────────────────────────

  async createOperationalState(
    tenantId: string,
    userId: string,
    payload: CreateBranchItemAvailabilityDto
  ): Promise<BranchItemAvailability> {
    const { data, error } = await this.supabase
      .from('branch_item_availability')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        branch_id: payload.branch_id,
        menu_item_id: payload.menu_item_id,
        availability_status: payload.availability_status,
        reason: payload.reason,
        disabled_until: payload.disabled_until,
        priority: payload.priority,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError(
          'Operational state conflict: An active operational state already exists for this branch and item.',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw new AppError('Failed to create operational state', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchItemAvailability;
  }

  async getOperationalStateById(tenantId: string, id: string): Promise<BranchItemAvailability> {
    const { data, error } = await this.supabase
      .from('branch_item_availability')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Branch operational state');
      throw new AppError('Failed to fetch operational state', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchItemAvailability;
  }

  async listOperationalStates(
    tenantId: string,
    filters: { menu_item_id?: string; branch_id?: string; is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: BranchItemAvailability[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('branch_item_availability')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.menu_item_id !== undefined) {
      query = query.eq('menu_item_id', filters.menu_item_id);
    }
    if (filters.branch_id !== undefined) {
      query = query.eq('branch_id', filters.branch_id);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error, count } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list operational states', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as BranchItemAvailability[],
      count: count ?? 0,
    };
  }

  async updateOperationalState(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchItemAvailabilityDto
  ): Promise<BranchItemAvailability> {
    const { data, error } = await this.supabase
      .from('branch_item_availability')
      .update({
        ...payload,
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
      if (error.code === '42501') {
        throw new AppError('Database Immutability check failed: Core operational state properties cannot be mutated.', 400, ErrorCode.BAD_REQUEST);
      }
      if (error.code === '23505') {
        throw new AppError('Operational state conflict: Active state uniqueness violation.', 409, ErrorCode.CONFLICT);
      }
      throw new AppError('Failed to update operational state', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as BranchItemAvailability;
  }

  async softDeleteOperationalState(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('branch_item_availability')
      .update({
        is_active: false,
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
      throw new AppError('Failed to soft delete operational state', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  // ─── Item Availability Exceptions ──────────────────────────────

  async createException(
    tenantId: string,
    userId: string,
    payload: CreateItemAvailabilityExceptionDto
  ): Promise<ItemAvailabilityException> {
    const { data, error } = await this.supabase
      .from('item_availability_exceptions')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        menu_item_id: payload.menu_item_id,
        branch_id: payload.branch_id,
        exception_type: payload.exception_type,
        starts_at: payload.starts_at,
        ends_at: payload.ends_at,
        priority: payload.priority,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' || error.code === '23P01') {
        throw new AppError(
          'Exception overlap: An active exception window with overlapping dates already exists for this scope.',
          409,
          ErrorCode.CONFLICT
        );
      }
      throw new AppError('Failed to create availability exception', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ItemAvailabilityException;
  }

  async getExceptionById(tenantId: string, id: string): Promise<ItemAvailabilityException> {
    const { data, error } = await this.supabase
      .from('item_availability_exceptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Availability exception');
      throw new AppError('Failed to fetch availability exception', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ItemAvailabilityException;
  }

  async listExceptions(
    tenantId: string,
    filters: { menu_item_id?: string; branch_id?: string | null; is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: ItemAvailabilityException[]; count: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('item_availability_exceptions')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (filters.menu_item_id !== undefined) {
      query = query.eq('menu_item_id', filters.menu_item_id);
    }
    if (filters.branch_id !== undefined) {
      if (filters.branch_id === null) {
        query = query.is('branch_id', null);
      } else {
        query = query.eq('branch_id', filters.branch_id);
      }
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    const { data, error, count } = await query
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError('Failed to list availability exceptions', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return {
      data: data as ItemAvailabilityException[],
      count: count ?? 0,
    };
  }

  async updateException(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateItemAvailabilityExceptionDto
  ): Promise<ItemAvailabilityException> {
    const { data, error } = await this.supabase
      .from('item_availability_exceptions')
      .update({
        ...payload,
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
      if (error.code === '42501') {
        throw new AppError('Database Immutability check failed: Core exception window properties cannot be mutated.', 400, ErrorCode.BAD_REQUEST);
      }
      if (error.code === '23505' || error.code === '23P01') {
        throw new AppError('Exception overlap: Overlapping windows detected.', 409, ErrorCode.CONFLICT);
      }
      throw new AppError('Failed to update availability exception', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ItemAvailabilityException;
  }

  async softDeleteException(
    tenantId: string,
    id: string,
    userId: string,
    versionNum: number
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('item_availability_exceptions')
      .update({
        is_active: false,
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
      throw new AppError('Failed to soft delete availability exception', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      throw new AppError(OCC_CONFLICT_MSG, 409, ErrorCode.CONFLICT);
    }
  }

  // ─── RPC Dynamic Availability Resolvers ─────────────────────────

  async resolveItemAvailability(
    tenantId: string,
    menuItemId: string,
    branchId: string,
    resolvedAt?: string
  ): Promise<ResolvedAvailabilityRPC> {
    const { data, error } = await this.supabase
      .rpc('resolve_item_availability', {
        p_tenant_id: tenantId,
        p_menu_item_id: menuItemId,
        p_branch_id: branchId,
        p_resolved_at: resolvedAt ?? new Date().toISOString(),
      });

    if (error) {
      throw new AppError('Failed to resolve item availability via RPC', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    if (!data || data.length === 0) {
      // Default fallback
      return {
        status: 'available',
        source_type: 'default',
        active_schedule_id: null,
        branch_scope: false,
        reason: 'No schedules configured, available by default',
        resolved_at: resolvedAt ?? new Date().toISOString(),
      };
    }

    return data[0] as ResolvedAvailabilityRPC;
  }

  async resolveItemAvailabilityBatch(
    tenantId: string,
    menuItemIds: string[],
    branchId: string,
    resolvedAt?: string
  ): Promise<ResolvedAvailabilityBatchRPC[]> {
    const { data, error } = await this.supabase
      .rpc('resolve_item_availability_batch', {
        p_tenant_id: tenantId,
        p_menu_item_ids: menuItemIds,
        p_branch_id: branchId,
        p_resolved_at: resolvedAt ?? new Date().toISOString(),
      });

    if (error) {
      throw new AppError('Failed to resolve item availability batch via RPC', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return (data ?? []) as ResolvedAvailabilityBatchRPC[];
  }
}
