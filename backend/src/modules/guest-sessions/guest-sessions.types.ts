export type GuestSessionStatus = 'ACTIVE' | 'EXPIRED' | 'COMPLETED' | 'ABANDONED' | 'CLOSED';

export interface GuestSessionData {
  device_fingerprints: string[];
  expires_at: string;
  [key: string]: any;
}

export interface GuestSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  is_active: boolean;
  guest_identifier: string;
  session_data: GuestSessionData;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}
