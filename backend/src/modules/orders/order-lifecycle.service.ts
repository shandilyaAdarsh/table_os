// ============================================================
// src/modules/orders/order-lifecycle.service.ts
// OrderLifecycleService handling state machine transition rules,
// actor validation, transaction orchestration, outbox emission,
// and audit history logging.
// ============================================================

import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as ordersRepo from './orders.repository';
import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export const VALID_ORDER_TRANSITIONS: Record<ordersRepo.OrderStatus, ordersRepo.OrderStatus[]> = {
  pending: ['accepted', 'cancelled', 'sync_conflict'],
  accepted: ['preparing', 'cancelled', 'sync_conflict'],
  preparing: ['ready', 'cancelled', 'sync_conflict'],
  ready: ['delivered', 'cancelled', 'sync_conflict'],
  delivered: ['completed', 'cancelled', 'sync_conflict'],
  completed: [],
  cancelled: [],
  sync_conflict: ['pending', 'accepted', 'cancelled'],
};

export interface OrderTransitionParams {
  tenantId: string;
  orderId: string;
  toStatus: ordersRepo.OrderStatus;
  versionNum: number;
  actorId: string;
  actorType: 'staff' | 'customer' | 'system';
  reason?: string;
  cancellationReason?: string;
}

export class OrderLifecycleService {
  /**
   * Validates if a transition from `from` to `to` is permitted.
   */
  public static isValidTransition(from: ordersRepo.OrderStatus, to: ordersRepo.OrderStatus): boolean {
    const allowed = VALID_ORDER_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Orchestrates the transition of an order status under strict FSM and OCC rules.
   */
  public static async transitionOrder(params: OrderTransitionParams): Promise<ordersRepo.Order> {
    const { tenantId, orderId, toStatus, versionNum, actorId, actorType, reason, cancellationReason } = params;

    // 1. Fetch current order
    const order = await ordersRepo.getOrderById(tenantId, orderId);
    if (!order) {
      throw new NotFoundError('Order');
    }

    // 2. Validate FSM transition rules
    const fromStatus = order.status;
    if (fromStatus === toStatus) {
      return order; // Idempotent transition
    }

    if (!this.isValidTransition(fromStatus, toStatus)) {
      throw new AppError(
        `Invalid status transition from '${fromStatus}' to '${toStatus}'.`,
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    // 3. Actor authorization checks
    if (actorType === 'customer') {
      // Customers can only transition to 'cancelled' if it's currently 'pending'
      if (toStatus !== 'cancelled') {
        throw new AppError(
          'Customers are only authorized to cancel their own pending orders.',
          403,
          ErrorCode.FORBIDDEN
        );
      }
      if (fromStatus !== 'pending') {
        throw new AppError(
          'Orders can only be cancelled by customers while they are still pending.',
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }
    }

    // 4. Handle additional fields (e.g. cancellation reasons)
    const additionalFields: Partial<ordersRepo.Order> = {};
    if (toStatus === 'cancelled') {
      additionalFields.cancellation_reason = cancellationReason || 'Cancelled by actor';
      additionalFields.cancelled_by = actorId;
      additionalFields.cancelled_at = new Date().toISOString();
    }

    // 5. Atomic state update with OCC protection
    const updatedOrder = await ordersRepo.updateOrderStatus(
      tenantId,
      orderId,
      toStatus,
      versionNum,
      actorId,
      additionalFields
    );

    if (!updatedOrder) {
      throw new AppError(
        'Order status update failed. Version mismatch or concurrent edit.',
        409,
        ErrorCode.CONFLICT
      );
    }

    // 6. Log transition audit history
    await ordersRepo.createStateHistory({
      tenant_id: tenantId,
      branch_id: order.branch_id,
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: actorId,
      reason: reason || `Order transitioned to ${toStatus} via ${actorType}`,
    });

    // 7. Emit Domain Outbox Event for async worker claiming & realtime fanout
    const { error: outboxError } = await supabaseAdmin
      .from('domain_events')
      .insert({
        tenant_id: tenantId,
        branch_id: order.branch_id,
        event_type: `order.${toStatus}`,
        aggregate_id: orderId,
        aggregate_type: 'Order',
        payload: {
          id: orderId,
          order_number: order.order_number,
          from_status: fromStatus,
          to_status: toStatus,
          reason: reason || null,
          cancellation_reason: cancellationReason || null,
          version_num: updatedOrder.version_num,
          actor_id: actorId,
          actor_type: actorType,
        },
      });

    if (outboxError) {
      logger.error(
        { err: outboxError.message, orderId },
        '[OrderLifecycleService] Failed to queue domain outbox event.'
      );
    }

    return updatedOrder;
  }
}
