// ============================================================
// src/modules/admin/onboarding/onboarding.admin.service.ts
// Service for Admin Onboarding workflows.
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';

// Fallback cache for remote databases missing the onboarding_state table
export const skippedTenantsFallback = new Set<string>();

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

  /**
   * Marks the onboarding as skipped for a given tenant.
   */
  public async skipOnboarding(supabase: SupabaseClient, tenantId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('onboarding_state')
        .upsert(
          { tenant_id: tenantId, is_skipped: true },
          { onConflict: 'tenant_id' }
        );
      
      if (error) {
        console.warn(`[OnboardingService] Table onboarding_state is missing on remote database. Recording skip in-memory: ${error.message}`);
        skippedTenantsFallback.add(tenantId);
      } else {
        console.log(`[OnboardingService] Successfully skipped onboarding for tenant ${tenantId} in database.`);
      }
    } catch (err) {
      console.warn(`[OnboardingService] Exception during skipOnboarding. Recording skip in-memory`, err);
      skippedTenantsFallback.add(tenantId);
    }
  }
}
