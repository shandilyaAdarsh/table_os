// ============================================================
// src/modules/admin/onboarding/onboarding.admin.service.ts
// Service for Admin Onboarding workflows.
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';

// Fallback cache for remote databases missing the onboarding_state table
export const skippedTenantsFallback = new Set<string>();

export function resolveOnboardingStep(
  stepsCompleted: string[],
  isComplete: boolean,
  isSkipped: boolean
): number {
  if (isComplete || isSkipped) return 5;
  if (stepsCompleted.includes('tables_hours')) return 5;
  if (stepsCompleted.includes('gst_legal')) return 4;
  if (stepsCompleted.includes('business_config')) return 3;
  if (stepsCompleted.includes('restaurant_info')) return 2;
  return 1;
}

export interface RestaurantInfoPayload {
  display_name: string;
  city: string;
  state: string;
  full_address: string;
  timezone: string;
}

export interface BusinessConfigPayload {
  currency_code: string;
  business_type?: string;
  tax_registration_number?: string;
}

export interface GstLegalPayload {
  gstin?: string;
  fssai_license_number: string;
  gst_type: string;
  default_tax_rate: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
}

export interface TablesHoursPayload {
  number_of_tables: number;
  table_prefix: string;
  opening_time: string;
  closing_time: string;
}

async function advanceOnboardingStep(
  supabase: SupabaseClient,
  tenantId: string,
  stepKey: string,
  options?: { markComplete?: boolean }
): Promise<void> {
  const { data: existing, error: onboardingLookupError } = await supabase
    .from('onboarding_state')
    .select('steps_completed')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (onboardingLookupError) {
    throw new Error(
      `[OnboardingService] Failed to load onboarding state: ${onboardingLookupError.message}`
    );
  }

  const steps = new Set<string>([...(existing?.steps_completed ?? []), stepKey]);

  const { error: onboardingUpsertError } = await supabase.from('onboarding_state').upsert(
    {
      tenant_id: tenantId,
      steps_completed: Array.from(steps),
      is_complete: options?.markComplete ?? false,
    },
    { onConflict: 'tenant_id' }
  );

  if (onboardingUpsertError) {
    throw new Error(
      `[OnboardingService] Failed to save onboarding progress: ${onboardingUpsertError.message}`
    );
  }
}

async function getPrimaryBranchId(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string> {
  const { data: branches, error } = await supabase
    .from('branches')
    .select('id')
    .eq('tenant_id', tenantId)
    .neq('status', 'deleted')
    .limit(1);

  if (error) {
    throw new Error(`[OnboardingService] Failed to load branch: ${error.message}`);
  }

  if (!branches?.[0]?.id) {
    throw new Error('[OnboardingService] No active branch found for tenant');
  }

  return branches[0].id as string;
}

async function upsertRestaurantSettings(
  supabase: SupabaseClient,
  tenantId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError) {
    throw new Error(`[OnboardingService] Failed to load tenant: ${tenantError.message}`);
  }

  const { data: existing } = await supabase
    .from('restaurant_settings')
    .select('features_enabled, branding')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const mergedFeatures =
    patch.features_enabled && typeof patch.features_enabled === 'object'
      ? {
          ...((existing?.features_enabled as Record<string, unknown>) ?? {}),
          ...(patch.features_enabled as Record<string, unknown>),
        }
      : patch.features_enabled;

  const mergedBranding =
    patch.branding && typeof patch.branding === 'object'
      ? {
          ...((existing?.branding as Record<string, unknown>) ?? {}),
          ...(patch.branding as Record<string, unknown>),
        }
      : patch.branding;

  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    business_name: tenant?.name ?? 'Restaurant',
    updated_at: new Date().toISOString(),
    ...patch,
  };

  if (mergedFeatures !== undefined) payload.features_enabled = mergedFeatures;
  if (mergedBranding !== undefined) payload.branding = mergedBranding;

  const { error } = await supabase
    .from('restaurant_settings')
    .upsert(payload, { onConflict: 'tenant_id' });

  if (error) {
    console.warn(
      `[OnboardingService] restaurant_settings upsert skipped (${error.message})`
    );
  }
}

function percentToBasisPoints(rate: number): number {
  return Math.round(rate * 100);
}

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

  public async updateRestaurantInfo(
    supabase: SupabaseClient,
    tenantId: string,
    body: RestaurantInfoPayload
  ): Promise<void> {
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({ name: body.display_name, updated_at: new Date().toISOString() })
      .eq('id', tenantId);

    if (tenantError) {
      throw new Error(`[OnboardingService] Failed to update tenant: ${tenantError.message}`);
    }

    const { data: branches, error: branchLookupError } = await supabase
      .from('branches')
      .select('id')
      .eq('tenant_id', tenantId)
      .neq('status', 'deleted')
      .limit(1);

    if (branchLookupError) {
      throw new Error(`[OnboardingService] Failed to load branch: ${branchLookupError.message}`);
    }

    const branchPayload = {
      name: body.display_name,
      timezone: body.timezone,
      address: body.full_address,
      region: `${body.city}, ${body.state}`,
      updated_at: new Date().toISOString(),
    };

    if (branches?.[0]) {
      const { error: branchUpdateError } = await supabase
        .from('branches')
        .update(branchPayload)
        .eq('id', branches[0].id);

      if (branchUpdateError) {
        throw new Error(`[OnboardingService] Failed to update branch: ${branchUpdateError.message}`);
      }
    } else {
      const { error: branchInsertError } = await supabase.from('branches').insert({
        tenant_id: tenantId,
        status: 'active',
        ...branchPayload,
      });

      if (branchInsertError) {
        throw new Error(`[OnboardingService] Failed to create branch: ${branchInsertError.message}`);
      }
    }

    await advanceOnboardingStep(supabase, tenantId, 'restaurant_info');
  }

  public async updateBusinessConfig(
    supabase: SupabaseClient,
    tenantId: string,
    body: BusinessConfigPayload
  ): Promise<void> {
    const currencyCode = body.currency_code.trim().toUpperCase();
    if (currencyCode.length !== 3) {
      throw new Error('[OnboardingService] currency_code must be a 3-letter ISO code');
    }

    await upsertRestaurantSettings(supabase, tenantId, {
      currency_code: currencyCode,
      tax_registration_number: body.tax_registration_number?.trim() || null,
      features_enabled: body.business_type
        ? { business_type: body.business_type.trim() }
        : undefined,
    });

    await advanceOnboardingStep(supabase, tenantId, 'business_config');
  }

  public async updateGstLegalConfig(
    supabase: SupabaseClient,
    tenantId: string,
    body: GstLegalPayload,
    actorId: string
  ): Promise<void> {
    const { data: existingProfiles, error: profileLookupError } = await supabase
      .from('tax_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .ilike('name', 'default gst')
      .limit(1);

    if (profileLookupError) {
      console.warn(
        `[OnboardingService] tax_profiles lookup skipped: ${profileLookupError.message}`
      );
    }

    let taxProfileId = existingProfiles?.[0]?.id as string | undefined;

    if (!taxProfileId) {
      const { data: createdProfile, error: createProfileError } = await supabase
        .from('tax_profiles')
        .insert({
          tenant_id: tenantId,
          name: 'Default GST',
          description: 'Created during onboarding',
          calculation_mode: 'exclusive',
          priority: 100,
          is_active: true,
          created_by: actorId,
        })
        .select('id')
        .single();

      if (createProfileError) {
        console.warn(
          `[OnboardingService] tax_profiles insert skipped: ${createProfileError.message}`
        );
      } else {
        taxProfileId = createdProfile.id as string;
      }
    }

    if (taxProfileId) {
      const rateRows: Array<{
        name: string;
        rate_basis_points: number;
      }> = [];

      if (body.cgst_rate > 0) {
        rateRows.push({ name: 'CGST', rate_basis_points: percentToBasisPoints(body.cgst_rate) });
      }
      if (body.sgst_rate > 0) {
        rateRows.push({ name: 'SGST', rate_basis_points: percentToBasisPoints(body.sgst_rate) });
      }
      if (body.igst_rate > 0) {
        rateRows.push({ name: 'IGST', rate_basis_points: percentToBasisPoints(body.igst_rate) });
      }
      if (rateRows.length === 0 && body.default_tax_rate > 0) {
        rateRows.push({
          name: 'GST',
          rate_basis_points: percentToBasisPoints(body.default_tax_rate),
        });
      }

      for (const row of rateRows) {
        const { error: rateError } = await supabase.from('tax_rates').insert({
          tenant_id: tenantId,
          tax_profile_id: taxProfileId,
          name: row.name,
          rate_basis_points: row.rate_basis_points,
          priority: 100,
          is_active: true,
          created_by: actorId,
        });

        if (rateError) {
          console.warn(
            `[OnboardingService] tax_rates insert skipped (${row.name}): ${rateError.message}`
          );
        }
      }
    }

    await upsertRestaurantSettings(supabase, tenantId, {
      features_enabled: {
        gst_type: body.gst_type,
        fssai_license_number: body.fssai_license_number.trim(),
        default_tax_rate: body.default_tax_rate,
      },
      branding: body.gstin?.trim()
        ? { gstin: body.gstin.trim() }
        : undefined,
    });

    await advanceOnboardingStep(supabase, tenantId, 'gst_legal');
  }

  public async updateTablesAndHours(
    supabase: SupabaseClient,
    tenantId: string,
    body: TablesHoursPayload,
    actorId: string
  ): Promise<void> {
    const branchId = await getPrimaryBranchId(supabase, tenantId);
    const prefix = body.table_prefix.trim().toUpperCase();

    const { data: floors, error: floorError } = await supabase
      .from('table_floors')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .is('deleted_at', null)
      .limit(1);

    if (floorError) {
      throw new Error(`[OnboardingService] Failed to load floors: ${floorError.message}`);
    }

    let floorId = floors?.[0]?.id as string | undefined;

    if (!floorId) {
      const { data: newFloor, error: createFloorError } = await supabase
        .from('table_floors')
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          name: 'Main Floor',
          sort_order: 0,
        })
        .select('id')
        .single();

      if (createFloorError) {
        throw new Error(`[OnboardingService] Failed to create floor: ${createFloorError.message}`);
      }
      floorId = newFloor.id as string;
    }

    const { count: existingCount, error: countError } = await supabase
      .from('tables')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .is('deleted_at', null);

    if (countError) {
      throw new Error(`[OnboardingService] Failed to count tables: ${countError.message}`);
    }

    const tablesToCreate = Math.max(0, body.number_of_tables - (existingCount ?? 0));
    const startIndex = (existingCount ?? 0) + 1;

    for (let i = 0; i < tablesToCreate; i++) {
      const tableNumber = `${prefix}${startIndex + i}`;
      const { error: tableError } = await supabase.from('tables').insert({
        tenant_id: tenantId,
        branch_id: branchId,
        floor_id: floorId,
        table_number: tableNumber,
        display_name: `Table ${tableNumber}`,
        capacity: 4,
        sort_order: startIndex + i,
        created_by: actorId,
      });

      if (tableError) {
        throw new Error(`[OnboardingService] Failed to create table ${tableNumber}: ${tableError.message}`);
      }
    }

    await upsertRestaurantSettings(supabase, tenantId, {
      operating_hours: {
        default: {
          open: body.opening_time,
          close: body.closing_time,
        },
      },
    });

    await advanceOnboardingStep(supabase, tenantId, 'tables_hours', { markComplete: true });
  }
}
