// ============================================================
// src/modules/waiter-call/waiter-call.repository.ts
// DB queries and actions for waiter paging. Uses supabaseAdmin (bypasses RLS).
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { WaiterCall, WaiterCallStatus } from './waiter-call.types';

export async function findWaiterCallById(tenantId: string, callId: string): Promise<WaiterCall | null> {
  const { data, error } = await supabaseAdmin
    .from('waiter_calls')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', callId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, tenantId, callId }, 'findWaiterCallById failed');
    throw new AppError(`Failed to fetch waiter call: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data;
}

export async function createWaiterCall(payload: {
  tenant_id: string;
  branch_id: string;
  table_id: string;
  session_id: string | null;
  type: string;
  notes: string | null;
}): Promise<WaiterCall> {
  const { data, error } = await supabaseAdmin
    .from('waiter_calls')
    .insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      table_id: payload.table_id,
      session_id: payload.session_id,
      type: payload.type,
      notes: payload.notes,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    logger.error({ err: error, payload }, 'createWaiterCall failed');
    throw new AppError(`Failed to create waiter call: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data;
}

export async function updateWaiterCallStatus(
  tenantId: string,
  callId: string,
  newStatus: WaiterCallStatus,
  versionNum: number,
  userId: string | null,
): Promise<WaiterCall | null> {
  const updates: Record<string, any> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (newStatus === 'acknowledged') {
    updates.acknowledged_by = userId;
    updates.acknowledged_at = new Date().toISOString();
  } else if (newStatus === 'resolved') {
    updates.resolved_by = userId;
    updates.resolved_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('waiter_calls')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', callId)
    .eq('version_num', versionNum)
    .is('deleted_at', null)
    .select()
    .maybeSingle();

  if (error) {
    logger.error({ err: error, tenantId, callId }, 'updateWaiterCallStatus failed');
    throw new AppError(`Failed to update waiter call status: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data;
}

export async function listWaiterCallsByBranch(
  tenantId: string,
  branchId: string,
  filters?: { status?: WaiterCallStatus }
): Promise<WaiterCall[]> {
  let query = supabaseAdmin
    .from('waiter_calls')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .is('deleted_at', null);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    logger.error({ err: error, tenantId, branchId }, 'listWaiterCallsByBranch failed');
    throw new AppError(`Failed to list waiter calls: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data ?? [];
}
