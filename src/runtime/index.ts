import { RealtimeEventRouter } from './realtime/RealtimeEventRouter';
import { ProjectionCoordinator } from './projection/ProjectionCoordinator';
import { MutationGateway } from './mutation/MutationGateway';
import { ReplayRecoveryEngine } from './replay/ReplayRecoveryEngine';
import { RuntimeTransportManager } from './transport/RuntimeTransportManager';
import { RuntimeObservabilityLayer } from './observability/RuntimeObservabilityLayer';
import { RuntimeStormValidator } from './validation/RuntimeStormValidator';

class RuntimeCompositionRoot {
  public observability: RuntimeObservabilityLayer;
  public projection: ProjectionCoordinator;
  public router: RealtimeEventRouter;
  public replay: ReplayRecoveryEngine;
  public transport: RuntimeTransportManager;
  public mutation: MutationGateway;

  constructor() {
    // 1. Observability (Base Telemetry)
    this.observability = new RuntimeObservabilityLayer();

    // 2. Projection Coordinator (State Rebuild Authority)
    this.projection = new ProjectionCoordinator(this.observability);

    // 3. Replay Recovery Engine (Divergence Resolution)
    this.replay = new ReplayRecoveryEngine(this.projection, this.observability);

    // 4. Realtime Event Router (Sequence Validation & Routing)
    this.router = new RealtimeEventRouter(this.projection, this.replay, this.observability);

    // 5. Runtime Transport Manager (Lifecycle State Machine & Liveness)
    this.transport = new RuntimeTransportManager(
      this.router,
      this.replay,
      this.observability,
      this.projection
    );

    // 6. Mutation Gateway (Operational Boundary)
    this.mutation = new MutationGateway(this.observability, this.transport);
  }

  /**
   * Initializes the formal runtime infrastructure for a specific surface session.
   * e.g., called from App.jsx or main.tsx on mount.
   */
  public bootstrap(surfaceId: string, sessionId: string, adapter?: any, topic?: string): void {
    console.info(`[Runtime] Bootstrapping Runtime Infrastructure (Surface: ${surfaceId})`);
    
    // Register surface with observability layer for telemetry attribution
    this.observability.setSurface(surfaceId);

    // Initialize session bounds for mutations
    this.mutation.initializeSession(sessionId, surfaceId);
    
    // Initialize transport (If adapter provided)
    if (adapter && topic) {
      this.transport.initialize(adapter, topic);
    }
  }

  /**
   * Run the full Runtime Convergence Certification suite.
   * Call from devtools or CI harness: runtime.certify().then(console.log)
   */
  public async certify() {
    const validator = new RuntimeStormValidator({
      router: this.router,
      projection: this.projection,
      replay: this.replay,
      transport: this.transport,
      observability: this.observability,
    });
    return validator.runAll();
  }
}

// Export a single, immutable instance of the composition root
export const runtime = new RuntimeCompositionRoot();
