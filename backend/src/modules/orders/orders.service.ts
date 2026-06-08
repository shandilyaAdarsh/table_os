// ============================================================
// src/modules/orders/orders.service.ts
// Service layer orchestrating the order checkout flow, FSM
// state transitions, idempotency checks, and audit trailing.
// ============================================================

import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as cartRepo from '../cart/cart.repository';
import * as ordersRepo from './orders.repository';
import { createOrderSnapshot } from '../snapshot/order-snapshot.service';
import { supabaseAdmin } from '../../config/supabase';
import { allocateSequenceNumber } from './sequence-allocator.service';
import { BranchMenuResolutionService } from '../overrides/services/branch-menu-resolution.service';
import { ProjectionService } from '../projection/projection.service';
import { WebSocketManager } from '../transport/websocket.manager';
import * as cartService from '../cart/cart.service';
import { logger } from '../../shared/utils/logger';
import { WebSocketManager } from '../transport/websocket.manager';

export async function createDirectOrder(params: {
  tenantId: string;
  branchId: string;
  tableId: string;
  sessionId: string;
  items: Array<{ menu_item_id: string; quantity: number; modifiers?: any[]; item_notes?: string }>;
  idempotencyKey?: string;
  orderNotes?: string;
  source: ordersRepo.OrderSource;
  userId?: string;
}): Promise<ordersRepo.Order> {
  logger.info({
    stage: 'service_entry_createDirectOrder',
    tenantId: params.tenantId,
    branchId: params.branchId,
    tableId: params.tableId,
    sessionId: params.sessionId,
  });

  // 1. Get or create ephemeral cart
  logger.info({ stage: 'before_cart_creation', tenantId: params.tenantId });
  const cartDetail = await cartService.getOrCreateCart(
    params.tenantId,
    params.branchId,
    params.tableId,
    params.sessionId
  );

  const cartId = cartDetail.cart.id;
  logger.info({ stage: 'after_cart_creation', cartId });

  // 2. Add all items to the cart
  logger.info({ stage: 'before_item_insertion', cartId, itemCount: params.items.length });
  for (const item of params.items) {
    await cartService.addCartItem(
      params.tenantId,
      params.sessionId,
      {
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        modifiers: item.modifiers,
        item_notes: item.item_notes,
      }
    );
  }
  logger.info({ stage: 'after_item_insertion', cartId });

  // 3. Checkout the cart
  return createOrderFromCart({
    tenantId: params.tenantId,
    cartId: cartId,
    tableId: params.tableId,
    sessionId: params.sessionId,
    idempotencyKey: params.idempotencyKey,
    orderNotes: params.orderNotes,
    source: params.source,
    userId: params.userId,
  });
}

const VALID_TRANSITIONS: Record<ordersRepo.OrderStatus, ordersRepo.OrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  sync_conflict: [],
};

export async function createOrderFromCart(params: {
  tenantId: string;
  cartId: string;
  tableId: string;
  sessionId?: string;
  idempotencyKey?: string;
  expectedCartRevision?: number;
  orderNotes?: string;
  source: ordersRepo.OrderSource;
  userId?: string;
}): Promise<ordersRepo.Order> {
  const { tenantId, cartId, idempotencyKey, expectedCartRevision } = params;

  // 1. Idempotency Check
  if (idempotencyKey) {
    const existing = await ordersRepo.getOrderByIdempotencyKey(tenantId, idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  // 2. Retrieve & validate the cart
  const cart = await cartRepo.findCartById(tenantId, cartId);
  if (!cart) {
    throw new NotFoundError('Cart');
  }

  if (cart.status !== 'open') {
    throw new AppError(`Cannot checkout a cart in '${cart.status}' status.`, 400, ErrorCode.VALIDATION_ERROR);
  }

  if (expectedCartRevision !== undefined && cart.version_num !== expectedCartRevision) {
    throw new AppError('STALE_RUNTIME_STATE: Cart was modified since your last known revision', 409, ErrorCode.CONFLICT);
  }

  // 3. Strict Runtime Pre-Checkout Revalidation
  const cartItems = await cartRepo.listCartItems(cart.id);
  const cartItemIds = cartItems.map(i => i.id);
  const modifiers = cartItemIds.length > 0 ? await cartRepo.listCartItemModifiers(cartItemIds) : [];
  
  const resolutionService = new BranchMenuResolutionService(supabaseAdmin);
  const effectiveMenu = await resolutionService.resolveEffectiveMenu({
    tenantId,
    branchId: cart.branch_id,
    timestamp: new Date().toISOString(),
  });

  for (const item of cartItems) {
    let activeItem: any = null;
    for (const cat of effectiveMenu.categories) {
      const found = cat.items.find((it) => it.id === item.menu_item_id);
      if (found) {
        activeItem = found;
        break;
      }
    }

    if (!activeItem || !activeItem.is_visible) {
      throw new AppError(`STALE_RUNTIME_STATE: Item ${item.item_name_snapshot} is no longer available.`, 409, ErrorCode.CONFLICT);
    }
    
    if (activeItem.price.price_minor !== item.unit_price_minor_snapshot) {
      throw new AppError(`STALE_RUNTIME_STATE: Price changed for ${item.item_name_snapshot}.`, 409, ErrorCode.CONFLICT);
    }

    const itemMods = modifiers.filter(m => m.cart_item_id === item.id);
    for (const mod of itemMods) {
      const group = activeItem.modifier_groups.find((g: any) => g.id === mod.modifier_group_id);
      if (!group || !group.is_available) {
        throw new AppError(`STALE_RUNTIME_STATE: Modifier group unavailable for ${item.item_name_snapshot}.`, 409, ErrorCode.CONFLICT);
      }
      const option = group.options.find((o: any) => o.id === mod.modifier_option_id);
      if (!option || !option.is_available) {
        throw new AppError(`STALE_RUNTIME_STATE: Modifier option ${mod.modifier_option_name_snapshot} is no longer available.`, 409, ErrorCode.CONFLICT);
      }
      if (option.price_delta_minor !== mod.price_delta_minor_snapshot) {
        throw new AppError(`STALE_RUNTIME_STATE: Modifier price changed for ${mod.modifier_option_name_snapshot}.`, 409, ErrorCode.CONFLICT);
      }
    }
  }

  // 4. Create immutable order snapshots (locks cart, runs database-level snapshot inserts)
  const snapshotId = await createOrderSnapshot(tenantId, cartId, cart.version_num);

  try {
    // 4. Generate client side UUIDs for the transaction
    const orderId = crypto.randomUUID();
    const invoiceId = crypto.randomUUID();

    // 5. Generate daily sequential order and invoice numbers atomically via branch sequence allocation
    const orderNumber = await allocateSequenceNumber({
      tenantId,
      branchId: cart.branch_id,
      sequenceType: 'orders',
      prefix: 'ORD',
      dailyReset: true
    });
    const invoiceNumber = await allocateSequenceNumber({
      tenantId,
      branchId: cart.branch_id,
      sequenceType: 'invoices',
      prefix: 'INV',
      dailyReset: true
    });

    // 6. Invoke the database-side atomic checkout transaction orchestrator
    logger.info({
      stage: 'before_checkout_rpc',
      tenantId,
      branchId: cart.branch_id,
      cartId,
      snapshotId,
      orderId,
      orderNumber,
      invoiceId,
      invoiceNumber,
      tableId: params.tableId,
      sessionId: params.sessionId || cart.session_id || null,
      source: params.source,
      idempotencyKey: idempotencyKey || null,
    });

    const latestCart = await cartRepo.findCartById(tenantId, cartId);

    logger.info({
      stage: 'DEBUG_CHECKOUT',
      cartId,
      cartStatus: latestCart?.status,
      sessionId: params.sessionId,
      tenantId,
    });

    const { data, error } = await supabaseAdmin.rpc('orchestrate_checkout_v1', {
      p_tenant_id: tenantId,
      p_cart_id: cartId,
      p_snapshot_id: snapshotId,
      p_order_id: orderId,
      p_order_number: orderNumber,
      p_invoice_id: invoiceId,
      p_invoice_number: invoiceNumber,
      p_table_id: params.tableId,
      p_session_id: params.sessionId || cart.session_id || null,
      p_source: params.source,
      p_order_notes: params.orderNotes || null,
      p_user_id: params.userId || null,
      p_idempotency_key: idempotencyKey || null,
    });

    logger.info({
      stage: 'after_checkout_rpc',
      tenantId,
      cartId,
      error: error ? error.message : null,
      dataAvailable: !!data,
    });

    if (error) {
      if (error.message.includes('Cart is already checked out or locked')) {
        throw new AppError(
          'Cart is already checked out or locked',
          409,
          ErrorCode.CART_ALREADY_CHECKED_OUT
        );
      }
      throw new AppError(`Atomic transaction failed: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
    }

    const response = data as { order: ordersRepo.Order; invoice: any; kitchen_order_id: string };
    const createdOrder = response.order;

    // ── Dispatch ORDER_ASSIGNED realtime event ────────────────────────────
    void _dispatchOrderAssignedEvent(createdOrder, cart.branch_id, tenantId, cartItems);

    return createdOrder;
  } catch (err) {
    // Graceful rollback protection: Unlock the cart on failure
    const currentCart = await cartRepo.findCartById(tenantId, cartId);
    if (currentCart && (currentCart.status === 'locked' || currentCart.status === 'submitted')) {
      await cartRepo.updateCartStatus(tenantId, cartId, 'open', currentCart.version_num);
    }
    throw err;
  }
}

// ── Internal: Dispatch ORDER_ASSIGNED after successful checkout ─────────────
async function _dispatchOrderAssignedEvent(
  order: ordersRepo.Order,
  branchId: string,
  tenantId: string,
  cartItems: any[]
): Promise<void> {
  try {
    // Fetch table to get assigned_waiter_id and table_number
    const { data: tableData } = await supabaseAdmin
      .from('tables')
      .select('table_number, assigned_waiter_id')
      .eq('id', order.table_id)
      .maybeSingle();

    const assignedStaffId = tableData?.assigned_waiter_id ?? null;
    const tableNumber = tableData?.table_number ?? 'N/A';

    // Calculate total from cart items
    const totalAmountMinor = cartItems.reduce(
      (sum, item) => sum + (item.unit_price_minor_snapshot ?? 0) * (item.quantity ?? 1),
      0
    );

    const alertPayload = {
      orderId: order.id,
      orderNumber: order.order_number,
      tableId: order.table_id,
      tableNumber,
      tenantId,
      assignedStaffId,       // null = broadcast to all (manager fallback)
      itemCount: cartItems.length,
      totalAmountMinor,
      orderTime: order.created_at,
      versionNum: order.version_num,   // ← OCC version for accept action
      items: cartItems.map(i => ({
        name: i.item_name_snapshot,
        quantity: i.quantity,
      })),
    };

    WebSocketManager.getInstance().broadcastToBranch(
      branchId,
      'ORDERING',
      'ALERT_STREAM',
      'order_assigned',
      alertPayload
    );
  } catch (err) {
    // Non-fatal: order was created successfully, alert dispatch is best-effort
    console.error('[OrderAlert] Failed to dispatch ORDER_ASSIGNED event:', err);
  }
}



export async function transitionOrderStatus(params: {
  tenantId: string;
  orderId: string;
  targetStatus: ordersRepo.OrderStatus;
  versionNum: number;
  userId?: string;
  reason?: string;
  additionalFields?: Partial<ordersRepo.Order>;
}): Promise<ordersRepo.Order> {
  const { tenantId, orderId, targetStatus, versionNum, userId, reason, additionalFields } = params;

  // 1. Fetch current order state
  const order = await ordersRepo.getOrderById(tenantId, orderId);
  if (!order) {
    throw new NotFoundError('Order');
  }

  // 2. Validate state machine transition
  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(targetStatus)) {
    throw new AppError(
      `Invalid order status transition from '${order.status}' to '${targetStatus}'.`,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  // 3. Atomically transition state with OCC
  const updatedOrder = await ordersRepo.updateOrderStatus(
    tenantId,
    orderId,
    targetStatus,
    versionNum,
    userId,
    additionalFields
  );

  if (!updatedOrder) {
    throw new AppError('Order was modified by another request. Reload and retry.', 409, ErrorCode.CONFLICT);
  }

  // 4. Log audit log row
  await ordersRepo.createStateHistory({
    tenant_id: tenantId,
    branch_id: order.branch_id,
    order_id: orderId,
    from_status: order.status,
    to_status: targetStatus,
    changed_by: userId,
    reason: reason || `State transitioned from ${order.status} to ${targetStatus}.`,
  });

  // 5. Dispatch Realtime Projection Update
  await ProjectionService.dispatchProjectionUpdate({
    projection_id: order.branch_id, // For KDS/Dashboard branch-level order stream
    projection_type: 'BRANCH_ORDERS',
    branch_id: order.branch_id,
    tenant_id: tenantId,
    projection_revision: updatedOrder.version_num, // Map OCC version to projection revision safely
    source_revision: order.version_num,
    source_mutation_id: undefined, // Add trace ID if available in context
    payload: {
      action: 'ORDER_TRANSITIONED',
      order: updatedOrder
    },
    eventSource: 'ORDERING',
  });

  // 6. Dispatch specific Realtime Events for Staff App
  if (targetStatus === 'ready') {
    let staffName = 'Unknown Staff';
    if ((order as any).assigned_waiter_id) {
      try {
        const { data } = await supabaseAdmin
          .from('staff')
          .select('name')
          .eq('id', (order as any).assigned_waiter_id)
          .single();
        if (data && data.name) staffName = data.name;
      } catch (err) {
        console.error('[OrderAlert] Failed to fetch staff name:', err);
      }
    }

    WebSocketManager.getInstance().broadcastToBranch(
      order.branch_id,
      'SYSTEM',
      'ORDER_ALERTS',
      'ORDER_READY_FOR_PICKUP',
      {
        orderId: order.id,
        orderNumber: (order as any).table_num || order.id,
        tableNumber: (order as any).table_num,
        assignedStaffId: (order as any).assigned_waiter_id,
        assignedStaffName: staffName,
        readyAt: new Date().toISOString(),
        tenantId,
        branchId: order.branch_id,
      }
    );
  }

  return updatedOrder;
}

export async function getOrder(tenantId: string, id: string): Promise<ordersRepo.Order> {
  const order = await ordersRepo.getOrderById(tenantId, id);
  if (!order) {
    throw new NotFoundError('Order');
  }
  return order;
}

export async function listBranchOrders(
  tenantId: string,
  branchId: string,
  filters?: { status?: ordersRepo.OrderStatus }
): Promise<ordersRepo.Order[]> {
  return ordersRepo.listOrdersByBranch(tenantId, branchId, filters);
}

// ── Accept Order (staff self-accept alert) ────────────────────────────────
export async function acceptOrder(params: {
  tenantId: string;
  orderId: string;
  staffId: string;
  versionNum: number;
}): Promise<ordersRepo.Order> {
  const { tenantId, orderId, staffId, versionNum } = params;
  
  const updatedOrder = await transitionOrderStatus({
    tenantId,
    orderId,
    targetStatus: 'accepted',
    versionNum,
    userId: staffId,
    reason: 'Order accepted by assigned staff.',
  });

  let staffName = 'Unknown Staff';
  try {
    const { data } = await supabaseAdmin
      .from('staff')
      .select('name')
      .eq('id', staffId)
      .single();
    if (data && data.name) staffName = data.name;
  } catch (err) {
    console.error('[OrderAlert] Failed to fetch staff name:', err);
  }

  WebSocketManager.getInstance().broadcastToBranch(
    updatedOrder.branch_id,
    'SYSTEM',
    'ORDER_ALERTS',
    'ORDER_ACCEPTED',
    {
      orderId: updatedOrder.id,
      orderNumber: (updatedOrder as any).table_num || updatedOrder.id,
      acceptedByStaffId: staffId,
      acceptedByStaffName: staffName,
      acceptedAt: new Date().toISOString(),
      tenantId: tenantId,
      branchId: updatedOrder.branch_id,
    }
  );

  return updatedOrder;
}

// ── Reassign Order (pass to another staff) ────────────────────────────────
export async function reassignOrder(params: {
  tenantId: string;
  orderId: string;
  fromStaffId: string;
  toStaffId: string;
  branchId: string;
}): Promise<void> {
  const { tenantId, orderId, fromStaffId, toStaffId, branchId } = params;

  // Update the table's assigned_waiter_id to point to new staff if possible
  // First fetch order to get tableId
  const order = await ordersRepo.getOrderById(tenantId, orderId);
  if (!order) throw new NotFoundError('Order');

  // Fetch cart items for the alert payload
  const { data: snapshotItems } = await supabaseAdmin
    .from('order_snapshot_items')
    .select('item_name_snapshot, quantity, unit_price_minor_snapshot')
    .eq('order_snapshot_id', order.order_snapshot_id);

  const cartItems = snapshotItems ?? [];
  const totalAmountMinor = cartItems.reduce(
    (sum: number, item: any) => sum + (item.unit_price_minor_snapshot ?? 0) * (item.quantity ?? 1),
    0
  );

  const { data: tableData } = await supabaseAdmin
    .from('tables')
    .select('table_number')
    .eq('id', order.table_id)
    .maybeSingle();

  // Broadcast ORDER_ASSIGNED to new staff member
  const alertPayload = {
    orderId,
    orderNumber: order.order_number,
    tableId: order.table_id,
    tableNumber: tableData?.table_number ?? 'N/A',
    tenantId,
    assignedStaffId: toStaffId,
    fromStaffId,
    itemCount: cartItems.length,
    totalAmountMinor,
    orderTime: order.created_at,
    items: cartItems.map((i: any) => ({
      name: i.item_name_snapshot,
      quantity: i.quantity,
    })),
    isReassignment: true,
  };

  WebSocketManager.getInstance().broadcastToBranch(
    branchId,
    'ORDERING',
    'ALERT_STREAM',
    'order_assigned',
    alertPayload
  );
}

// ── Get pending (unaccepted) orders for a staff member ────────────────────
export async function getPendingOrdersForStaff(
  tenantId: string,
  branchId: string,
  staffId: string
): Promise<ordersRepo.Order[]> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, tables!inner(assigned_waiter_id)')
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .eq('status', 'pending')
    .eq('tables.assigned_waiter_id', staffId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data ?? []) as ordersRepo.Order[];
}


