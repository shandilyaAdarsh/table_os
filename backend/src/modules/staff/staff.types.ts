export interface Staff {
  id: string;
  tenant_id: string;
  branch_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  pin_code_hash: string | null;
  role: string;
  status: 'active' | 'inactive' | 'deleted';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Format returned to the frontend
export interface StaffResponse {
  id: string;
  tenant_id: string;
  name: string;
  role: string;
  pin: string;
  is_active: boolean;
}
