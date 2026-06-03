import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { StaffResponse } from './staff.types';
import type { CreateStaffDTO, UpdateStaffDTO } from './staff.dtos';

export class StaffRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private mapToResponse(staff: any): StaffResponse & { employee_id?: string, branch_id?: string, email?: string } {
    return {
      id: staff.id,
      tenant_id: staff.tenant_id,
      name: staff.name,
      role: staff.role,
      pin: staff.pin,
      is_active: staff.is_active,
      employee_id: staff.employee_id,
      branch_id: staff.branch_id,
      email: staff.email,
    };
  }

  async getStaff(tenantId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('staff')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) {
      throw new AppError('Failed to fetch staff', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return (data as any[]).map(this.mapToResponse);
  }

  async getStaffById(tenantId: string, id: string): Promise<any | null> {
    const { data, error } = await this.supabase
      .from('staff')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new AppError('Failed to fetch staff by id', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return this.mapToResponse(data);
  }

  async createStaff(tenantId: string, payload: CreateStaffDTO): Promise<any> {
    const { data, error } = await this.supabase
      .from('staff')
      .insert({
        tenant_id: tenantId,
        name: payload.name,
        role: payload.role,
        pin: payload.pin,
        is_active: payload.is_active ?? true,
        employee_id: payload.employee_id || null,
        branch_id: payload.branch_id || null,
        email: (payload.email && payload.email.trim() !== '') ? payload.email : null,
      })
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to create staff', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return this.mapToResponse(data);
  }

  async updateStaff(tenantId: string, id: string, payload: UpdateStaffDTO): Promise<any> {
    const updates: any = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.role !== undefined) updates.role = payload.role;
    if (payload.pin !== undefined) updates.pin = payload.pin;
    if (payload.is_active !== undefined) updates.is_active = payload.is_active;
    if (payload.employee_id !== undefined) updates.employee_id = payload.employee_id || null;
    if (payload.branch_id !== undefined) updates.branch_id = payload.branch_id || null;
    if (payload.email !== undefined) updates.email = (payload.email && payload.email.trim() !== '') ? payload.email : null;

    const { data, error } = await this.supabase
      .from('staff')
      .update(updates)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError('Failed to update staff', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }

    return this.mapToResponse(data);
  }

  async deleteStaff(tenantId: string, id: string): Promise<void> {
    // Delete the record completely since there is no soft delete mechanism
    const { error } = await this.supabase
      .from('staff')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);

    if (error) {
      throw new AppError('Failed to delete staff', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
    }
  }
}
