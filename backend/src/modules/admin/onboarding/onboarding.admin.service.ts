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
        return this.getFallbackStatus(supabase, tenantId);
      }
      
      return data;
    } catch (err) {
      console.error(`[OnboardingService] Unhandled exception fetching onboarding status for tenant ${tenantId}:`, err);
      return this.getFallbackStatus(supabase, tenantId);
    }
  }

  private async getFallbackStatus(supabase: SupabaseClient, tenantId: string) {
    try {
      const [taxRes, tableRes, menuRes, catRes] = await Promise.all([
        supabase.from('tax_profiles').select('id').eq('tenant_id', tenantId).limit(1),
        supabase.from('tables').select('id').eq('tenant_id', tenantId).limit(1),
        supabase.from('menu_items').select('id').eq('tenant_id', tenantId).limit(1),
        supabase.from('categories').select('id').eq('tenant_id', tenantId).limit(1)
      ]);

      return {
        tenant_id: tenantId,
        has_categories: (catRes.data && catRes.data.length > 0) || false,
        has_menu_items: (menuRes.data && menuRes.data.length > 0) || false,
        has_tax_profiles: (taxRes.data && taxRes.data.length > 0) || false,
        has_tables: (tableRes.data && tableRes.data.length > 0) || false,
        has_staff: false,
        has_kds_stations: false,
        setup_stage: 'IN_PROGRESS',
        is_operational: false
      };
    } catch (e) {
      console.warn(`[OnboardingService] Fallback calculation failed:`, e);
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

  /**
   * Marks the onboarding as skipped for a given tenant.
   */
  public async skipOnboarding(supabase: SupabaseClient, tenantId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('onboarding_state')
        .upsert(
          { tenant_id: tenantId, is_complete: true },
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

  /**
   * Updates the restaurant info for a tenant during onboarding.
   */
  public async updateRestaurantInfo(supabase: SupabaseClient, tenantId: string, payload: any): Promise<void> {
    try {
      if (payload.display_name) {
        const { error } = await supabase
          .from('tenants')
          .update({ name: payload.display_name })
          .eq('id', tenantId);
        
        if (error) {
          console.warn(`[OnboardingService] Failed to update tenant name for ${tenantId}: ${error.message}`);
        }

        // Keep the branch name in sync with the restaurant name for a single-branch setup
        const { data: branches } = await supabase.from('branches').select('id').eq('tenant_id', tenantId);
        if (branches && branches.length > 0) {
          await supabase.from('branches').update({ 
            name: payload.display_name,
            timezone: payload.timezone || 'Asia/Kolkata'
          }).eq('id', branches[0].id);
        } else {
          await supabase.from('branches').insert({
            tenant_id: tenantId,
            name: payload.display_name,
            status: 'active',
            timezone: payload.timezone || 'Asia/Kolkata'
          });
        }
      }

      // Fetch current steps
      const { data: stateData } = await supabase
        .from('onboarding_state')
        .select('steps_completed')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      let steps = (stateData?.steps_completed as string[]) || [];
      if (!steps.includes('restaurant_info')) {
        steps.push('restaurant_info');
      }

      await supabase
        .from('onboarding_state')
        .upsert({
          tenant_id: tenantId,
          steps_completed: steps,
          is_complete: false,
        }, { onConflict: 'tenant_id' });

      console.log(`[OnboardingService] Successfully processed restaurant info for tenant ${tenantId}. Steps: ${steps.join(', ')}`);
    } catch (err) {
      console.warn(`[OnboardingService] Exception during updateRestaurantInfo for tenant ${tenantId}`, err);
    }
  }
  public async updateBusinessConfig(supabase: SupabaseClient, tenantId: string, _payload: any): Promise<void> {
    await this.markStepCompleted(supabase, tenantId, 'business_config');
  }

  public async updateGstLegal(supabase: SupabaseClient, tenantId: string, payload: any): Promise<void> {
    await this.markStepCompleted(supabase, tenantId, 'gst_legal');

    // Create a default tax profile if none exists
    const { data: existingProfiles } = await supabase.from('tax_profiles').select('id').eq('tenant_id', tenantId);
    if (!existingProfiles || existingProfiles.length === 0) {
      await supabase.from('tax_profiles').insert({
        tenant_id: tenantId,
        name: 'Default GST',
        description: `GST Type: ${payload.gst_type}, GSTIN: ${payload.gstin || 'N/A'}`,
        calculation_mode: 'exclusive', 
        priority: 1,
        is_active: true
      });
    }
  }

  public async updateTablesHours(supabase: SupabaseClient, tenantId: string, payload: any): Promise<void> {
    await this.markStepCompleted(supabase, tenantId, 'tables_hours');

    // Find branch id
    let { data: branchData } = await supabase.from('branches').select('id').eq('tenant_id', tenantId).maybeSingle();
    
    if (!branchData || !branchData.id) {
      const { data: insertedBranch } = await supabase.from('branches').insert({
        tenant_id: tenantId,
        name: 'Main Branch',
        status: 'active',
        timezone: 'Asia/Kolkata'
      }).select().single();
      branchData = insertedBranch;
    }

    if (branchData && branchData.id) {
      // Create tables if none exists
      const { data: existingTables } = await supabase.from('tables').select('id').eq('tenant_id', tenantId).eq('branch_id', branchData.id);
      if (!existingTables || existingTables.length === 0) {
        const numTables = payload.number_of_tables || 10;
        const prefix = payload.table_prefix || 'T';
        
        const tablesToInsert = [];
        for (let i = 1; i <= numTables; i++) {
          tablesToInsert.push({
            tenant_id: tenantId,
            branch_id: branchData.id,
            table_number: `${prefix}${i}`,
            capacity: 4,
            is_active: true,
            status: 'available'
          });
        }
        if (tablesToInsert.length > 0) {
          await supabase.from('tables').insert(tablesToInsert);
        }
      }
    }
  }

  private async markStepCompleted(supabase: SupabaseClient, tenantId: string, stepName: string): Promise<void> {
    try {
      const { data: stateData } = await supabase
        .from('onboarding_state')
        .select('steps_completed')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      let steps = (stateData?.steps_completed as string[]) || [];
      if (!steps.includes(stepName)) {
        steps.push(stepName);
      }

      await supabase
        .from('onboarding_state')
        .upsert({
          tenant_id: tenantId,
          steps_completed: steps,
        }, { onConflict: 'tenant_id' });
    } catch (error) {
      console.warn(`[OnboardingService] Failed to mark step ${stepName} completed for ${tenantId}`, error);
    }
  }
}
