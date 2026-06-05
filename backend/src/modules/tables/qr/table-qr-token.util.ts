// ============================================================
// Permanent table QR tokens (HMAC-sealed, base64url-encoded).
// ============================================================

import crypto from 'crypto';
import { env } from '../../../config/env';

export interface DecodedTableToken {
  tableId: string;
  tenantId: string;
  branchId: string;
}

export function getQrSecretSalt(): string {
  return process.env.QR_SECRET_SALT ?? env.QR_SIGNING_SECRET;
}

export function getCustomerAppBaseUrl(): string {
  return process.env.CUSTOMER_APP_URL ?? 'https://app.orderlli.com';
}

export function generateTableToken(
  tableId: string,
  tenantId: string,
  branchId: string,
): string {
  const payload = `${tableId}:${tenantId}:${branchId}`;
  const hmac = crypto
    .createHmac('sha256', getQrSecretSalt())
    .update(payload)
    .digest('hex')
    .slice(0, 12);
  const raw = `${tableId}:${tenantId}:${branchId}:${hmac}`;
  return Buffer.from(raw).toString('base64url');
}

export function decodeAndVerifyTableToken(token: string): DecodedTableToken {
  let raw: string;
  try {
    raw = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    throw new Error('Invalid QR token');
  }

  const parts = raw.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid QR token');
  }

  const [tableId, tenantId, branchId, hmac] = parts;
  const expected = crypto
    .createHmac('sha256', getQrSecretSalt())
    .update(`${tableId}:${tenantId}:${branchId}`)
    .digest('hex')
    .slice(0, 12);

  if (hmac !== expected) {
    throw new Error('Invalid QR token');
  }

  return { tableId, tenantId, branchId };
}

export function buildTableQrUrl(token: string): string {
  return `${getCustomerAppBaseUrl()}/t/${token}`;
}
