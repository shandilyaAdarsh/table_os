export type GuestSessionStatus = 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'ABANDONED' | 'CLOSED';

export interface GuestSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  status: GuestSessionStatus;
  device_fingerprints: string[];
  snapshot_id: string | null;
  customer_identity_id: string;
  created_at: string;
  expires_at: string;
  last_active_at: string;
  closed_at: string | null;
}
