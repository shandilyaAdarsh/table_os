// ============================================================
// src/modules/idempotency/idempotency.repository.ts
// Production-grade PostgreSQL backing for request deduplication.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

export interface IdempotencyRecord {
  id: string;
  tenant_id: string;
  idempotency_key: string;
  request_path: string;
  response_status: number;
  response_body: any;
  status: 'started' | 'completed';
  expires_at: string;
  created_at: string;
}

/**
 * Attemps to lock/reserve an idempotency key.
 * Returns true if lock acquired successfully ('started' row inserted).
 * Returns the existing IdempotencyRecord if key was already reserved or completed.
 */
export async function acquireLock(
  tenantId: string,
  key: string,
  path: string,
  expiresInSeconds: number = 86400 // default 24h
): Promise<true | IdempotencyRecord> {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  
  const { error } = await supabaseAdmin
    .from('idempotency_keys')
    .insert({
      tenant_id: tenantId,
      idempotency_key: key,
      request_path: path,
      response_status: 0,
      response_body: {},
      status: 'started',
      expires_at: expiresAt,
    });

  if (error) {
    // 23505 = unique constraint violation (key already exists)
    if (error.code === '23505') {
      const existing = await getRecord(tenantId, key);
      if (existing) {
        return existing;
      }
    }
    throw new AppError(`Failed to acquire idempotency lock: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  return true;
}

/**
 * Retrieves an active, unexpired idempotency record.
 */
export async function getRecord(tenantId: string, key: string): Promise<IdempotencyRecord | null> {
  const { data, error } = await supabaseAdmin
    .from('idempotency_keys')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new AppError(`Failed to retrieve idempotency record: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as IdempotencyRecord | null;
}

/**
 * Transitions the idempotency record from 'started' to 'completed', caching the response.
 * Uses a RPC or direct query. Note that our database trigger permits update ONLY when OLD.status = 'started'.
 */
export async function saveResponse(
  tenantId: string,
  key: string,
  responseStatus: number,
  responseBody: any
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('idempotency_keys')
    .update({
      status: 'completed',
      response_status: responseStatus,
      response_body: responseBody,
    })
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .eq('status', 'started');

  if (error) {
    throw new AppError(`Failed to save idempotency response: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
}
