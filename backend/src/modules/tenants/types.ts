export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  timezone: string;
  status: 'active' | 'inactive' | 'deleted';
  address: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
}

export interface CreateBranchRequest {
  tenant_id: string;
  name: string;
  timezone?: string;
  address?: string;
  phone?: string;
  email?: string;
  region?: string;
}

export interface UpdateBranchRequest {
  name?: string;
  timezone?: string;
  status?: 'active' | 'inactive';
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  region?: string | null;
}
