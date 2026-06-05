// ============================================================
// src/modules/admin/dashboard/dashboard.admin.service.ts
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export class AdminDashboardService {
  public async dismissQrBanner(supabase: SupabaseClient, tenantId: string): Promise<void> {
    const { error } = await supabase
      .from('tenants')
      .update({ dismissed_qr_banner: true })
      .eq('id', tenantId);

    if (error) {
      throw new Error(`[AdminDashboardService] Failed to dismiss QR banner: ${error.message}`);
    }
  }
}
