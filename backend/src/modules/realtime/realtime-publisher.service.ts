// ============================================================
// src/modules/realtime/realtime-publisher.service.ts
// RealtimePublisherService handling deduplicated, reconnect-safe,
// and retried Supabase Realtime broadcast fanouts.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';
import type { CanonicalRealtimeEvent } from './event-payload.factory';

export class RealtimePublisherService {
  private static publishedEventIds = new Set<string>();
  private static MAX_CACHE_SIZE = 10000;

  /**
   * Cleans up the event ID cache to prevent memory leaks.
   */
  private static trackEvent(eventId: string): boolean {
    if (this.publishedEventIds.has(eventId)) {
      return false; // Already published (duplicate)
    }

    if (this.publishedEventIds.size >= this.MAX_CACHE_SIZE) {
      // Evict oldest (simplest way: clear and restart or delete first item)
      const first = this.publishedEventIds.values().next().value;
      if (first !== undefined) {
        this.publishedEventIds.delete(first);
      }
    }

    this.publishedEventIds.add(eventId);
    return true;
  }

  /**
   * Formulate standard branch and order tracking channel topics
   */
  public static getBranchTopic(tenantId: string, branchId: string): string {
    return `tenant:${tenantId}:branch:${branchId}`;
  }

  public static getOrderTopic(tenantId: string, orderId: string): string {
    return `tenant:${tenantId}:order:${orderId}`;
  }

  /**
   * Broadcasts a canonical event to both the branch's channel and the order-specific tracker channel.
   */
  public static async publishEvent(event: CanonicalRealtimeEvent): Promise<void> {
    // 1. Deduplicate check
    if (!this.trackEvent(event.eventId)) {
      logger.warn({ eventId: event.eventId, eventType: event.eventType }, '[RealtimePublisher] Event already published. Deduplicating.');
      return;
    }

    // 2. Resolve target channels
    const branchTopic = this.getBranchTopic(event.tenantId, event.branchId);
    
    // Broadcast to the main branch channel (Staff App, KDS, Admin Floor maps listen here)
    await this.broadcastToTopic(branchTopic, event.eventType, event);

    // If it's an order event, also broadcast to the guest customer tracking channel
    if (event.aggregateType === 'Order') {
      const orderTopic = this.getOrderTopic(event.tenantId, event.aggregateId);
      await this.broadcastToTopic(orderTopic, event.eventType, event);
    }
  }

  /**
   * Performs the raw Supabase Realtime broadcast under exponential retry conditions.
   */
  private static async broadcastToTopic(topic: string, eventName: string, event: CanonicalRealtimeEvent): Promise<void> {
    const { withRetry } = await import('../../shared/utils/retry.utils');

    await withRetry(
      async () => {
        const channel = supabaseAdmin.channel(topic);
        
        const response = await channel.send({
          type: 'broadcast',
          event: eventName,
          payload: event,
        });

        if (response !== 'ok') {
          throw new Error(`Realtime broadcast returned status: ${response}`);
        }

        // Clean up the transient channel reference
        await supabaseAdmin.removeChannel(channel);
      },
      {
        maxRetries: 3,
        initialDelay: 200,
        factor: 2,
      }
    ).catch((err) => {
      logger.error(
        { err: err.message, topic, eventName, eventId: event.eventId },
        '[RealtimePublisher] Critical failure: Realtime broadcast failed after all retries.'
      );
    });
  }
}
