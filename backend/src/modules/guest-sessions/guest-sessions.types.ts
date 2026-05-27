export type GuestSessionStatus = 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'ABANDONED';

export interface GuestSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  status: GuestSessionStatus;
  device_fingerprints: string[];
  created_at: string;
  expires_at: string;
  last_active_at: string;
}
