// ============================================================
// src/modules/overrides/services/branch-pricing-override.service.ts
// Service layer for branch pricing overrides.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { BranchPriceOverrideRepository } from '../repositories/branch-price-override.repository';
import type { BranchPriceOverride } from '../overrides.types';
import type { CreateBranchPriceOverrideDto, UpdateBranchPriceOverrideDto } from '../overrides.dtos';

export class BranchPricingOverrideService {
  private readonly priceOverrideRepo: BranchPriceOverrideRepository;

  constructor(private readonly supabase: SupabaseClient) {
    this.priceOverrideRepo = new BranchPriceOverrideRepository(supabase);
  }

  private async validateBranchBelongsToTenant(tenantId: string, branchId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('branches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', branchId)
      .maybeSingle();

    if (error || !data) {
      throw new AppError('Branch does not exist or does not belong to this tenant', 400, ErrorCode.BAD_REQUEST);
    }
  }

  private async validateMenuItemBelongsToTenant(tenantId: string, menuItemId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('menu_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', menuItemId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      throw new AppError('Menu item does not exist or does not belong to this tenant', 400, ErrorCode.BAD_REQUEST);
    }
  }

  async createPriceOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchPriceOverrideDto
  ): Promise<BranchPriceOverride> {
    await Promise.all([
      this.validateBranchBelongsToTenant(tenantId, payload.branch_id),
      this.validateMenuItemBelongsToTenant(tenantId, payload.menu_item_id),
    ]);
    return this.priceOverrideRepo.createPriceOverride(tenantId, userId, payload);
  }

  async getPriceOverrideById(tenantId: string, id: string): Promise<BranchPriceOverride> {
    return this.priceOverrideRepo.getPriceOverrideById(tenantId, id);
  }

  async listPriceOverrides(tenantId: string, filters: any): Promise<{ data: BranchPriceOverride[]; count: number }> {
    return this.priceOverrideRepo.listPriceOverrides(tenantId, filters);
  }

  async updatePriceOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchPriceOverrideDto
  ): Promise<BranchPriceOverride> {
    return this.priceOverrideRepo.updatePriceOverride(tenantId, id, userId, payload);
  }

  async softDeletePriceOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.priceOverrideRepo.softDeletePriceOverride(tenantId, id, userId, versionNum);
  }
}
