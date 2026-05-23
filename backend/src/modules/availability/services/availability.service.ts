// ============================================================
// src/modules/availability/services/availability.service.ts
// Service layer for the Core Availability System.
// ============================================================

import type { AvailabilityRepository } from '../repositories/availability.repository';
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

export class AvailabilityService {
  constructor(private readonly repository: AvailabilityRepository) {}

  // ─── Availability Schedules ───────────────────────────────────

  async createSchedule(
    tenantId: string,
    userId: string,
    dto: CreateAvailabilityScheduleDto
  ): Promise<AvailabilitySchedule> {
    return this.repository.createSchedule(tenantId, userId, dto);
  }

  async getScheduleById(tenantId: string, id: string): Promise<AvailabilitySchedule> {
    return this.repository.getScheduleById(tenantId, id);
  }

  async listSchedules(
    tenantId: string,
    filters: { menu_item_id?: string; branch_id?: string | null; is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: AvailabilitySchedule[]; count: number }> {
    return this.repository.listSchedules(tenantId, filters);
  }

  async updateSchedule(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateAvailabilityScheduleDto
  ): Promise<AvailabilitySchedule> {
    return this.repository.updateSchedule(tenantId, id, userId, dto);
  }

  async softDeleteSchedule(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.repository.softDeleteSchedule(tenantId, id, userId, versionNum);
  }

  // ─── Branch Item Availability ──────────────────────────────────

  async createOperationalState(
    tenantId: string,
    userId: string,
    dto: CreateBranchItemAvailabilityDto
  ): Promise<BranchItemAvailability> {
    return this.repository.createOperationalState(tenantId, userId, dto);
  }

  async getOperationalStateById(tenantId: string, id: string): Promise<BranchItemAvailability> {
    return this.repository.getOperationalStateById(tenantId, id);
  }

  async listOperationalStates(
    tenantId: string,
    filters: { menu_item_id?: string; branch_id?: string; is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: BranchItemAvailability[]; count: number }> {
    return this.repository.listOperationalStates(tenantId, filters);
  }

  async updateOperationalState(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateBranchItemAvailabilityDto
  ): Promise<BranchItemAvailability> {
    return this.repository.updateOperationalState(tenantId, id, userId, dto);
  }

  async softDeleteOperationalState(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.repository.softDeleteOperationalState(tenantId, id, userId, versionNum);
  }

  // ─── Item Availability Exceptions ──────────────────────────────

  async createException(
    tenantId: string,
    userId: string,
    dto: CreateItemAvailabilityExceptionDto
  ): Promise<ItemAvailabilityException> {
    return this.repository.createException(tenantId, userId, dto);
  }

  async getExceptionById(tenantId: string, id: string): Promise<ItemAvailabilityException> {
    return this.repository.getExceptionById(tenantId, id);
  }

  async listExceptions(
    tenantId: string,
    filters: { menu_item_id?: string; branch_id?: string | null; is_active?: boolean; page?: number; limit?: number } = {}
  ): Promise<{ data: ItemAvailabilityException[]; count: number }> {
    return this.repository.listExceptions(tenantId, filters);
  }

  async updateException(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateItemAvailabilityExceptionDto
  ): Promise<ItemAvailabilityException> {
    return this.repository.updateException(tenantId, id, userId, dto);
  }

  async softDeleteException(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.repository.softDeleteException(tenantId, id, userId, versionNum);
  }

  // ─── Dynamic Resolution Engine ─────────────────────────────────

  async resolveItemAvailability(
    tenantId: string,
    menuItemId: string,
    branchId: string,
    resolvedAt?: string
  ): Promise<ResolvedAvailabilityRPC> {
    return this.repository.resolveItemAvailability(tenantId, menuItemId, branchId, resolvedAt);
  }

  async resolveItemAvailabilityBatch(
    tenantId: string,
    menuItemIds: string[],
    branchId: string,
    resolvedAt?: string
  ): Promise<ResolvedAvailabilityBatchRPC[]> {
    return this.repository.resolveItemAvailabilityBatch(tenantId, menuItemIds, branchId, resolvedAt);
  }
}
