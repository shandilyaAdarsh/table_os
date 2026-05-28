import { ProjectionCoordinator } from '../projection/ProjectionCoordinator';
import { ReplayRecoveryEngine } from '../replay/ReplayRecoveryEngine';
import { RuntimeObservabilityLayer } from '../observability/RuntimeObservabilityLayer';

export type RuntimeDomain = 'orders' | 'tables' | 'kds' | 'analytics' | 'system';

export interface RuntimeEventPayload {
  domain: RuntimeDomain;
  version_num: number;
  type: 'INVALIDATION' | 'RECONCILE';
  target_id?: string; // Specific ID invalidated, e.g., order_id
  metadata?: {
    sequence_number?: number;
    mutation_id?: string;
    [key: string]: any;
  };
}

export class RealtimeEventRouter {
  private watermarks: Record<RuntimeDomain, number> = {
    orders: 0,
    tables: 0,
    kds: 0,
    analytics: 0,
    system: 0
  };

  private collapseTimers: Map<RuntimeDomain, NodeJS.Timeout> = new Map();
  private pendingTargets: Map<RuntimeDomain, Set<string>> = new Map();

  private projectionCoordinator: ProjectionCoordinator;
  private replayEngine: ReplayRecoveryEngine;
  private observability: RuntimeObservabilityLayer;

  constructor(
    projectionCoordinator: ProjectionCoordinator,
    replayEngine: ReplayRecoveryEngine,
    observability: RuntimeObservabilityLayer
  ) {
    this.projectionCoordinator = projectionCoordinator;
    this.replayEngine = replayEngine;
    this.observability = observability;
  }

  /**
   * Main entry point for realtime websocket events
   */
  public handleIncomingEvent(event: RuntimeEventPayload): void {
    if (!event.domain || event.version_num === undefined) {
      this.observability.recordMalformedEvent(event);
      return;
    }

    const domain = event.domain;
    const incomingVersion = event.version_num;
    const currentWatermark = this.watermarks[domain];

    // 1. Stale Event Rejection
    if (incomingVersion <= currentWatermark) {
      this.observability.recordStaleEventRejection(domain, incomingVersion, currentWatermark);
      console.debug(`[RealtimeEventRouter] Rejected stale event for domain ${domain}. Incoming: ${incomingVersion}, Current: ${currentWatermark}`);
      return;
    }

    // 2. Sequence Gap Detection
    // Strict monotonic sequence checking. If the event is > watermark + 1, we have a gap.
    // Note: Backend must guarantee version_num is strictly monotonic per domain, or we use metadata.sequence_number
    // Assuming backend drives domain watermarks sequentially.
    if (incomingVersion > currentWatermark + 1) {
      console.warn(`[RealtimeEventRouter] Sequence gap detected in domain ${domain}. Expected ${currentWatermark + 1}, got ${incomingVersion}. Deferring to ReplayRecoveryEngine.`);
      this.observability.recordSequenceGap(domain, currentWatermark, incomingVersion);
      
      this.replayEngine.handleGapDetected(domain, currentWatermark, incomingVersion);
      
      // Advance watermark so we don't loop on the same gap window
      this.watermarks[domain] = incomingVersion;
      this.observability.recordWatermarkUpdated(domain, incomingVersion);
      return;
    }

    // 3. Normal Execution & Invalidation Routing
    this.watermarks[domain] = incomingVersion;
    this.observability.recordWatermarkUpdated(domain, incomingVersion);
    
    // Track target IDs to potentially optimize targeted rebuilds
    if (event.target_id) {
      if (!this.pendingTargets.has(domain)) {
        this.pendingTargets.set(domain, new Set());
      }
      this.pendingTargets.get(domain)!.add(event.target_id);
    }

    // Event Collapse Debouncer (Network burst protection)
    if (this.collapseTimers.has(domain)) {
      clearTimeout(this.collapseTimers.get(domain));
    }

    const timer = setTimeout(() => {
      this.collapseTimers.delete(domain);
      const targets = this.pendingTargets.get(domain);
      const targetList = targets ? Array.from(targets) : [];
      this.pendingTargets.delete(domain);

      const collapseSize = targetList.length;
      const shouldTarget = collapseSize === 1;
      const finalTarget = shouldTarget ? targetList[0] : undefined;

      if (collapseSize > 1) {
        this.observability.recordDebounceCollapse(domain, collapseSize);
      }

      this.observability.recordInvalidationEmitted(domain, this.watermarks[domain], collapseSize);
      console.debug(`[RealtimeEventRouter] Routing collapsed domain-scoped invalidation for ${domain} version ${this.watermarks[domain]}`);
      this.projectionCoordinator.handleInvalidation(domain, finalTarget);
    }, 50); // 50ms collapse window

    this.collapseTimers.set(domain, timer);
  }

  /**
   * Expose watermark for ReplayRecoveryEngine to sync after reconnects
   */
  public getWatermark(domain: RuntimeDomain): number {
    return this.watermarks[domain];
  }

  /**
   * Reset watermarks during full hard recovery or bootstrapping
   */
  public resetWatermark(domain: RuntimeDomain, newVersion: number): void {
    this.watermarks[domain] = newVersion;
    this.observability.recordWatermarkUpdated(domain, newVersion);
    console.info(`[RealtimeEventRouter] Reset watermark for ${domain} to ${newVersion}`);
  }
}
