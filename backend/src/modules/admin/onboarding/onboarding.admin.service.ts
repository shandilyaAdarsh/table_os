// ============================================================
// src/modules/admin/onboarding/onboarding.admin.service.ts
// Service for Admin Onboarding workflows.
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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
   * Updates restaurant info and increments onboarding step
   */
  public async updateRestaurantInfo(supabase: SupabaseClient, tenantId: string, payload: any): Promise<any> {
    const { data, error } = await supabase
      .from('tenants')
      .update({
        display_name: payload.display_name,
        city: payload.city,
        state: payload.state,
        full_address: payload.full_address,
        timezone: payload.timezone,
        onboarding_step: 2, // Move to step 2
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .select()
      .single();

    if (error) {
      console.error(`[OnboardingService] Failed to update restaurant info for tenant ${tenantId}:`, error);
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Updates business configuration and increments onboarding step
   */
  public async updateBusinessConfig(supabase: SupabaseClient, tenantId: string, payload: any): Promise<any> {
    const { data, error } = await supabase
      .from('tenants')
      .update({
        currency_code: payload.currency_code,
        business_type: payload.business_type,
        tax_registration_number: payload.tax_registration_number,
        onboarding_step: 3, // Move to step 3
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .select()
      .single();

    if (error) {
      console.error(`[OnboardingService] Failed to update business config for tenant ${tenantId}:`, error);
      throw new Error(error.message);
    }
    
    return data;
  }
  /**
   * Updates GST/Legal configuration, initializes tax engine, and increments onboarding step
   */
  public async updateGstLegalConfig(supabase: SupabaseClient, tenantId: string, payload: any): Promise<any> {
    // 1. Upsert into tenant_tax_configuration
    const { error: taxConfigError } = await supabase
      .from('tenant_tax_configuration')
      .upsert({
        tenant_id: tenantId,
        gstin: payload.gstin || null,
        fssai_license_number: payload.fssai_license_number,
        gst_type: payload.gst_type,
        default_tax_rate: payload.default_tax_rate,
        cgst_rate: payload.cgst_rate,
        sgst_rate: payload.sgst_rate,
        igst_rate: payload.igst_rate,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id' });

    if (taxConfigError) {
      console.error(`[OnboardingService] Failed to upsert tenant_tax_configuration for tenant ${tenantId}:`, taxConfigError);
      throw new Error(taxConfigError.message);
    }

    // 2. Check if a default tax profile already exists to maintain idempotency
    const { data: existingProfile } = await supabase
      .from('tax_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_default', true)
      .maybeSingle();

    if (!existingProfile) {
      // Create default tax profile
      const { data: taxProfile, error: profileError } = await supabase
        .from('tax_profiles')
        .insert({
          tenant_id: tenantId,
          name: 'Default Restaurant GST',
          calculation_mode: 'exclusive',
          is_active: true,
          is_default: true,
          priority: 1
        })
        .select()
        .single();

      if (profileError) {
        console.error(`[OnboardingService] Failed to create tax_profile for tenant ${tenantId}:`, profileError);
        throw new Error(profileError.message);
      }

      const taxProfileId = taxProfile.id;
      const taxRates = [];

      if (payload.gst_type === 'Intra-state') {
        if (payload.cgst_rate > 0) {
          taxRates.push({
            tenant_id: tenantId,
            tax_profile_id: taxProfileId,
            name: 'CGST',
            rate_basis_points: Math.round(payload.cgst_rate * 100),
            priority: 1,
            is_active: true
          });
        }
        if (payload.sgst_rate > 0) {
          taxRates.push({
            tenant_id: tenantId,
            tax_profile_id: taxProfileId,
            name: 'SGST',
            rate_basis_points: Math.round(payload.sgst_rate * 100),
            priority: 2,
            is_active: true
          });
        }
      } else if (payload.gst_type === 'Inter-state') {
        if (payload.igst_rate > 0) {
          taxRates.push({
            tenant_id: tenantId,
            tax_profile_id: taxProfileId,
            name: 'IGST',
            rate_basis_points: Math.round(payload.igst_rate * 100),
            priority: 1,
            is_active: true
          });
        }
      } else if (payload.gst_type === 'Composition Scheme') {
        if (payload.default_tax_rate > 0) {
           taxRates.push({
            tenant_id: tenantId,
            tax_profile_id: taxProfileId,
            name: 'Composition GST',
            rate_basis_points: Math.round(payload.default_tax_rate * 100),
            priority: 1,
            is_active: true
          });
        }
      }

      if (taxRates.length > 0) {
        const { error: ratesError } = await supabase
          .from('tax_rates')
          .insert(taxRates);
        
        if (ratesError) {
          console.error(`[OnboardingService] Failed to create tax_rates for tenant ${tenantId}:`, ratesError);
          throw new Error(ratesError.message);
        }
      }
    }

    // 3. Move to step 4 (Assuming Step 1=Info, Step 2=Business, Step 3=GST, Step 4=Branch Setup)
    // Wait, let's bump it to 4 because the prompt said GST is Step 3, Branch is Step 4.
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .update({
        onboarding_step: 4,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .select()
      .single();

    if (tenantError) {
      console.error(`[OnboardingService] Failed to update onboarding_step for tenant ${tenantId}:`, tenantError);
      throw new Error(tenantError.message);
    }
    
    return tenantData;
  }

  /**
   * Updates tables and operating hours, generates QR tokens, and increments onboarding step to 5.
   */
  public async updateTablesAndHours(supabase: SupabaseClient, tenantId: string, payload: any): Promise<any> {
    // 1. Convert times (e.g., "11:00 AM" to "11:00:00")
    const formatTime = (timeStr: string) => {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
      if (!match) return timeStr;
      let [_, hours, minutes, ampm] = match;
      let h = parseInt(hours, 10);
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      }
      return `${h.toString().padStart(2, '0')}:${minutes}:00`;
    };

    const openTime = formatTime(payload.opening_time);
    const closeTime = formatTime(payload.closing_time);

    // 2. Fetch tenant timezone and default branch
    const { data: tenantInfo, error: tenantError } = await supabase
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .single();

    if (tenantError) throw new Error(`Failed to fetch tenant timezone: ${tenantError.message}`);
    const timezone = tenantInfo.timezone || 'UTC';

    let { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id')
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    if (branchError) throw new Error(`Failed to fetch branch: ${branchError.message}`);
    
    // Auto-create a default branch if it doesn't exist
    if (!branch) {
      const { data: newBranch, error: createBranchError } = await supabase
        .from('branches')
        .insert({
          tenant_id: tenantId,
          name: 'Main Branch',
          timezone: timezone,
        })
        .select('id')
        .single();
        
      if (createBranchError) throw new Error(`Failed to create default branch: ${createBranchError.message}`);
      branch = newBranch;
    }

    const branchId = branch.id;

    // 3. Upsert Branch Operating Hours
    const hoursToInsert = [];
    for (let day = 0; day <= 6; day++) {
      hoursToInsert.push({
        tenant_id: tenantId,
        branch_id: branchId,
        day_of_week: day,
        open_time: openTime,
        close_time: closeTime,
        timezone: timezone,
        updated_at: new Date().toISOString()
      });
    }

    const { error: hoursError } = await supabase
      .from('branch_operating_hours')
      .upsert(hoursToInsert, { onConflict: 'branch_id, day_of_week' });

    if (hoursError) throw new Error(`Failed to insert operating hours: ${hoursError.message}`);

    // 4. Check Idempotency for Tables
    const { data: existingTables, error: checkTablesError } = await supabase
      .from('tables')
      .select('table_number')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId);

    if (checkTablesError) throw new Error(`Failed to check existing tables: ${checkTablesError.message}`);
    
    const existingTableNumbers = new Set(existingTables.map(t => t.table_number));

    // 5. Prepare New Tables
    const tablesToInsert: any[] = [];
    const prefix = payload.table_prefix.toUpperCase();
    
    // Pre-generate UUIDs for tables so we can build the QR codes immediately
    for (let i = 1; i <= payload.number_of_tables; i++) {
      const tableNumber = `${prefix}${i}`;
      if (!existingTableNumbers.has(tableNumber)) {
        tablesToInsert.push({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          branch_id: branchId,
          table_number: tableNumber,
          status: 'available',
          qr_token: null // Initialize to avoid TS error
        });
      }
    }

    // 6. Generate QRs
    const qrsToInsert: any[] = [];
    const salt = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();

    tablesToInsert.forEach(t => {
      // HMAC_SHA256(table_id + tenant_id + salt + timestamp)
      const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback_secret');
      hmac.update(`${t.id}${tenantId}${salt}${timestamp}`);
      
      // We take a substring for a short, non-guessable URL token
      const qrToken = hmac.digest('base64url').substring(0, 10);
      t.qr_token = qrToken;
      
      qrsToInsert.push({
        table_id: t.id,
        tenant_id: tenantId,
        qr_token: qrToken,
        qr_url: `https://app.orderlli.com/t/${qrToken}`
      });
    });

    // 7. Bulk Insert Tables and QRs
    if (tablesToInsert.length > 0) {
      const { error: insertTablesError } = await supabase
        .from('tables')
        .insert(tablesToInsert);
        
      if (insertTablesError) {
        // Pseudo-rollback happens inherently if this throws before updating onboarding_step
        throw new Error(`Failed to insert tables: ${insertTablesError.message}`);
      }

      const { error: insertQrsError } = await supabase
        .from('table_qr_codes')
        .insert(qrsToInsert);

      if (insertQrsError) {
        throw new Error(`Failed to insert table QR codes: ${insertQrsError.message}`);
      }
    }

    // 8. Update Onboarding Step to 4 and complete onboarding
    const { data: tenantData, error: tenantUpdateError } = await supabase
      .from('tenants')
      .update({
        onboarding_step: 4,
        onboarding_completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId)
      .select()
      .single();

    if (tenantUpdateError) {
      throw new Error(`Failed to update onboarding_step: ${tenantUpdateError.message}`);
    }

    return tenantData;
  }
}
