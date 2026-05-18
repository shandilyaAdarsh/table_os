import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type { 
  TaxProfile, 
  TaxRate, 
  MenuItemTaxProfile, 
  ResolvedTaxRPC, 
  ResolvedTaxBatchRPC 
} from '../tax.types';
import type {
  CreateTaxProfileDTO,
  UpdateTaxProfileDTO,
  CreateTaxRateDTO,
  UpdateTaxRateDTO,
  AssignMenuItemTaxProfileDTO
} from '../tax.dtos';

export class TaxRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ─── Profiles ─────────────────────────────────────────────────

  async createProfile(tenantId: string, userId: string, payload: CreateTaxProfileDTO): Promise<TaxProfile> {
    const { data, error } = await this.supabase
      .from('tax_profiles')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        name: payload.name,
        description: payload.description,
        calculation_mode: payload.calculation_mode,
        priority: payload.priority,
        is_active: payload.is_active
      })
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create tax profile', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as TaxProfile;
  }

  async getProfileById(tenantId: string, id: string): Promise<TaxProfile> {
    const { data, error } = await this.supabase
      .from('tax_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Tax profile');
      throw new AppError('Failed to fetch tax profile', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as TaxProfile;
  }

  async updateProfile(tenantId: string, id: string, userId: string, payload: UpdateTaxProfileDTO): Promise<TaxProfile> {
    const { data, error } = await this.supabase
      .from('tax_profiles')
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
      if (error.code === 'PGRST116') throw new AppError('Tax profile was modified by another request. Please retry.', 409, ErrorCode.CONFLICT);
      throw new AppError('Failed to update tax profile', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as TaxProfile;
  }

  async softDeleteProfile(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    const { error } = await this.supabase
      .from('tax_profiles')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId,
        version_num: versionNum + 1,
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', versionNum)
      .is('deleted_at', null);

    if (error) {
      throw new AppError('Failed to soft delete tax profile', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
  }

  // ─── Rates (Append-Only) ──────────────────────────────────────

  async createRate(tenantId: string, userId: string, payload: CreateTaxRateDTO): Promise<TaxRate> {
    const { data, error } = await this.supabase
      .from('tax_rates')
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        updated_by: userId,
        tax_profile_id: payload.tax_profile_id,
        name: payload.name,
        rate_basis_points: payload.rate_basis_points,
        priority: payload.priority,
        effective_from: payload.effective_from,
        effective_to: payload.effective_to
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23P01') { // Exclusion constraint violation
        throw new AppError('Overlapping tax rate found for this profile and component name.', 409, ErrorCode.CONFLICT, true, { error });
      }
      throw new AppError('Failed to create tax rate', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as TaxRate;
  }

  async getRateById(tenantId: string, id: string): Promise<TaxRate> {
    const { data, error } = await this.supabase
      .from('tax_rates')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') throw new NotFoundError('Tax rate');
      throw new AppError('Failed to fetch tax rate', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as TaxRate;
  }

  async updateRate(tenantId: string, id: string, userId: string, payload: UpdateTaxRateDTO): Promise<TaxRate> {
    const { data, error } = await this.supabase
      .from('tax_rates')
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
      if (error.code === 'PGRST116') throw new AppError('Tax rate was modified by another request. Please retry.', 409, ErrorCode.CONFLICT);
      throw new AppError('Failed to update tax rate', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as TaxRate;
  }

  async deactivateRate(tenantId: string, id: string, userId: string, versionNum: number): Promise<void> {
    const { error } = await this.supabase
      .from('tax_rates')
      .update({
        is_active: false,
        updated_by: userId,
        version_num: versionNum + 1,
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .eq('version_num', versionNum)
      .is('deleted_at', null);

    if (error) {
      throw new AppError('Failed to deactivate tax rate', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
  }

  // ─── Menu Item Mapping ────────────────────────────────────────

  async assignMenuItemProfile(tenantId: string, userId: string, payload: AssignMenuItemTaxProfileDTO): Promise<MenuItemTaxProfile> {
    // Soft delete any existing mappings for this menu item first (active ones)
    await this.supabase
      .from('menu_item_tax_profiles')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('tenant_id', tenantId)
      .eq('menu_item_id', payload.menu_item_id)
      .is('deleted_at', null);

    // Insert the new one
    const { data, error } = await this.supabase
      .from('menu_item_tax_profiles')
      .insert({
        tenant_id: tenantId,
        menu_item_id: payload.menu_item_id,
        tax_profile_id: payload.tax_profile_id,
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to assign tax profile to menu item', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as MenuItemTaxProfile;
  }

  // ─── Resolution ───────────────────────────────────────────────

  async resolveTax(tenantId: string, menuItemId: string, effectiveAt: string): Promise<ResolvedTaxRPC | null> {
    const { data, error } = await this.supabase
      .rpc('resolve_tax_for_menu_item', {
        p_tenant_id: tenantId,
        p_menu_item_id: menuItemId,
        p_effective_at: effectiveAt
      });

    if (error) {
      throw new AppError('Failed to resolve tax', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    if (!data || data.length === 0) return null;
    return data[0] as ResolvedTaxRPC;
  }

  async resolveBatchTax(tenantId: string, menuItemIds: string[], effectiveAt: string): Promise<ResolvedTaxBatchRPC[]> {
    const { data, error } = await this.supabase
      .rpc('resolve_tax_for_menu_items_batch', {
        p_tenant_id: tenantId,
        p_menu_item_ids: menuItemIds,
        p_effective_at: effectiveAt
      });

    if (error) {
      throw new AppError('Failed to batch resolve tax', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
    return data as ResolvedTaxBatchRPC[];
  }
}
