import { RuntimeDomain } from '../realtime/RealtimeEventRouter';
import { RuntimeObservabilityLayer } from '../observability/RuntimeObservabilityLayer';
import { fetchWithRuntime } from '../../lib/apiClient'; // Temporary until pure adapter is used for fetches too
import { useOrderStore } from '../../store/index';

interface ActiveRebuild {
  promise: Promise<void>;
  abortController: AbortController;
  epoch: number;
}

export class ProjectionCoordinator {
  private observability: RuntimeObservabilityLayer;

  // Track the current rebuild execution per domain for STRICT serialization
  private activeRebuilds: Map<RuntimeDomain, ActiveRebuild> = new Map();
  
  // Track epochs to prevent stale async overlaps
  private domainEpochs: Map<RuntimeDomain, number> = new Map();

  // Watermarks (synced with RealtimeEventRouter ideally, or tracked locally for application safety)
  private localWatermarks: Map<RuntimeDomain, number> = new Map();

  constructor(observability: RuntimeObservabilityLayer) {
    this.observability = observability;
  }

  /**
   * Called primarily by RealtimeEventRouter when an invalidation occurs.
   * Enforces strictly serialized, deduplicated rebuild queues with abortable fetch.
   */
  public async handleInvalidation(domain: RuntimeDomain, targetId?: string): Promise<void> {
    const currentEpoch = (this.domainEpochs.get(domain) || 0) + 1;
    this.domainEpochs.set(domain, currentEpoch);

    // Cancel any currently in-flight rebuild for this domain (Collapse/Deduplicate)
    if (this.activeRebuilds.has(domain)) {
      const active = this.activeRebuilds.get(domain)!;
      active.abortController.abort('Stale rebuild cancelled by newer invalidation');
      this.observability.recordProjectionRebuild(domain, 0, false, { reason: 'CANCELLED_BY_NEW_INVALIDATION' });
      console.debug(`[ProjectionCoordinator] Cancelled stale rebuild for ${domain}. Starting epoch ${currentEpoch}.`);
    }

    const abortController = new AbortController();
    
    // Create the serialized rebuild promise
    const rebuildPromise = this.executeRebuild(domain, currentEpoch, abortController.signal, targetId).finally(() => {
      // Clean up active rebuild reference if it hasn't been replaced
      if (this.activeRebuilds.get(domain)?.epoch === currentEpoch) {
        this.activeRebuilds.delete(domain);
      }
    });

    this.activeRebuilds.set(domain, {
      promise: rebuildPromise,
      abortController,
      epoch: currentEpoch
    });

    return rebuildPromise;
  }

  private async executeRebuild(domain: RuntimeDomain, epoch: number, signal: AbortSignal, targetId?: string): Promise<void> {
    const startTime = performance.now();
    try {
      console.info(`[ProjectionCoordinator] Commencing atomic rebuild for domain: ${domain} (Epoch: ${epoch})`);
      
      let newWatermark = -1;

      switch (domain) {
        case 'orders':
          newWatermark = await this.rebuildOrderProjection(epoch, signal, targetId);
          break;
        case 'tables':
          console.warn('[ProjectionCoordinator] Tables domain migration pending. Skipping.');
          break;
        default:
          console.warn(`[ProjectionCoordinator] Unhandled domain rebuild: ${domain}`);
      }

      if (signal.aborted) {
        throw new Error('Aborted');
      }

      const duration = performance.now() - startTime;
      this.observability.recordProjectionRebuild(domain, duration, true, { epoch, newWatermark });

    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Aborted') {
        // Normal deduplication, already logged in handleInvalidation
        return;
      }
      
      const duration = performance.now() - startTime;
      this.observability.recordProjectionRebuild(domain, duration, false, { epoch, error: error.message });
      console.error(`[ProjectionCoordinator] Failed to rebuild projection for ${domain}`, error);
      throw error;
    }
  }

  // --- Domain Specific Rebuilds ---

  private async rebuildOrderProjection(epoch: number, signal: AbortSignal, orderId?: string): Promise<number> {
    // 1. Authoritative Fetch
    const endpoint = orderId ? `/api/v1/orders/${orderId}` : `/api/v1/orders`;
    
    // We bypass fetchWithRuntime here if we strictly want signal support, 
    // but assuming standard fetch api, we can pass it via options.
    const response = await fetch(import.meta.env.VITE_API_URL + endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
      },
      signal
    });

    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    const data = await response.json();
    
    // Verify Epoch matches before proceeding
    if (this.domainEpochs.get('orders') !== epoch) {
      throw new Error('Epoch mismatch - a newer rebuild is active');
    }

    // 2. Version Guard
    // Assuming backend returns an overall 'version_num' for the projection collection
    const incomingVersion = data.version_num || 0; 
    const currentWatermark = this.localWatermarks.get('orders') || 0;
    
    if (incomingVersion <= currentWatermark && incomingVersion !== 0) {
      console.warn(`[ProjectionCoordinator] Stale projection rebuild ignored for orders. Incoming: ${incomingVersion}, Current: ${currentWatermark}`);
      return currentWatermark; // Do not apply
    }

    // 3. Atomic Normalized Replacement
    if (orderId) {
      // Single order replacement (assuming the store supports replacing a single normalized entry)
      useOrderStore.getState().replaceOrderProjection(data.order);
    } else {
      // Full collection replacement
      useOrderStore.getState().replaceOrdersProjection(data.orders);
    }

    // Update watermark
    this.localWatermarks.set('orders', incomingVersion);
    console.debug(`[ProjectionCoordinator] Atomic replacement applied for orders (Version: ${incomingVersion})`);
    
    return incomingVersion;
  }
}
