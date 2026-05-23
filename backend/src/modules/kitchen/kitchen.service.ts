// ============================================================
// src/modules/kitchen/kitchen.service.ts
// Service layer for KDS orchestration, ticket routing, and sync.
// ============================================================

import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as kitchenRepo from './kitchen.repository';
import * as ordersRepo from '../orders/orders.repository';
import { transitionOrderStatus } from '../orders/orders.service';
import { supabaseAdmin } from '../../config/supabase';
import { KitchenStationRouter } from './kitchen-station-router';
import { KitchenQueueProjectionService } from './kitchen-queue-projection.service';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { logger } from '../../shared/utils/logger';

const VALID_KITCHEN_TRANSITIONS: Record<kitchenRepo.KitchenOrderStatus, kitchenRepo.KitchenOrderStatus[]> = {
  pending: ['accepted', 'preparing', 'ready', 'delivered'],
  accepted: ['preparing', 'ready', 'delivered'],
  preparing: ['ready', 'delivered'],
  ready: ['delivered'],
  delivered: [],
};

export async function routeOrderToKitchen(tenantId: string, orderId: string): Promise<kitchenRepo.KitchenOrder> {
  // 1. Check if a kitchen ticket already exists for this order to guarantee idempotency
  const { data: existingTicket, error: checkError } = await supabaseAdmin
    .from('kitchen_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .maybeSingle();

  if (checkError) {
    throw new AppError(`Failed to verify kitchen ticket existence: ${checkError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (existingTicket) {
    return existingTicket as kitchenRepo.KitchenOrder;
  }

  // 2. Fetch the parent order
  const order = await ordersRepo.getOrderById(tenantId, orderId);
  if (!order) {
    throw new NotFoundError('Order');
  }

  // 3. Fetch the immutable order snapshot details
  const { data: itemSnapshots, error: itemsError } = await supabaseAdmin
    .from('order_item_snapshots')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_snapshot_id', order.order_snapshot_id)
    .order('display_order', { ascending: true });

  if (itemsError || !itemSnapshots || itemSnapshots.length === 0) {
    throw new AppError('Failed to fetch snapshot items for kitchen routing.', 422, ErrorCode.VALIDATION_ERROR);
  }

  // Fetch modifier snapshots
  const itemIds = itemSnapshots.map((item) => item.id);
  const { data: modifierSnapshots, error: modsError } = await supabaseAdmin
    .from('order_modifier_snapshots')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('order_item_snapshot_id', itemIds);

  if (modsError) {
    throw new AppError(`Failed to fetch modifier snapshots for kitchen routing: ${modsError.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  // 4. Create kitchen order ticket header (Default station is null at header level as items are routed individually)
  const kitchenOrder = await kitchenRepo.createKitchenOrder({
    tenant_id: tenantId,
    branch_id: order.branch_id,
    order_id: orderId,
    station_id: null,
    status: 'pending',
    kitchen_notes: order.order_notes || undefined,
  });

  // 5. Build and bulk insert kitchen order item records
  const kitchenItemsToInsert = itemSnapshots.map((item) => {
    // Collate modifier summary list
    const itemMods = (modifierSnapshots ?? []).filter((m) => m.order_item_snapshot_id === item.id);
    const modSummary = itemMods.map((m) => m.modifier_option_name_snapshot).join(', ');

    return {
      tenant_id: tenantId,
      kitchen_order_id: kitchenOrder.id,
      order_item_snapshot_id: item.id,
      item_name: item.item_name_snapshot,
      quantity: item.quantity,
      item_notes: item.item_notes,
      modifier_summary: modSummary || null,
      display_order: item.display_order,
    };
  });

  const insertedItems = await kitchenRepo.createKitchenOrderItems(kitchenItemsToInsert);

  // 6. Route individual items to their stations and create preparations
  const itemsToRoute = insertedItems.map((ii) => {
    const snap = itemSnapshots.find((s) => s.id === ii.order_item_snapshot_id);
    return {
      id: ii.id,
      orderItemSnapshotId: ii.order_item_snapshot_id,
      menuItemId: snap?.menu_item_id || '',
      quantity: ii.quantity,
    };
  });

  await KitchenStationRouter.routeOrderItems(tenantId, order.branch_id, kitchenOrder.id, itemsToRoute);

  // 7. Log order routed event in monotonic sequence
  const { data: sequenceNum, error: rpcError } = await supabaseAdmin.rpc('log_branch_operational_event', {
    p_tenant_id: tenantId,
    p_branch_id: order.branch_id,
    p_event_type: 'KDS_ORDER_ROUTED',
    p_aggregate_id: kitchenOrder.id,
    p_aggregate_type: 'KitchenOrder',
    p_payload: {
      kitchenOrderId: kitchenOrder.id,
      orderId,
      orderNumber: order.order_number,
      status: 'pending',
    },
  });

  if (rpcError) {
    logger.error({ rpcError }, '[KitchenService] Failed to log branch operational sequence event.');
  }

  // 8. Broadcast real-time routed event
  try {
    const topic = RealtimePublisherService.getBranchTopic(tenantId, order.branch_id);
    const broadcastChannel = supabaseAdmin.channel(topic);
    await broadcastChannel.send({
      type: 'broadcast',
      event: 'KDS_TICKET_ROUTED',
      payload: {
        sequenceNumber: Number(sequenceNum || 0),
        branchId: order.branch_id,
        eventType: 'KDS_TICKET_ROUTED',
        timestamp: new Date().toISOString(),
        payload: {
          kitchenOrderId: kitchenOrder.id,
          orderId,
          orderNumber: order.order_number,
          status: 'pending',
        },
      },
    });
    await supabaseAdmin.removeChannel(broadcastChannel);
  } catch (realtimeErr: any) {
    logger.error({ realtimeErr: realtimeErr.message }, '[KitchenService] Realtime broadcast routing error.');
  }

  return kitchenOrder;
}

export async function transitionKitchenOrderStatus(params: {
  tenantId: string;
  ticketId: string;
  targetStatus: kitchenRepo.KitchenOrderStatus;
  versionNum: number;
  userId?: string;
}): Promise<kitchenRepo.KitchenOrder> {
  const { tenantId, ticketId, targetStatus, versionNum, userId } = params;

  // 1. Fetch current ticket
  const ticket = await kitchenRepo.getKitchenOrderById(tenantId, ticketId);
  if (!ticket) {
    throw new NotFoundError('Kitchen ticket');
  }

  // 2. Validate FSM rules
  const allowed = VALID_KITCHEN_TRANSITIONS[ticket.status];
  if (!allowed.includes(targetStatus)) {
    throw new AppError(
      `Invalid kitchen status transition from '${ticket.status}' to '${targetStatus}'.`,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  // 3. Atomically transition ticket
  const updatedTicket = await kitchenRepo.updateKitchenOrderStatus(
    tenantId,
    ticketId,
    targetStatus,
    versionNum,
    userId
  );

  if (!updatedTicket) {
    throw new AppError('Kitchen ticket was modified by another request. Reload and retry.', 409, ErrorCode.CONFLICT);
  }

  // 4. Synchronize status with parent Order
  const order = await ordersRepo.getOrderById(tenantId, ticket.order_id);
  if (order) {
    // Map kitchen status directly to order status
    let orderTargetStatus: ordersRepo.OrderStatus | null = null;
    if (targetStatus === 'accepted') orderTargetStatus = 'accepted';
    else if (targetStatus === 'preparing') orderTargetStatus = 'preparing';
    else if (targetStatus === 'ready') orderTargetStatus = 'ready';
    else if (targetStatus === 'delivered') orderTargetStatus = 'delivered';

    if (orderTargetStatus && order.status !== orderTargetStatus) {
      await transitionOrderStatus({
        tenantId,
        orderId: ticket.order_id,
        targetStatus: orderTargetStatus,
        versionNum: order.version_num,
        userId,
        reason: `Synchronized with KDS station ticket state transition.`,
      });
    }
  }

  return updatedTicket;
}

export async function getKitchenOrderTicket(tenantId: string, id: string): Promise<any> {
  const ticket = await kitchenRepo.getKitchenOrderById(tenantId, id);
  if (!ticket) {
    throw new NotFoundError('Kitchen ticket');
  }
  const items = await kitchenRepo.getKitchenOrderItems(tenantId, id);
  return { ...ticket, items };
}

export async function getKitchenQueue(
  tenantId: string,
  branchId: string,
  filters?: { status?: kitchenRepo.KitchenOrderStatus; stationId?: string }
): Promise<any[]> {
  // Use our new prioritized queue projection service
  return await KitchenQueueProjectionService.getActiveQueueProjections(
    tenantId,
    branchId,
    filters?.stationId
  );
}
