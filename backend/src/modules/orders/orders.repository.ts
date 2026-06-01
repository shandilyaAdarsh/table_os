// ============================================================
// src/modules/orders/orders.repository.ts
// Repository layer for Order management and status auditing.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'sync_conflict';

export type OrderSource = 'qr_scan' | 'staff_pos' | 'admin';

export interface Order {
  id: string;
  tenant_id: string;
  branch_id: string;
  table_id: string;
  session_id: string | null;
  cart_id: string | null;
  order_snapshot_id: string;
  order_number: string;
  status: OrderStatus;
  source: OrderSource;
  idempotency_key: string | null;
  order_notes: string | null;
  cancellation_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  version_num: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function createOrder(payload: Omit<Order, 'id' | 'version_num' | 'created_at' | 'updated_at'>): Promise<Order> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      table_id: payload.table_id,
      session_id: payload.session_id,
      cart_id: payload.cart_id,
      order_snapshot_id: payload.order_snapshot_id,
      order_number: payload.order_number,
      status: payload.status,
      source: payload.source,
      idempotency_key: payload.idempotency_key,
      order_notes: payload.order_notes,
      created_by: payload.created_by,
      updated_by: payload.updated_by,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      // Idempotency key collision or order number collision
      throw new AppError('Order already exists.', 409, ErrorCode.CONFLICT, true, { code: error.code });
    }
    throw new AppError(`Failed to create order: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  return data as Order;
}

export async function getOrderById(tenantId: string, id: string): Promise<Order | null> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AppError(`Failed to fetch order: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  return data as Order | null;
}

export async function getOrderByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Order | null> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new AppError(`Failed to fetch order by idempotency key: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  return data as Order | null;
}

export async function listOrdersByBranch(
  tenantId: string,
  branchId: string,
  filters?: { status?: OrderStatus }
): Promise<Order[]> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  let query = supabaseAdmin
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .gte('created_at', sevenDaysAgo.toISOString());

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);

  if (error) {
    throw new AppError(`Failed to list branch orders: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  return data as Order[];
}

export async function updateOrderStatus(
  tenantId: string,
  id: string,
  status: OrderStatus,
  versionNum: number,
  userId?: string,
  additionalFields?: Partial<Order>
): Promise<Order | null> {
  const updates: any = {
    status,
    updated_by: userId,
    ...additionalFields,
  };

  // Map state timestamps
  const now = new Date().toISOString();
  if (status === 'accepted') updates.accepted_at = now;
  else if (status === 'preparing') updates.preparing_at = now;
  else if (status === 'ready') updates.ready_at = now;
  else if (status === 'delivered') updates.delivered_at = now;
  else if (status === 'completed') updates.completed_at = now;
  else if (status === 'cancelled') {
    updates.cancelled_at = now;
    updates.cancelled_by = userId;
  }

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('version_num', versionNum)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // OCC mismatch
    }
    throw new AppError(`Failed to update order status: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  return data as Order;
}

export async function createStateHistory(payload: {
  tenant_id: string;
  branch_id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by?: string;
  reason?: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('order_state_history')
    .insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      order_id: payload.order_id,
      from_status: payload.from_status,
      to_status: payload.to_status,
      changed_by: payload.changed_by,
      reason: payload.reason,
    });

  if (error) {
    throw new AppError(`Failed to log order state audit history: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
}
