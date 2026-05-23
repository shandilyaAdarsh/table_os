// ============================================================
// src/modules/kitchen/kds-event-orchestrator.ts
// KDSEventOrchestrator managing KDS timers, prep limits,
// dynamic prep duration estimation, and KDS-to-Order sync.
// ============================================================

import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as kitchenRepo from './kitchen.repository';
import * as ordersRepo from '../orders/orders.repository';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { logger } from '../../shared/utils/logger';

export interface KDSTimerAlert {
  ticketId: string;
  orderNumber: string;
  elapsedSeconds: number;
  thresholdSeconds: number;
  isOverdue: boolean;
}

export class KDSEventOrchestrator {
  /**
   * Estimates the preparation time for a new kitchen order based on the current KDS load.
   */
  public static async estimatePrepTime(tenantId: string, branchId: string, stationId?: string | null): Promise<number> {
    try {
      // 1. Get all pending and preparing orders for this branch/station
      const activeTickets = await kitchenRepo.listKitchenOrdersByQueue(tenantId, branchId, {
        status: undefined, // Lists all non-delivered tickets
        stationId: stationId || undefined,
      });

      const activeCount = activeTickets.filter(
        (t) => t.status === 'pending' || t.status === 'preparing'
      ).length;

      // 2. Base estimation algorithm: 3 minutes (180 seconds) per pending/preparing ticket
      const BASE_PREP_SECONDS = 600; // 10 minutes default
      const SECONDS_PER_TICKET = 180; // 3 minutes load factor per ticket

      return BASE_PREP_SECONDS + activeCount * SECONDS_PER_TICKET;
    } catch (err: any) {
      logger.error({ err: err.message, branchId }, '[KDSEventOrchestrator] Error estimating prep time.');
      return 600; // Fallback to 10 minutes
    }
  }

  /**
   * Scans active tickets in the kitchen queue and generates operational threshold alerts.
   */
  public static async checkActiveQueueTimers(tenantId: string, branchId: string): Promise<KDSTimerAlert[]> {
    const alerts: KDSTimerAlert[] = [];
    try {
      // Fetch all active tickets in the queue (excluding delivered/completed status)
      const tickets = await kitchenRepo.listKitchenOrdersByQueue(tenantId, branchId);
      
      const now = new Date().getTime();

      for (const ticket of tickets) {
        // Only track pending or preparing timers
        if (ticket.status !== 'pending' && ticket.status !== 'preparing') {
          continue;
        }

        const createdAt = new Date(ticket.created_at).getTime();
        const elapsedSeconds = Math.floor((now - createdAt) / 1000);

        // Fetch parent order number
        const order = await ordersRepo.getOrderById(tenantId, ticket.order_id);
        const orderNumber = order ? order.order_number : 'UNKNOWN';

        const thresholdSeconds = ticket.estimated_prep_seconds || 900; // 15 minutes default threshold
        const isOverdue = elapsedSeconds > thresholdSeconds;

        if (isOverdue) {
          logger.warn(
            { ticketId: ticket.id, orderNumber, elapsedSeconds, thresholdSeconds },
            `[KDS-TIMER-ALERT] Order #${orderNumber} preparation exceeds the threshold!`
          );
        }

        alerts.push({
          ticketId: ticket.id,
          orderNumber,
          elapsedSeconds,
          thresholdSeconds,
          isOverdue,
        });
      }
    } catch (err: any) {
      logger.error({ err: err.message, branchId }, '[KDSEventOrchestrator] Error checking active queue timers.');
    }

    return alerts;
  }

  /**
   * Advances the kitchen ticket status and performs proper multi-service sync back to OrderLifecycleService.
   */
  public static async transitionKitchenTicket(params: {
    tenantId: string;
    ticketId: string;
    targetStatus: kitchenRepo.KitchenOrderStatus;
    versionNum: number;
    userId: string;
  }): Promise<kitchenRepo.KitchenOrder> {
    const { tenantId, ticketId, targetStatus, versionNum, userId } = params;

    // 1. Transition the KDS Ticket atomically with OCC
    const updatedTicket = await kitchenRepo.updateKitchenOrderStatus(
      tenantId,
      ticketId,
      targetStatus,
      versionNum,
      userId
    );

    if (!updatedTicket) {
      throw new AppError(
        'Kitchen ticket transition failed. Version mismatch or concurrent edit.',
        409,
        ErrorCode.CONFLICT
      );
    }

    // 2. Fetch parent order details to orchestrate transition status coupling
    const order = await ordersRepo.getOrderById(tenantId, updatedTicket.order_id);
    if (!order) {
      logger.error(
        { ticketId, orderId: updatedTicket.order_id },
        '[KDSEventOrchestrator] Parent order missing during KDS transition sync.'
      );
      return updatedTicket;
    }

    // 3. Map kitchen status directly to order status FSM steps
    let orderTargetStatus: ordersRepo.OrderStatus | null = null;
    if (targetStatus === 'accepted') orderTargetStatus = 'accepted';
    else if (targetStatus === 'preparing') orderTargetStatus = 'preparing';
    else if (targetStatus === 'ready') orderTargetStatus = 'ready';
    else if (targetStatus === 'delivered') orderTargetStatus = 'delivered';

    if (orderTargetStatus && order.status !== orderTargetStatus) {
      try {
        await OrderLifecycleService.transitionOrder({
          tenantId,
          orderId: order.id,
          toStatus: orderTargetStatus,
          versionNum: order.version_num,
          actorId: userId,
          actorType: 'system',
          reason: `Synchronized from KDS ticket transition (Ticket status: ${targetStatus}).`,
        });
        logger.info(
          { orderId: order.id, status: orderTargetStatus },
          '[KDSEventOrchestrator] Parent order successfully synchronized with KDS ticket state.'
        );
      } catch (err: any) {
        logger.error(
          { err: err.message, orderId: order.id, status: orderTargetStatus },
          '[KDSEventOrchestrator] Critical: Failed to sync KDS transition to parent order status.'
        );
      }
    }

    return updatedTicket;
  }
}
