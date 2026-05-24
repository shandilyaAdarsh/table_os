// ============================================================
// src/modules/qr/qr.repository.ts
// Repository layer for QR code and session persistence.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { QrCode, QrScanNonce, QrSession, QrSessionStatus } from './qr.types';

export async function findQrCodeById(tenantId: string, qrCodeId: string): Promise<QrCode | null> {
  const { data, error } = await supabaseAdmin
    .from('qr_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', qrCodeId)
    .maybeSingle();

  if (error) throw new AppError('Failed to fetch QR code', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrCode | null;
}

export async function findActiveQrCodeByTable(tenantId: string, tableId: string): Promise<QrCode | null> {
  const { data, error } = await supabaseAdmin
    .from('qr_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('table_id', tableId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new AppError('Failed to fetch active QR code', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrCode | null;
}

export async function findActiveQrCodeBySlug(branchId: string, codeSlug: string): Promise<QrCode | null> {
  const { data, error } = await supabaseAdmin
    .from('qr_codes')
    .select('*')
    .eq('branch_id', branchId)
    .eq('code_slug', codeSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new AppError('Failed to fetch QR code by slug', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrCode | null;
}

export async function createQrCode(payload: {
  id?: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  code_slug: string;
  signed_payload: string;
  generated_by?: string | null;
}): Promise<QrCode> {
  const { data, error } = await supabaseAdmin
    .from('qr_codes')
    .insert({
      id: payload.id,
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      table_id: payload.table_id,
      code_slug: payload.code_slug,
      signed_payload: payload.signed_payload,
      generated_by: payload.generated_by ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AppError('QR code slug conflict for branch', 409, ErrorCode.CONFLICT, true, { error });
    }
    throw new AppError('Failed to create QR code', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  }
  return data as QrCode;
}

export async function invalidateQrCode(
  tenantId: string,
  qrCodeId: string,
  invalidatedBy?: string | null,
): Promise<QrCode | null> {
  const { data, error } = await supabaseAdmin
    .from('qr_codes')
    .update({
      is_active: false,
      invalidated_at: new Date().toISOString(),
      invalidated_by: invalidatedBy ?? null,
    })
    .eq('tenant_id', tenantId)
    .eq('id', qrCodeId)
    .select()
    .maybeSingle();

  if (error) throw new AppError('Failed to invalidate QR code', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrCode | null;
}

export async function insertNonce(payload: {
  tenant_id: string;
  qr_code_id: string;
  nonce: string;
  client_ip?: string | null;
  user_agent?: string | null;
}): Promise<QrScanNonce> {
  const { data, error } = await supabaseAdmin
    .from('qr_scan_nonces')
    .insert({
      tenant_id: payload.tenant_id,
      qr_code_id: payload.qr_code_id,
      nonce: payload.nonce,
      client_ip: payload.client_ip ?? null,
      user_agent: payload.user_agent ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AppError('QR nonce already used', 409, ErrorCode.CONFLICT, true, { error });
    }
    throw new AppError('Failed to insert QR nonce', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  }
  return data as QrScanNonce;
}

export async function createSession(payload: {
  tenant_id: string;
  branch_id: string;
  table_id: string;
  qr_code_id: string;
  nonce_id: string;
  session_token: string;
  device_fingerprint?: string | null;
  client_ip?: string | null;
  user_agent?: string | null;
  expires_at: string;
}): Promise<QrSession> {
  const { data, error } = await supabaseAdmin
    .from('qr_sessions')
    .insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      table_id: payload.table_id,
      qr_code_id: payload.qr_code_id,
      nonce_id: payload.nonce_id,
      session_token: payload.session_token,
      device_fingerprint: payload.device_fingerprint ?? null,
      client_ip: payload.client_ip ?? null,
      user_agent: payload.user_agent ?? null,
      expires_at: payload.expires_at,
    })
    .select()
    .single();

  if (error) throw new AppError('Failed to create QR session', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrSession;
}

export async function findSessionByToken(sessionToken: string): Promise<QrSession | null> {
  const { data, error } = await supabaseAdmin
    .from('qr_sessions')
    .select('*')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (error) throw new AppError('Failed to fetch QR session', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrSession | null;
}

export async function findActiveSessionByTable(
  tenantId: string,
  tableId: string,
): Promise<QrSession | null> {
  const { data, error } = await supabaseAdmin
    .from('qr_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('table_id', tableId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new AppError('Failed to fetch active QR session', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrSession | null;
}

export async function updateSessionStatus(
  tenantId: string,
  sessionId: string,
  status: QrSessionStatus,
  updatedFields: Record<string, unknown> = {},
): Promise<QrSession | null> {
  const { data, error } = await supabaseAdmin
    .from('qr_sessions')
    .update({ status, ...updatedFields, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', sessionId)
    .select()
    .maybeSingle();

  if (error) throw new AppError('Failed to update QR session', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
  return data as QrSession | null;
}

export async function touchSession(sessionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('qr_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw new AppError('Failed to touch QR session', 500, ErrorCode.INTERNAL_SERVER_ERROR, true, { error });
}
