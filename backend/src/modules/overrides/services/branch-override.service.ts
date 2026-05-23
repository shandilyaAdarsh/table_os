// ============================================================
// src/modules/overrides/services/branch-override.service.ts
// Service layer for branch overrides (item, category, modifiers, pricing).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { BranchItemOverrideRepository } from '../repositories/branch-item-override.repository';
import { BranchCategoryOverrideRepository } from '../repositories/branch-category-override.repository';
import { BranchModifierGroupOverrideRepository } from '../repositories/branch-modifier-group-override.repository';
import { BranchModifierOptionOverrideRepository } from '../repositories/branch-modifier-option-override.repository';
import { BranchPriceOverrideRepository } from '../repositories/branch-price-override.repository';
import type {
  BranchMenuItemOverride,
  BranchCategoryOverride,
  BranchModifierGroupOverride,
  BranchModifierOptionOverride,
  BranchPriceOverride,
} from '../overrides.types';
import type {
  CreateBranchMenuItemOverrideDto,
  UpdateBranchMenuItemOverrideDto,
  CreateBranchCategoryOverrideDto,
  UpdateBranchCategoryOverrideDto,
  CreateBranchModifierGroupOverrideDto,
  UpdateBranchModifierGroupOverrideDto,
  CreateBranchModifierOptionOverrideDto,
  UpdateBranchModifierOptionOverrideDto,
  CreateBranchPriceOverrideDto,
  UpdateBranchPriceOverrideDto,
} from '../overrides.dtos';

export class BranchOverrideService {
  private readonly itemOverrideRepo: BranchItemOverrideRepository;
  private readonly categoryOverrideRepo: BranchCategoryOverrideRepository;
  private readonly modifierGroupOverrideRepo: BranchModifierGroupOverrideRepository;
  private readonly modifierOptionOverrideRepo: BranchModifierOptionOverrideRepository;
  private readonly priceOverrideRepo: BranchPriceOverrideRepository;

  constructor(private readonly supabase: SupabaseClient) {
    this.itemOverrideRepo = new BranchItemOverrideRepository(supabase);
    this.categoryOverrideRepo = new BranchCategoryOverrideRepository(supabase);
    this.modifierGroupOverrideRepo = new BranchModifierGroupOverrideRepository(supabase);
    this.modifierOptionOverrideRepo = new BranchModifierOptionOverrideRepository(supabase);
    this.priceOverrideRepo = new BranchPriceOverrideRepository(supabase);
  }

  // ─── HELPER DEFENSE-IN-DEPTH TENANT VALIDATIONS ───────────────

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

  private async validateCategoryBelongsToTenant(tenantId: string, categoryId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('menu_categories')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', categoryId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      throw new AppError('Menu category does not exist or does not belong to this tenant', 400, ErrorCode.BAD_REQUEST);
    }
  }

  private async validateModifierGroupBelongsToTenant(tenantId: string, modifierGroupId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('modifier_groups')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', modifierGroupId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      throw new AppError('Modifier group does not exist or does not belong to this tenant', 400, ErrorCode.BAD_REQUEST);
    }
  }

  private async validateModifierOptionBelongsToTenant(tenantId: string, modifierOptionId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('modifier_options')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', modifierOptionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      throw new AppError('Modifier option does not exist or does not belong to this tenant', 400, ErrorCode.BAD_REQUEST);
    }
  }

  // ─── ITEM OVERRIDES ──────────────────────────────────────────

  async createItemOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchMenuItemOverrideDto
  ): Promise<BranchMenuItemOverride> {
    await Promise.all([
      this.validateBranchBelongsToTenant(tenantId, payload.branch_id),
      this.validateMenuItemBelongsToTenant(tenantId, payload.menu_item_id),
    ]);
    return this.itemOverrideRepo.createItemOverride(tenantId, userId, payload);
  }

  async getItemOverrideById(tenantId: string, id: string): Promise<BranchMenuItemOverride> {
    return this.itemOverrideRepo.getItemOverrideById(tenantId, id);
  }

  async listItemOverrides(tenantId: string, filters: any): Promise<{ data: BranchMenuItemOverride[]; count: number }> {
    return this.itemOverrideRepo.listItemOverrides(tenantId, filters);
  }

  async updateItemOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchMenuItemOverrideDto
  ): Promise<BranchMenuItemOverride> {
    return this.itemOverrideRepo.updateItemOverride(tenantId, id, userId, payload);
  }

  async softDeleteItemOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.itemOverrideRepo.softDeleteItemOverride(tenantId, id, userId, versionNum);
  }

  async restoreItemOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<BranchMenuItemOverride> {
    return this.itemOverrideRepo.restoreItemOverride(tenantId, id, userId, versionNum);
  }

  // ─── CATEGORY OVERRIDES ──────────────────────────────────────

  async createCategoryOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchCategoryOverrideDto
  ): Promise<BranchCategoryOverride> {
    await Promise.all([
      this.validateBranchBelongsToTenant(tenantId, payload.branch_id),
      this.validateCategoryBelongsToTenant(tenantId, payload.category_id),
    ]);
    return this.categoryOverrideRepo.createCategoryOverride(tenantId, userId, payload);
  }

  async getCategoryOverrideById(tenantId: string, id: string): Promise<BranchCategoryOverride> {
    return this.categoryOverrideRepo.getCategoryOverrideById(tenantId, id);
  }

  async listCategoryOverrides(tenantId: string, filters: any): Promise<{ data: BranchCategoryOverride[]; count: number }> {
    return this.categoryOverrideRepo.listCategoryOverrides(tenantId, filters);
  }

  async updateCategoryOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchCategoryOverrideDto
  ): Promise<BranchCategoryOverride> {
    return this.categoryOverrideRepo.updateCategoryOverride(tenantId, id, userId, payload);
  }

  async softDeleteCategoryOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.categoryOverrideRepo.softDeleteCategoryOverride(tenantId, id, userId, versionNum);
  }

  async restoreCategoryOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<BranchCategoryOverride> {
    return this.categoryOverrideRepo.restoreCategoryOverride(tenantId, id, userId, versionNum);
  }

  // ─── MODIFIER GROUP OVERRIDES ─────────────────────────────────

  async createModifierGroupOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchModifierGroupOverrideDto
  ): Promise<BranchModifierGroupOverride> {
    await Promise.all([
      this.validateBranchBelongsToTenant(tenantId, payload.branch_id),
      this.validateModifierGroupBelongsToTenant(tenantId, payload.modifier_group_id),
    ]);
    return this.modifierGroupOverrideRepo.createModifierGroupOverride(tenantId, userId, payload);
  }

  async getModifierGroupOverrideById(tenantId: string, id: string): Promise<BranchModifierGroupOverride> {
    return this.modifierGroupOverrideRepo.getModifierGroupOverrideById(tenantId, id);
  }

  async listModifierGroupOverrides(tenantId: string, filters: any): Promise<{ data: BranchModifierGroupOverride[]; count: number }> {
    return this.modifierGroupOverrideRepo.listModifierGroupOverrides(tenantId, filters);
  }

  async updateModifierGroupOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchModifierGroupOverrideDto
  ): Promise<BranchModifierGroupOverride> {
    return this.modifierGroupOverrideRepo.updateModifierGroupOverride(tenantId, id, userId, payload);
  }

  async softDeleteModifierGroupOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.modifierGroupOverrideRepo.softDeleteModifierGroupOverride(tenantId, id, userId, versionNum);
  }

  async restoreModifierGroupOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<BranchModifierGroupOverride> {
    return this.modifierGroupOverrideRepo.restoreModifierGroupOverride(tenantId, id, userId, versionNum);
  }

  // ─── MODIFIER OPTION OVERRIDES ────────────────────────────────

  async createModifierOptionOverride(
    tenantId: string,
    userId: string,
    payload: CreateBranchModifierOptionOverrideDto
  ): Promise<BranchModifierOptionOverride> {
    await Promise.all([
      this.validateBranchBelongsToTenant(tenantId, payload.branch_id),
      this.validateModifierOptionBelongsToTenant(tenantId, payload.modifier_option_id),
    ]);
    return this.modifierOptionOverrideRepo.createModifierOptionOverride(tenantId, userId, payload);
  }

  async getModifierOptionOverrideById(tenantId: string, id: string): Promise<BranchModifierOptionOverride> {
    return this.modifierOptionOverrideRepo.getModifierOptionOverrideById(tenantId, id);
  }

  async listModifierOptionOverrides(tenantId: string, filters: any): Promise<{ data: BranchModifierOptionOverride[]; count: number }> {
    return this.modifierOptionOverrideRepo.listModifierOptionOverrides(tenantId, filters);
  }

  async updateModifierOptionOverride(
    tenantId: string,
    id: string,
    userId: string,
    payload: UpdateBranchModifierOptionOverrideDto
  ): Promise<BranchModifierOptionOverride> {
    return this.modifierOptionOverrideRepo.updateModifierOptionOverride(tenantId, id, userId, payload);
  }

  async softDeleteModifierOptionOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    return this.modifierOptionOverrideRepo.softDeleteModifierOptionOverride(tenantId, id, userId, versionNum);
  }

  async restoreModifierOptionOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<BranchModifierOptionOverride> {
    return this.modifierOptionOverrideRepo.restoreModifierOptionOverride(tenantId, id, userId, versionNum);
  }

  // ─── PRICE OVERRIDES ──────────────────────────────────────────

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

  async restorePriceOverride(tenantId: string, id: string, userId: string, versionNum: number): Promise<BranchPriceOverride> {
    return this.priceOverrideRepo.restorePriceOverride(tenantId, id, userId, versionNum);
  }
}
