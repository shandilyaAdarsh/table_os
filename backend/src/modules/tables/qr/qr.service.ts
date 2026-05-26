// ============================================================
// src/modules/qr/qr.service.ts
// Business logic for QR code validation and session issuance.
// ============================================================

import { env } from '../../../config/env';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { generateSecureToken, hmacSha256, safeCompare } from '../../../shared/utils/crypto';
import { randomUUID } from 'crypto';
import * as qrRepo from './qr.repository';
import * as tableRepo from '../repositories/table.repository';
import type { CreateQrCodeDto, ResolveQrSessionDto, QrSessionPublicDto } from './qr.dtos';
import type { QrSignedPayload, QrSession } from './qr.types';
import { QR_SESSION_TTL_SECONDS } from './qr.types';

function buildSignature(payload: Omit<QrSignedPayload, 'signature'>): string {
  const raw = [
    payload.table_id,
    payload.branch_id,
    payload.tenant_id,
    payload.code_slug,
    payload.qr_code_id,
    String(payload.issued_at),
  ].join('|');
  return hmacSha256(raw, env.QR_SIGNING_SECRET);
}

function signSessionToken(rawToken: string): string {
  const sig = hmacSha256(rawToken, env.QR_SESSION_SECRET);
  return `${rawToken}.${sig}`;
}

function verifySessionToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [raw, sig] = parts;
  return safeCompare(hmacSha256(raw, env.QR_SESSION_SECRET), sig);
}

export async function createQrCode(
  tenantId: string,
  dto: CreateQrCodeDto,
  actorId: string,
): Promise<{ qr_code_id: string; signed_payload: string; code_slug: string }> {
  const table = await tableRepo.findTableById(tenantId, dto.table_id);
  if (!table) throw new AppError('Table not found', 404, ErrorCode.NOT_FOUND);
  if (table.branch_id !== dto.branch_id) {
    throw new AppError('Table does not belong to the specified branch', 403, ErrorCode.FORBIDDEN);
  }

  const existing = await qrRepo.findActiveQrCodeByTable(tenantId, dto.table_id);
  if (existing) {
    await qrRepo.invalidateQrCode(tenantId, existing.id, actorId);
  }

  const codeSlug = dto.code_slug ?? generateSecureToken(8).slice(0, 12);
  const qrCodeId = randomUUID();
  const payload: Omit<QrSignedPayload, 'signature'> = {
    table_id: dto.table_id,
    branch_id: dto.branch_id,
    tenant_id: tenantId,
    code_slug: codeSlug,
    qr_code_id: qrCodeId,
    issued_at: Math.floor(Date.now() / 1000),
  };
  const signature = buildSignature(payload);
  const signedPayload: QrSignedPayload = { ...payload, signature };
  const signedPayloadText = JSON.stringify(signedPayload);
  const assigned = await qrRepo.createQrCode({
    id: qrCodeId,
    tenant_id: tenantId,
    branch_id: dto.branch_id,
    table_id: dto.table_id,
    code_slug: codeSlug,
    signed_payload: signedPayloadText,
    generated_by: actorId,
  });

  // NOTE: assignQrCodeToTable removed — QR tokens are now managed via table_qr_tokens.

  return {
    qr_code_id: assigned.id,
    signed_payload: signedPayloadText,
    code_slug: codeSlug,
  };
}

function parseSignedPayload(signedPayload: string): QrSignedPayload {
  let parsed: QrSignedPayload;
  try {
    parsed = JSON.parse(signedPayload) as QrSignedPayload;
  } catch {
    throw new AppError('Invalid signed payload', 422, ErrorCode.VALIDATION_ERROR);
  }

  const expected = buildSignature({
    table_id: parsed.table_id,
    branch_id: parsed.branch_id,
    tenant_id: parsed.tenant_id,
    code_slug: parsed.code_slug,
    qr_code_id: parsed.qr_code_id,
    issued_at: parsed.issued_at,
  });

  if (!safeCompare(expected, parsed.signature)) {
    throw new AppError('QR signature invalid', 403, ErrorCode.FORBIDDEN);
  }

  return parsed;
}

export async function resolveQrSession(
  dto: ResolveQrSessionDto,
  clientIp: string | null,
  userAgent: string | null,
): Promise<QrSessionPublicDto> {
  const payload = parseSignedPayload(dto.signed_payload);

  const table = await tableRepo.findTableById(payload.tenant_id, payload.table_id);
  if (!table) throw new AppError('Table not found', 404, ErrorCode.NOT_FOUND);
  if (table.branch_id !== payload.branch_id) {
    throw new AppError('Table does not belong to QR branch', 403, ErrorCode.FORBIDDEN);
  }

  const qrCode = await qrRepo.findQrCodeById(payload.tenant_id, payload.qr_code_id);
  if (!qrCode || !qrCode.is_active) {
    throw new AppError('QR code is inactive or not found', 404, ErrorCode.NOT_FOUND);
  }
  if (qrCode.signed_payload !== dto.signed_payload) {
    throw new AppError('QR payload mismatch', 403, ErrorCode.FORBIDDEN);
  }

  const nonceRow = await qrRepo.insertNonce({
    tenant_id: payload.tenant_id,
    qr_code_id: payload.qr_code_id,
    nonce: dto.nonce,
    client_ip: clientIp,
    user_agent: userAgent,
  });

  const existingSession = await qrRepo.findActiveSessionByTable(payload.tenant_id, payload.table_id);
  if (existingSession) {
    return {
      session_id: existingSession.id,
      session_token: existingSession.session_token,
      branch_id: existingSession.branch_id,
      table_id: existingSession.table_id,
      expires_at: existingSession.expires_at,
    };
  }

  // Table status is no longer mutated directly — runtime state is derived from projections.
  // A TABLE_GUEST_ARRIVED domain event is emitted instead to trigger projection rebuild.
  const { error: eventError } = await (await import('../../../config/supabase')).supabaseAdmin
    .from('domain_events')
    .insert({
      tenant_id:      payload.tenant_id,
      branch_id:      payload.branch_id,
      event_type:     'table.guest_arrived',
      aggregate_id:   payload.table_id,
      aggregate_type: 'Table',
      payload:        { table_id: payload.table_id, source: 'qr_scan' },
    });
  if (eventError) {
    // Non-fatal: projection will self-heal
  }

  const rawToken = generateSecureToken(32);
  const sessionToken = signSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + QR_SESSION_TTL_SECONDS * 1000).toISOString();

  const session = await qrRepo.createSession({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    table_id: payload.table_id,
    qr_code_id: payload.qr_code_id,
    nonce_id: nonceRow.id,
    session_token: sessionToken,
    device_fingerprint: dto.device_fingerprint ?? null,
    client_ip: clientIp,
    user_agent: userAgent,
    expires_at: expiresAt,
  });

  return {
    session_id: session.id,
    session_token: session.session_token,
    branch_id: session.branch_id,
    table_id: session.table_id,
    expires_at: session.expires_at,
  };
}

export async function validateSessionToken(sessionToken: string): Promise<QrSession> {
  if (!verifySessionToken(sessionToken)) {
    throw new AppError('Invalid session token', 401, ErrorCode.UNAUTHORIZED);
  }

  const session = await qrRepo.findSessionByToken(sessionToken);
  if (!session) throw new AppError('Session not found', 404, ErrorCode.NOT_FOUND);

  if (session.status !== 'active') {
    throw new AppError('Session is not active', 403, ErrorCode.FORBIDDEN);
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await qrRepo.updateSessionStatus(session.tenant_id, session.id, 'expired', { expires_at: session.expires_at });
    throw new AppError('Session expired', 401, ErrorCode.UNAUTHORIZED);
  }

  return session;
}

export async function touchSession(sessionId: string): Promise<void> {
  await qrRepo.touchSession(sessionId);
}
