// ============================================================
// src/modules/observability/telemetry-retention.policy.ts
// Runtime Telemetry Retention & Sampling Policy
// ============================================================

import { RuntimeEventTelemetry } from './telemetry.types';

interface RetentionConfig {
  maxEventsPerTenant: number;
  burstThreshold: number; // Max events per second before sampling kicks in
  burstWindowMs: number;
}

export class TelemetryRetentionPolicy {
  private static readonly CONFIG: RetentionConfig = {
    maxEventsPerTenant: 5000,
    burstThreshold: 100,
    burstWindowMs: 1000,
  };

  // Tracks recent events for burst suppression (per tenant, per event_type)
  private static recentEventCounts: Map<string, { count: number; windowStart: number }> = new Map();

  /**
   * Applies the retention and sampling policy to an incoming event.
   * Modifies the event in place if it escalates severity or sanitizes payload.
   * Returns false if the event should be dropped (sampled out or throttled).
   */
  public static evaluate(event: RuntimeEventTelemetry): boolean {
    this.sanitizePayload(event);
    
    // Critical events bypass all sampling/throttling
    if (event.severity === 'CRITICAL') {
      return true;
    }

    const key = `${event.tenant_id}:${event.event_type}`;
    const now = Date.now();
    let stats = this.recentEventCounts.get(key);

    if (!stats || now - stats.windowStart > this.CONFIG.burstWindowMs) {
      stats = { count: 1, windowStart: now };
    } else {
      stats.count++;
    }
    
    this.recentEventCounts.set(key, stats);

    // Severity Escalation Policy
    if (event.severity === 'INFO' && stats.count > 50) {
      event.severity = 'WARNING';
      event.metadata._escalated = true;
    } else if (event.severity === 'WARNING' && stats.count > 20) {
      event.severity = 'ERROR';
      event.metadata._escalated = true;
    }

    // Burst Suppression / Throttling Policy
    if (stats.count > this.CONFIG.burstThreshold) {
      // Throttle: only allow 1 in 10 events after threshold is crossed (Sampling)
      if (stats.count % 10 !== 0) {
        return false; // Drop event
      }
      event.metadata._sampled = true;
    }

    return true; // Keep event
  }

  /**
   * Cleans up tenant states from the burst suppression map
   */
  public static clearTenant(tenantId: string): void {
    for (const key of this.recentEventCounts.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.recentEventCounts.delete(key);
      }
    }
  }

  /**
   * Deep cleanses telemetry payloads to remove sensitive information.
   * - Strips PII, payment info, auth tokens.
   */
  private static sanitizePayload(event: RuntimeEventTelemetry): void {
    if (!event.metadata) return;

    const SENSITIVE_KEYS = ['password', 'token', 'secret', 'credit_card', 'cvv', 'ssn', 'auth'];
    
    const sanitize = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key in obj) {
        if (SENSITIVE_KEYS.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      }
    };

    sanitize(event.metadata);
  }
}
