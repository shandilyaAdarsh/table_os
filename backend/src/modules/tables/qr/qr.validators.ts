// ============================================================
// src/modules/qr/qr.validators.ts
// Zod schemas for QR code and session requests.
// ============================================================

import { z } from 'zod';

export const CreateQrCodeSchema = z.object({
  branch_id: z.string().uuid(),
  table_id: z.string().uuid(),
  code_slug: z.string().min(4).max(64).optional(),
}).strict();

export const InvalidateQrCodeSchema = z.object({
  reason: z.string().max(500).optional(),
}).strict();

export const ResolveQrSessionSchema = z.object({
  signed_payload: z.string().min(10),
  nonce: z.string().min(8).max(128),
  device_fingerprint: z.string().min(16).max(128).optional(),
}).strict();

export const QrSessionTokenSchema = z.object({
  session_token: z.string().min(10),
}).strict();

export type CreateQrCodeInput = z.infer<typeof CreateQrCodeSchema>;
export type InvalidateQrCodeInput = z.infer<typeof InvalidateQrCodeSchema>;
export type ResolveQrSessionInput = z.infer<typeof ResolveQrSessionSchema>;
export type QrSessionTokenInput = z.infer<typeof QrSessionTokenSchema>;
