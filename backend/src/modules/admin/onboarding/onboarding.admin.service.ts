// ============================================================
// src/modules/admin/onboarding/onboarding.admin.service.ts
// Service for Admin Onboarding workflows.
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../../shared/errors/AppError';

export class AdminOnboardingService {
  /**
   * Fetches the aggregated onboarding status for a tenant using a single RPC call.
   */
  public async getOnboardingStatus(supabase: SupabaseClient, tenantId: string): Promise<any> {
    try {
      const { data, error } = await supabase.rpc('get_onboarding_status', { p_tenant_id: tenantId });
      
      if (error) {
        console.error(`[OnboardingService] Failed to fetch onboarding status via RPC for tenant ${tenantId}:`, error);
        return this.getFallbackStatus(tenantId);
      }
      
      return data;
    } catch (err) {
      console.error(`[OnboardingService] Unhandled exception fetching onboarding status for tenant ${tenantId}:`, err);
      return this.getFallbackStatus(tenantId);
    }
  }

  private getFallbackStatus(tenantId: string) {
    return {
      tenant_id: tenantId,
      has_categories: false,
      has_menu_items: false,
      has_tax_profiles: false,
      has_tables: false,
      has_staff: false,
      has_kds_stations: false,
      setup_stage: 'EMPTY',
      is_operational: false
    };
  }
}
