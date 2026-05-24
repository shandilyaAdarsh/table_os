// ============================================================
// src/modules/kitchen/kitchen.repository.ts
// Repository handling Kitchen KDS queues, stations, and items.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

export type KitchenOrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivered';

export interface KitchenStation {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  display_order: number;
  version_num: number;
  created_at: string;
  updated_at: string;
}

export interface KitchenOrder {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_id: string;
  station_id: string | null;
  status: KitchenOrderStatus;
  priority: number;
  estimated_prep_seconds: number | null;
  kitchen_notes: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  version_num: number;
  created_at: string;
  updated_at: string;
}

export interface KitchenOrderItem {
  id: string;
  tenant_id: string;
  kitchen_order_id: string;
  order_item_snapshot_id: string;
  item_name: string;
  quantity: number;
  item_notes: string | null;
  modifier_summary: string | null;
  display_order: number;
  created_at: string;
}

export async function getDefaultStation(tenantId: string, branchId: string): Promise<KitchenStation | null> {
  const { data, error } = await supabaseAdmin
    .from('kitchen_stations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('is_default', true)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new AppError(`Failed to fetch default kitchen station: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenStation | null;
}

export async function getFirstActiveStation(tenantId: string, branchId: string): Promise<KitchenStation | null> {
  const { data, error } = await supabaseAdmin
    .from('kitchen_stations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(`Failed to fetch active kitchen station: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenStation | null;
}

export async function createKitchenOrder(payload: {
  tenant_id: string;
  branch_id: string;
  order_id: string;
  station_id: string | null;
  status: KitchenOrderStatus;
  priority?: number;
  estimated_prep_seconds?: number;
  kitchen_notes?: string;
}): Promise<KitchenOrder> {
  const { data, error } = await supabaseAdmin
    .from('kitchen_orders')
    .insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      order_id: payload.order_id,
      station_id: payload.station_id,
      status: payload.status,
      priority: payload.priority ?? 10,
      estimated_prep_seconds: payload.estimated_prep_seconds || null,
      kitchen_notes: payload.kitchen_notes || null,
    })
    .select()
    .single();

  if (error) {
    throw new AppError(`Failed to create kitchen order ticket: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenOrder;
}

export async function createKitchenOrderItems(items: Array<{
  tenant_id: string;
  kitchen_order_id: string;
  order_item_snapshot_id: string;
  item_name: string;
  quantity: number;
  item_notes?: string | null;
  modifier_summary?: string | null;
  display_order?: number;
}>): Promise<KitchenOrderItem[]> {
  const { data, error } = await supabaseAdmin
    .from('kitchen_order_items')
    .insert(items)
    .select();

  if (error) {
    throw new AppError(`Failed to create kitchen order items: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenOrderItem[];
}

export async function getKitchenOrderById(tenantId: string, id: string): Promise<KitchenOrder | null> {
  const { data, error } = await supabaseAdmin
    .from('kitchen_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AppError(`Failed to fetch kitchen order: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenOrder | null;
}

export async function getKitchenOrderItems(tenantId: string, kitchenOrderId: string): Promise<KitchenOrderItem[]> {
  const { data, error } = await supabaseAdmin
    .from('kitchen_order_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('kitchen_order_id', kitchenOrderId)
    .order('display_order', { ascending: true });

  if (error) {
    throw new AppError(`Failed to fetch kitchen order items: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenOrderItem[];
}

export async function listKitchenOrdersByQueue(
  tenantId: string,
  branchId: string,
  filters?: { status?: KitchenOrderStatus; stationId?: string }
): Promise<KitchenOrder[]> {
  let query = supabaseAdmin
    .from('kitchen_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  } else {
    // Default queue excludes delivered items
    query = query.neq('status', 'delivered');
  }

  if (filters?.stationId) {
    query = query.eq('station_id', filters.stationId);
  }

  const { data, error } = await query.order('priority', { ascending: true }).order('created_at', { ascending: true });

  if (error) {
    throw new AppError(`Failed to query kitchen order queue: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenOrder[];
}

export async function updateKitchenOrderStatus(
  tenantId: string,
  id: string,
  status: KitchenOrderStatus,
  versionNum: number,
  userId?: string
): Promise<KitchenOrder | null> {
  const updates: any = {
    status,
    updated_by: userId,
  };

  const now = new Date().toISOString();
  if (status === 'accepted') updates.accepted_at = now;
  else if (status === 'preparing') updates.preparing_at = now;
  else if (status === 'ready') updates.ready_at = now;
  else if (status === 'delivered') updates.delivered_at = now;

  const { data, error } = await supabaseAdmin
    .from('kitchen_orders')
    .update(updates)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('version_num', versionNum)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // OCC failure
    }
    throw new AppError(`Failed to update kitchen order status: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }
  return data as KitchenOrder;
}
