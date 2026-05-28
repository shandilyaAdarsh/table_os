import { ProjectionCoordinator } from '../projection/ProjectionCoordinator';
import { RuntimeDomain } from '../realtime/RealtimeEventRouter';
import { RuntimeObservabilityLayer } from '../observability/RuntimeObservabilityLayer';

export class ReplayRecoveryEngine {
  private projectionCoordinator: ProjectionCoordinator;
  private observability: RuntimeObservabilityLayer;

  // Track domains currently undergoing recovery to prevent storming
  private recoveringDomains: Set<RuntimeDomain> = new Set();

  constructor(
    projectionCoordinator: ProjectionCoordinator,
    observability: RuntimeObservabilityLayer
  ) {
    this.projectionCoordinator = projectionCoordinator;
    this.observability = observability;
  }

  /**
   * Invoked by RealtimeEventRouter when a sequence gap or divergence is detected.
   * 
   * As per architectural mandate: 
   * "ReplayRecoveryEngine → detects divergence → requests authoritative backend projection rebuild"
   * The frontend does NOT replay operational mutations locally.
   */
  public async handleGapDetected(domain: RuntimeDomain, expectedWatermark: number, actualVersion: number): Promise<void> {
    if (this.recoveringDomains.has(domain)) {
      console.debug(`[ReplayRecoveryEngine] Domain ${domain} is already in recovery state. Skipping redundant rebuild request.`);
      return;
    }

    console.warn(`[ReplayRecoveryEngine] Divergence confirmed for domain: ${domain}. Initiating authoritative recovery.`);
    this.observability.recordRecoveryStart(domain, expectedWatermark, actualVersion);
    
    this.recoveringDomains.add(domain);

    try {
      // Defer purely to the ProjectionCoordinator for a normalized atomic state replacement.
      // We do not attempt to fetch a delta ledger or apply patches locally.
      await this.projectionCoordinator.handleInvalidation(domain);
      
      console.info(`[ReplayRecoveryEngine] Successfully recovered domain: ${domain} via authoritative rebuild.`);
      this.observability.recordRecoverySuccess(domain);
    } catch (error) {
      console.error(`[ReplayRecoveryEngine] Failed to recover domain: ${domain}`, error);
      this.observability.recordRecoveryError(domain, error as Error);
      // NOTE: Transport Manager will handle shifting to DEGRADED state if this fails structurally.
    } finally {
      this.recoveringDomains.delete(domain);
    }
  }

  /**
   * Invoked by TransportManager after a reconnection event to ensure we haven't
   * missed payloads while disconnected. Enforces priority domain recovery.
   */
  public async handleReconnectRecovery(domains: RuntimeDomain[]): Promise<void> {
    console.info(`[ReplayRecoveryEngine] Transport reconnected. Initiating stale projection recovery across domains: ${domains.join(', ')}`);
    
    // Priority Matrix: Orders and Payments must recover before downstream UI/Auxiliary projections
    const priorityWeights: Record<RuntimeDomain, number> = {
      orders: 100,
      payments: 90, // Virtual domain for future implementation
      tables: 80,
      kds: 70,
      analytics: 10,
      system: 0
    } as any; // Cast for virtual domain 'payments'

    // Sort domains by weight descending
    const prioritizedDomains = [...domains].sort((a, b) => {
      const wA = priorityWeights[a] || 0;
      const wB = priorityWeights[b] || 0;
      return wB - wA;
    });

    // In Phase 1 of formal runtime, we rely on full authoritative rebuilds on reconnect
    // executed SEQUENTIALLY to prevent reconnect storming and enforce domain hierarchy constraints.
    for (const domain of prioritizedDomains) {
      try {
        await this.handleGapDetected(domain, -1, -1);
      } catch (err) {
        console.error(`[ReplayRecoveryEngine] Prioritized recovery failed for domain ${domain}. Proceeding to next...`, err);
      }
    }
  }
}
