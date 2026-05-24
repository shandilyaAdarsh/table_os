// ============================================================
// src/modules/maintenance/outbox-processor.ts
// OutboxProcessor mapping, claiming, and dispatching outbox
// events to RealtimePublisherService.
// ============================================================

import { claimNextEvent, markEventDelivered, markEventFailed, type DispatchEvent } from './worker.service';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { EventPayloadFactory, type RealtimeEventType } from '../realtime/event-payload.factory';
import * as ordersRepo from '../orders/orders.repository';
import * as tableRepo from '../tables/repositories/table.repository';
import * as waiterCallRepo from '../waiter-call/waiter-call.repository';
import { logger } from '../../shared/utils/logger';

export class OutboxProcessor {
  /**
   * Translates internal DB event types to client-facing Canonical Realtime event types.
   */
  private static mapEventType(eventType: string): RealtimeEventType | null {
    switch (eventType) {
      case 'order.pending':       return 'ORDER_CREATED';
      case 'order.accepted':      return 'ORDER_ACCEPTED';
      case 'order.preparing':     return 'ORDER_PREPARING';
      case 'order.ready':         return 'ORDER_READY';
      case 'order.delivered':     return 'ORDER_DELIVERED';
      case 'order.completed':     return 'ORDER_COMPLETED';
      case 'order.cancelled':     return 'ORDER_CANCELLED';
      case 'table.updated':       return 'TABLE_UPDATED';
      case 'waiter_call.created':      return 'WAITER_CALL_CREATED';
      case 'waiter_call.acknowledged': return 'WAITER_CALL_ACKNOWLEDGED';
      case 'waiter_call.resolved':     return 'WAITER_CALL_RESOLVED';
      default:                         return null;
    }
  }

  /**
   * Processes a single claimed outbox event. Resolves aggregates, builds DTOs,
   * publishes via RealtimePublisherService, and marks delivery status.
   */
  public static async processEvent(event: DispatchEvent): Promise<void> {
    const start = Date.now();
    const realtimeType = this.mapEventType(event.event_type);

    if (!realtimeType) {
      // Unmapped event types (e.g. system logs or telemetry) are safely marked delivered immediately.
      logger.info({ eventType: event.event_type }, '[OutboxProcessor] Skipping unmapped/telemetry event.');
      await markEventDelivered(event.id, Date.now() - start);
      return;
    }

    try {
      if (event.aggregate_type === 'Order') {
        const order = await ordersRepo.getOrderById(event.tenant_id, event.aggregate_id);
        if (!order) {
          throw new Error(`Order aggregate '${event.aggregate_id}' not found in DB.`);
        }
        
        const canonicalEvent = EventPayloadFactory.createOrderEvent(realtimeType, order, {
          eventId: event.id,
          reason: event.payload?.reason,
          actorId: event.payload?.actor_id,
        });

        await RealtimePublisherService.publishEvent(canonicalEvent);

      } else if (event.aggregate_type === 'Table') {
        const table = await tableRepo.findTableById(event.tenant_id, event.aggregate_id);
        if (!table) {
          throw new Error(`Table aggregate '${event.aggregate_id}' not found in DB.`);
        }

        const canonicalEvent = EventPayloadFactory.createTableEvent(table, {
          eventId: event.id,
          reason: event.payload?.reason,
          actorId: event.payload?.actor_id,
        });

        await RealtimePublisherService.publishEvent(canonicalEvent);

      } else if (event.aggregate_type === 'WaiterCall') {
        const call = await waiterCallRepo.findWaiterCallById(event.tenant_id, event.aggregate_id);
        if (!call) {
          throw new Error(`WaiterCall aggregate '${event.aggregate_id}' not found in DB.`);
        }

        const canonicalEvent = EventPayloadFactory.createWaiterCallEvent(realtimeType, call, {
          eventId: event.id,
          reason: event.payload?.reason,
          actorId: event.payload?.actor_id,
        });

        await RealtimePublisherService.publishEvent(canonicalEvent);
      } else {
        throw new Error(`Unsupported outbox aggregate type: '${event.aggregate_type}'`);
      }

      // Success -> Mark event as delivered
      await markEventDelivered(event.id, Date.now() - start);
      logger.info({ eventId: event.id, type: event.event_type }, '[OutboxProcessor] Event successfully dispatched & marked delivered.');

    } catch (err: any) {
      const elapsed = Date.now() - start;
      logger.error({ err: err.message, eventId: event.id }, '[OutboxProcessor] Event dispatch failed. Transitioning failure.');
      await markEventFailed(event.id, err.message, elapsed);
      throw err; // Propagate error up to the runner context
    }
  }

  /**
   * Runs a batch outbox processing sweep. Claims and processes up to maxBatchSize events.
   * Returns the total count of successfully processed events.
   */
  public static async processPendingEvents(workerName: string, maxBatchSize = 50): Promise<number> {
    let processedCount = 0;

    for (let i = 0; i < maxBatchSize; i++) {
      try {
        const claimed = await claimNextEvent(workerName);
        if (!claimed) {
          break; // Queue is empty, no more events to claim
        }

        await this.processEvent(claimed);
        processedCount++;
      } catch (err: any) {
        logger.warn({ err: err.message }, '[OutboxProcessor] Encountered failure processing claimed event in loop. Continuing batch.');
      }
    }

    return processedCount;
  }
}
