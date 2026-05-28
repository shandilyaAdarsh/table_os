import { RealtimeEventRouter } from '../realtime/RealtimeEventRouter';
import { ReplayRecoveryEngine } from '../replay/ReplayRecoveryEngine';
import { RuntimeObservabilityLayer } from '../observability/RuntimeObservabilityLayer';
import { ProjectionCoordinator } from '../projection/ProjectionCoordinator';
import { RealtimeTransportAdapter } from './TransportAdapter';
import { useRuntimeStore } from '../../store/useRuntimeStore';

export type RuntimeState = 
  | 'BOOTSTRAPPING' 
  | 'SYNCING' 
  | 'LIVE' 
  | 'DEGRADED' 
  | 'RECONNECTING' 
  | 'RECOVERING' 
  | 'SUSPENDED' 
  | 'FAILED';

export class RuntimeTransportManager {
  private currentState: RuntimeState = 'BOOTSTRAPPING';
  private router: RealtimeEventRouter;
  private replayEngine: ReplayRecoveryEngine;
  private observability: RuntimeObservabilityLayer;
  private projectionCoordinator: ProjectionCoordinator;

  // Realtime Transport
  private adapter: RealtimeTransportAdapter | null = null;
  private channelTopic: string = '';

  // Polling / Degraded Mode Fallbacks
  private heartbeatInterval: any = null;
  private pollingInterval: any = null;
  private lastApiContact: number = Date.now();
  private consecutiveFailures: number = 0;

  constructor(
    router: RealtimeEventRouter,
    replayEngine: ReplayRecoveryEngine,
    observability: RuntimeObservabilityLayer,
    projectionCoordinator: ProjectionCoordinator
  ) {
    this.router = router;
    this.replayEngine = replayEngine;
    this.observability = observability;
    this.projectionCoordinator = projectionCoordinator;
  }

  public initialize(adapter: RealtimeTransportAdapter, topic: string) {
    this.adapter = adapter;
    this.channelTopic = topic;
    this.transitionTo('SYNCING');
    this.connectWebsocket();
    this.startHeartbeat();
  }

  public getState(): RuntimeState {
    return this.currentState;
  }

  private transitionTo(newState: RuntimeState) {
    if (this.currentState === newState) return;
    console.info(`[RuntimeTransportManager] State Transition: ${this.currentState} -> ${newState}`);
    this.observability.recordStateTransition(this.currentState, newState);
    this.currentState = newState;

    // Push into React store so UX can adapt (Readonly mode, banners, etc.)
    useRuntimeStore.getState().setTransportState(newState);

    // Handle side-effects of entering new state
    if (newState === 'DEGRADED') {
      this.startPollingFallback();
    } else {
      this.stopPollingFallback();
    }
  }

  private connectWebsocket() {
    if (!this.adapter) return;
    
    this.adapter.connect(
      this.channelTopic,
      (payload) => {
        this.recordApiSuccess();
        this.router.handleIncomingEvent(payload);
      },
      (status) => {
        if (status === 'CONNECTED') {
          this.handleConnected();
        } else {
          this.handleDisconnected();
        }
      }
    );
  }

  private handleConnected() {
    this.recordApiSuccess();
    
    if (this.currentState === 'RECONNECTING' || this.currentState === 'DEGRADED') {
      this.transitionTo('RECOVERING');
      // Trigger recovery on active domains (hardcoded for now, would typically be derived from context)
      this.replayEngine.handleReconnectRecovery(['orders', 'tables']).then(() => {
        this.transitionTo('LIVE');
      });
    } else {
      this.transitionTo('LIVE');
    }
  }

  private handleDisconnected() {
    if (this.currentState === 'SUSPENDED' || this.currentState === 'FAILED') return;
    
    this.transitionTo('RECONNECTING');
    
    // Attempt reconnect after backoff or fall into degraded state
    setTimeout(() => {
      if (this.currentState === 'RECONNECTING') {
        this.transitionTo('DEGRADED');
      }
    }, 5000);
  }

  /**
   * Called by MutationGateway or any fetch interceptor when an API request succeeds
   */
  public recordApiSuccess() {
    this.lastApiContact = Date.now();
    this.consecutiveFailures = 0;
    
    if (this.currentState === 'DEGRADED' && this.adapter?.connectionState === 'CONNECTED') {
      // We are communicating but websocket might be stalling? Or just recovering from degraded
      // If we're DEGRADED but we just had a successful fetch, we stay in DEGRADED 
      // unless the websocket also fires a connected event.
    }
  }

  /**
   * Called by MutationGateway or any fetch interceptor when an API request fails
   */
  public recordApiFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures > 3 && this.currentState !== 'FAILED' && this.currentState !== 'SUSPENDED') {
      this.transitionTo('DEGRADED');
    }
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      const idleTime = Date.now() - this.lastApiContact;
      // If no contact in 30s, assume disconnect/degraded
      if (idleTime > 30000 && this.currentState === 'LIVE') {
        console.warn(`[RuntimeTransportManager] Heartbeat stalled. Transitioning to DEGRADED.`);
        this.transitionTo('DEGRADED');
      }
    }, 15000);
  }

  private startPollingFallback() {
    if (this.pollingInterval) return;
    console.info(`[RuntimeTransportManager] Initiating Polling Fallback Mode`);
    
    // Replace all component-level polling with centralized polling.
    // E.g., we explicitly poll the ProjectionCoordinator for domains we care about
    this.pollingInterval = setInterval(async () => {
      try {
        await this.projectionCoordinator.handleInvalidation('orders');
        await this.projectionCoordinator.handleInvalidation('tables');
        this.recordApiSuccess();
      } catch (err) {
        this.recordApiFailure();
      }
    }, 10000); // Poll every 10 seconds in degraded mode
  }

  private stopPollingFallback() {
    if (this.pollingInterval) {
      console.info(`[RuntimeTransportManager] Terminating Polling Fallback Mode`);
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  public suspend() {
    this.transitionTo('SUSPENDED');
    this.stopPollingFallback();
    if (this.adapter) {
      this.adapter.disconnect();
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
