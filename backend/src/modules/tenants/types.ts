export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'deleted';
  display_name: string | null;
  city: string | null;
  state: string | null;
  full_address: string | null;
  timezone: string | null;
  onboarding_step: number;
  onboarding_completed: boolean;
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
}
