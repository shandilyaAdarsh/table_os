// ============================================================
// src/modules/waiter-call/waiter-call.service.ts
// Business logic for waiter calls, including OCC protection and outbox events.
// ============================================================

import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { findTableById } from '../tables/repositories/table.repository';
import * as waiterCallRepo from './waiter-call.repository';
import { supabaseAdmin } from '../../config/supabase';
import type { WaiterCall, WaiterCallStatus } from './waiter-call.types';
import type { CreateWaiterCallDto, UpdateWaiterCallStatusDto } from './waiter-call.dtos';

/**
 * Creates a new waiter call and registers a domain outbox event.
 */
export async function createWaiterCall(params: {
  tenantId: string;
  tableId: string;
  sessionId?: string;
  dto: CreateWaiterCallDto;
}): Promise<WaiterCall> {
  const { tenantId, tableId, sessionId, dto } = params;

  // 1. Resolve and validate the table
  const table = await findTableById(tenantId, tableId);
  if (!table) {
    throw new NotFoundError('Table');
  }

  // 2. Insert waiter call record
  const call = await waiterCallRepo.createWaiterCall({
    tenant_id: tenantId,
    branch_id: table.branch_id,
    table_id: tableId,
    session_id: sessionId || null,
    type: dto.type,
    notes: dto.notes || null,
  });

  // 3. Emit Domain Outbox Event
  const { error: eventError } = await supabaseAdmin
    .from('domain_events')
    .insert({
      tenant_id: tenantId,
      branch_id: table.branch_id,
      event_type: 'waiter_call.created',
      aggregate_id: call.id,
      aggregate_type: 'WaiterCall',
      payload: {
        id: call.id,
        table_id: tableId,
        table_number: table.table_number,
        type: call.type,
        notes: call.notes,
        status: call.status,
      },
    });

  if (eventError) {
    // Log error but do not fail the request if it is just a telemetry fail, 
    // although in a strict transaction we would roll back.
    console.error(`[WaiterCall] Failed to insert outbox event: ${eventError.message}`);
  }

  return call;
}

/**
 * Updates a waiter call status with OCC protection.
 */
export async function transitionCallStatus(params: {
  tenantId: string;
  callId: string;
  dto: UpdateWaiterCallStatusDto;
  userId: string;
}): Promise<WaiterCall> {
  const { tenantId, callId, dto, userId } = params;

  // 1. Fetch current record
  const call = await waiterCallRepo.findWaiterCallById(tenantId, callId);
  if (!call) {
    throw new NotFoundError('WaiterCall');
  }

  // 2. Validate state transitions (pending -> acknowledged -> resolved or pending -> resolved)
  if (call.status === 'resolved') {
    throw new AppError('Cannot transition a waiter call that is already resolved.', 400, ErrorCode.VALIDATION_ERROR);
  }
  if (dto.status === 'acknowledged' && call.status !== 'pending') {
    throw new AppError("Can only acknowledge a waiter call that is 'pending'.", 400, ErrorCode.VALIDATION_ERROR);
  }

  // 3. Update status atomically with OCC
  const updatedCall = await waiterCallRepo.updateWaiterCallStatus(
    tenantId,
    callId,
    dto.status as WaiterCallStatus,
    dto.version_num,
    userId
  );

  if (!updatedCall) {
    throw new AppError('Waiter call was modified by another user. Reload and retry.', 409, ErrorCode.CONFLICT);
  }

  // 4. Emit Domain Outbox Event
  const { error: eventError } = await supabaseAdmin
    .from('domain_events')
    .insert({
      tenant_id: tenantId,
      branch_id: updatedCall.branch_id,
      event_type: `waiter_call.${dto.status}`,
      aggregate_id: callId,
      aggregate_type: 'WaiterCall',
      payload: {
        id: callId,
        status: updatedCall.status,
        changed_by: userId,
        reason: dto.reason || `Call transitioned to ${dto.status}`,
      },
    });

  if (eventError) {
    console.error(`[WaiterCall] Failed to insert transition outbox event: ${eventError.message}`);
  }

  return updatedCall;
}

/**
 * Fetches details for a specific waiter call.
 */
export async function getWaiterCall(tenantId: string, callId: string): Promise<WaiterCall> {
  const call = await waiterCallRepo.findWaiterCallById(tenantId, callId);
  if (!call) {
    throw new NotFoundError('WaiterCall');
  }
  return call;
}

/**
 * Lists waiter calls for a branch.
 */
export async function listBranchWaiterCalls(
  tenantId: string,
  branchId: string,
  filters?: { status?: WaiterCallStatus }
): Promise<WaiterCall[]> {
  return waiterCallRepo.listWaiterCallsByBranch(tenantId, branchId, filters);
}
