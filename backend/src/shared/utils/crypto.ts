// ============================================================
// src/shared/utils/crypto.ts
// Secure hashing utilities — Node built-ins only.
// No custom crypto implementations.
// ============================================================

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * SHA-256 hash of a token for safe storage.
 * Never store raw tokens in DB — always store the hash.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Derive a stable device fingerprint from request metadata.
 * Used for session tracking and replay detection — not for security isolation.
 * Returns first 32 hex chars of SHA-256.
 */
export function deriveDeviceFingerprint(params: {
  userAgent: string;
  acceptLanguage?: string;
  clientHint?: string;
}): string {
  const raw = [params.userAgent, params.acceptLanguage ?? '', params.clientHint ?? '']
    .join('|')
    .toLowerCase();
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * Generate a cryptographically random token.
 * Default: 32 bytes = 64 hex characters.
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Use when comparing secrets, hashes, or tokens.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}
