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
    const { data, error } = await supabase.rpc('get_onboarding_status', { p_tenant_id: tenantId });
    if (error) {
      throw new AppError(`Failed to fetch onboarding status: ${error.message}`, 500, 'INTERNAL_SERVER_ERROR');
    }
    return data;
  }
}
