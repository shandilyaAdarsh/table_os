// ============================================================
// src/modules/qr/qr.types.ts
// TypeScript interfaces matching the DB schema for QR session management.
// ============================================================

export type QrSessionStatus = 'active' | 'expired' | 'completed' | 'invalidated';

export interface QrCode {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  code_slug: string;
  signed_payload: string;
  is_active: boolean;
  generated_by: string | null;
  generated_at: string;
  invalidated_at: string | null;
  invalidated_by: string | null;
}

export interface QrScanNonce {
  id: string;
  tenant_id: string;
  qr_code_id: string;
  nonce: string;
  used_at: string;
  client_ip: string | null;
  user_agent: string | null;
}

export interface QrSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  qr_code_id: string;
  nonce_id: string;
  session_token: string;
  status: QrSessionStatus;
  device_fingerprint: string | null;
  client_ip: string | null;
  user_agent: string | null;
  activated_at: string;
  last_activity_at: string;
  expires_at: string;
  completed_at: string | null;
  invalidated_at: string | null;
  invalidated_by: string | null;
  version_num: number;
  created_at: string;
  updated_at: string;
}

// Session TTL in seconds (30 minutes default)
export const QR_SESSION_TTL_SECONDS = 30 * 60;

// QR signed payload structure (embedded in QR code URL)
export interface QrSignedPayload {
  table_id: string;
  branch_id: string;
  tenant_id: string;
  code_slug: string;
  qr_code_id: string;
  issued_at: number; // unix timestamp
  signature: string; // HMAC-SHA256 of payload fields
}
