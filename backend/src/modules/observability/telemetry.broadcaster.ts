// ============================================================
// src/modules/observability/telemetry.broadcaster.ts
// Async, non-blocking telemetry emitter using Supabase Realtime.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { RuntimeEventTelemetry } from './telemetry.types';
import { RuntimeMetricsAggregator } from './runtime-metrics.aggregator';
import ObservabilityService from '../infrastructure/observability.service';
import { TelemetryRetentionPolicy } from './telemetry-retention.policy';

class TelemetryBroadcasterService {
  private queue: RuntimeEventTelemetry[] = [];
  private isProcessing = false;
  private channel = supabaseAdmin.channel('runtime_telemetry_stream');
  private static readonly MAX_QUEUE_SIZE = 5000;

  constructor() {
    // Optionally subscribe to handle connection lifecycle if needed,
    // but typically we just broadcast to it.
  }

  /**
   * Enqueue a telemetry event synchronously from operational code.
   * NEVER block the caller.
   */
  public enqueue(event: Omit<RuntimeEventTelemetry, 'event_timestamp' | 'correlation_id'>): void {
    const context = ObservabilityService.getContext();
    
    const fullEvent: RuntimeEventTelemetry = {
      ...event,
      event_timestamp: new Date().toISOString(),
      correlation_id: context?.correlationId || crypto.randomUUID(),
    };

    // Evaluate retention, sampling, and sanitization policy
    const shouldKeep = TelemetryRetentionPolicy.evaluate(fullEvent);
    if (!shouldKeep) {
      return;
    }

    // 1. Immediately aggregate in-memory (deterministic, synchronous, fast)
    try {
      RuntimeMetricsAggregator.ingestEvent(fullEvent);
    } catch (err) {
      ObservabilityService.error('Failed to ingest telemetry event into aggregator', err);
    }

    // 2. Queue for async broadcast
    if (this.queue.length >= TelemetryBroadcasterService.MAX_QUEUE_SIZE) {
      // Throttle/Drop events to prevent memory leaks under massive flood
      ObservabilityService.warn('Telemetry queue overflow. Dropping event.', { event_type: event.event_type });
      return;
    }

    this.queue.push(fullEvent);
    this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      // Drain up to 50 events per batch
      const batch = this.queue.splice(0, 50);

      // Fire and forget broadcasts
      const broadcastPromises = batch.map(event => {
        return this.channel.send({
          type: 'broadcast',
          event: 'telemetry_event',
          payload: event
        });
      });

      // Await batch completion internally (does not block original caller)
      await Promise.allSettled(broadcastPromises);
      
    } catch (err) {
      ObservabilityService.error('Telemetry broadcast failed', err);
    } finally {
      this.isProcessing = false;
      // Loop if more items arrived
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }
}

export const TelemetryBroadcaster = new TelemetryBroadcasterService();
