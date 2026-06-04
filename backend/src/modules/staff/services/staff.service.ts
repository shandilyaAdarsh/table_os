import { SupabaseClient } from '@supabase/supabase-js';

export class StaffService {
  /**
   * Helper to fetch the primary branch ID for a tenant if none is provided.
   */
  private static async getPrimaryBranchId(
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
      throw new Error(`Failed to load branch: ${error.message}`);
    }

    if (!branches?.[0]?.id) {
      throw new Error('No active branch found for tenant');
    }

    return branches[0].id as string;
  }

  static async listStaff(supabase: SupabaseClient, tenantId: string) {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) throw error;

    return (data || []).map((staff) => ({
      id: staff.id,
      tenant_id: staff.tenant_id,
      name: staff.name || 'Unknown',
      role: (staff.role || 'waiter').toLowerCase(),
      pin: staff.pin || '----',
      is_active: staff.is_active ?? true,
      employee_id: staff.employee_id,
      branch_id: staff.branch_id,
      email: staff.email,
    }));
  }

  static async createStaff(
    supabase: SupabaseClient,
    tenantId: string,
    payload: any
  ) {
    let branchId = payload.branch_id;
    if (!branchId) {
      branchId = await this.getPrimaryBranchId(supabase, tenantId);
    }

    const { data, error } = await supabase
      .from('staff')
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        name: payload.name,
        pin: payload.pin,
        role: (payload.role || 'waiter').toLowerCase(),
        is_active: payload.is_active !== false,
        employee_id: payload.employee_id || null,
        email: payload.email || null,
        auth_type: 'pin',
      })
      .select('*')
      .single();

    if (error) throw error;

    return {
      id: data.id,
      tenant_id: data.tenant_id,
      name: data.name,
      role: (data.role || 'waiter').toLowerCase(),
      pin: data.pin,
      is_active: data.is_active,
      employee_id: data.employee_id,
      branch_id: data.branch_id,
      email: data.email,
    };
  }

  static async updateStaff(
    supabase: SupabaseClient,
    tenantId: string,
    staffId: string,
    payload: any
  ) {
    const updateData: any = {};

    if (payload.name !== undefined) {
      updateData.name = payload.name;
    }

    if (payload.role !== undefined) {
      updateData.role = payload.role.toLowerCase();
    }

    if (payload.pin !== undefined) {
      updateData.pin = payload.pin;
    }

    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active;
    }

    if (payload.branch_id !== undefined) {
      updateData.branch_id = payload.branch_id;
    }

    if (payload.employee_id !== undefined) {
      updateData.employee_id = payload.employee_id;
    }

    if (payload.email !== undefined) {
      updateData.email = payload.email;
    }

    const { data, error } = await supabase
      .from('staff')
      .update(updateData)
      .eq('id', staffId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) throw error;

    return {
      id: data.id,
      tenant_id: data.tenant_id,
      name: data.name,
      role: (data.role || 'waiter').toLowerCase(),
      pin: data.pin,
      is_active: data.is_active,
      employee_id: data.employee_id,
      branch_id: data.branch_id,
      email: data.email,
    };
  }

  static async deleteStaff(
    supabase: SupabaseClient,
    tenantId: string,
    staffId: string
  ) {
    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('id', staffId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return true;
  }
}
