import { supabaseAdmin } from '../../../config/supabase';
import type { Tenant, Branch, CreateTenantRequest, CreateBranchRequest } from '../types';

/**
 * Ensures strict tenant isolation by always appending .eq('tenant_id', tenantId)
 * to branch queries unless the user is a SUPER_ADMIN.
 */

export async function findTenantById(id: string): Promise<Tenant | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('id', id)
    .neq('status', 'deleted')
    .single();

  if (error) {
    console.error(`[findTenantById] Supabase error for ${id}:`, error);
  }

  if (error || !data) return null;
  return data as Tenant;
}

export async function findBranchesByTenantId(tenantId: string): Promise<Branch[]> {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('*')
    .eq('tenant_id', tenantId)
    .neq('status', 'deleted')
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
  return data as Branch[];
}

export async function createTenant(req: CreateTenantRequest): Promise<Tenant> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .insert([
      {
        name: req.name,
        slug: req.slug,
        status: 'active',
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Tenant;
}

export async function createBranch(req: CreateBranchRequest): Promise<Branch> {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .insert([
      {
        tenant_id: req.tenant_id,
        name: req.name,
        timezone: req.timezone ?? 'UTC',
        status: 'active',
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Branch;
}
