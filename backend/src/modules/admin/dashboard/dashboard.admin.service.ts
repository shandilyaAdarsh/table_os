import { SupabaseClient } from '@supabase/supabase-js';

export class AdminDashboardService {
  constructor(private supabase: SupabaseClient) {}

  async dismissQrBanner(tenantId: string) {
    const { error } = await this.supabase
      .from('tenants')
      .update({
        dismissed_qr_banner: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (error) {
      throw new Error(`Failed to dismiss QR banner: ${error.message}`);
    }
  }
}
