// ============================================================
// src/modules/qr/qr.dtos.ts
// DTOs for QR code and session management.
// ============================================================

export interface CreateQrCodeDto {
  branch_id: string;
  table_id: string;
  code_slug?: string;
}

export interface InvalidateQrCodeDto {
  reason?: string;
}

export interface ResolveQrSessionDto {
  signed_payload: string;
  nonce: string;
  device_fingerprint?: string;
}

export interface QrSessionPublicDto {
  session_id: string;
  session_token: string;
  branch_id: string;
  table_id: string;
  expires_at: string;
}
