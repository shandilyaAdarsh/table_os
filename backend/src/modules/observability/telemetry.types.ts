// ============================================================
// src/modules/observability/telemetry.types.ts
// Strongly typed contracts for deterministic runtime observability.
// ============================================================

export type RuntimeSurface = 'ADMIN' | 'POS' | 'KDS' | 'QR' | 'STAFF' | 'BACKEND_ENGINE';
export type RuntimeDomain = 'orders' | 'tables' | 'kds' | 'analytics' | 'system';

export type TelemetrySeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type TelemetryEventType = 
  // Transport Lifecycle
  | 'TRANSPORT_CONNECTED'
  | 'TRANSPORT_DISCONNECTED'
  | 'TRANSPORT_RECONNECT_STARTED'
  | 'TRANSPORT_RECONNECT_COMPLETED'
  | 'TRANSPORT_DEGRADED'
  | 'TRANSPORT_POLLING_FALLBACK'
  // Replay Lifecycle
  | 'REPLAY_STARTED'
  | 'REPLAY_PROGRESS'
  | 'REPLAY_COMPLETED'
  | 'REPLAY_GAP_DETECTED'
  | 'REPLAY_ABORTED'
  // Projection Lifecycle
  | 'PROJECTION_INVALIDATED'
  | 'PROJECTION_REBUILD_STARTED'
  | 'PROJECTION_REBUILD_COMPLETED'
  | 'PROJECTION_REBUILD_FAILED'
  | 'PROJECTION_STALE_REJECTED'
  // Mutation Lifecycle
  | 'MUTATION_QUEUED'
  | 'MUTATION_INFLIGHT'
  | 'MUTATION_ACKNOWLEDGED'
  | 'MUTATION_REPLAY_CONFIRMED'
  | 'MUTATION_OCC_CONFLICT'
  | 'MUTATION_FAILED'
  | 'MUTATION_RETRYING'
  // Divergence Engine
  | 'WATERMARK_ROLLBACK_DETECTED'
  | 'REPLAY_LOOP_DETECTED'
  | 'PROJECTION_DRIFT_DETECTED'
  | 'DUPLICATE_REPLAY_STORM_DETECTED'
  | 'TRANSPORT_DIVERGENCE_DETECTED'
  // Legacy / Other
  | 'STALE_PAYLOAD_REJECTED'
  | 'SEQUENCE_GAP_DETECTED'
  | 'SIMULATION_TRIGGERED'
  // Operational Safety
  | 'RUNTIME_SAFETY_ACTION'
  // Custom Detections
  | 'CLOCK_DRIFT_DETECTED'
  | 'REPLAY_LAG_DETECTED'
  | 'QUEUE_STARVATION_DETECTED';

export interface BaseTelemetryEvent {
  tenant_id: string;
  runtime_surface: RuntimeSurface;
  domain: RuntimeDomain;
  aggregate_id?: string;
  sequence?: number;
  runtime_epoch?: number;
  event_timestamp: string; // ISO 8601
  correlation_id: string;
  parent_correlation_id?: string;
  replay_chain_id?: string;
  certification_run_id?: string;
  incident_id?: string;
  mutation_id?: string;
  replay_source?: string;
  transport_source?: string;
}

export interface RuntimeEventTelemetry extends BaseTelemetryEvent {
  event_type: TelemetryEventType;
  severity: TelemetrySeverity;
  metadata: Record<string, any>;
}

export interface RuntimeDomainHealth {
  watermark: number;
  rebuildCount: number;
  cancelledCount: number;
  staleCount: number;
  gapCount: number;
  avgDurationMs: number;
}

export interface RuntimeHeapMetrics {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
}

export interface RuntimeSnapshot {
  tenantId: string;
  transportState: 'LIVE' | 'CONNECTED' | 'RECONNECTING' | 'RECOVERING' | 'DEGRADED' | 'FAILED' | 'DISCONNECTED';
  lastConnectionId?: string;
  isDegraded: boolean;
  isRecovering: boolean;
  isRealtimeConnected: boolean;
  degradedPollingActive: boolean;

  reconnectAttempts: number;
  reconnectFailures: number;

  staleRejected: number;
  debounceCollapses: number;
  invalidationsEmitted: number;
  sequenceGaps: number;
  malformedEvents: number;

  mutationSubmitted: number;
  mutationAcknowledged: number;
  mutationConfirmed: number;
  mutationStalled: number;
  mutationFailed: number;
  mutationRejected: number;

  bufferSize: number;
  droppedEvents: number;
  bufferOverflows: number;

  domains: Record<string, RuntimeDomainHealth>;
  activeAlerts: DivergenceAlert[];
  instability: RuntimeInstabilitySnapshot;
  convergence: RuntimeConvergenceSnapshot;

  // Cross-Surface Parity Metrics
  maxWatermarkDrift?: number;
  highestWatermark?: number;
  lowestWatermark?: number;

  // Memory Stability
  heapMetrics?: RuntimeHeapMetrics;
}

export interface DivergenceAlert {
  incident_id: string;
  event_type: TelemetryEventType;
  severity: TelemetrySeverity;
  domain?: string;
  runtime_surface: string;
  timestamp: string;
  count: number;
  metadata: Record<string, any>;
}

export interface RuntimeInstabilitySnapshot {
  reconnectScore: number;
  mutationScore: number;
  projectionScore: number;
  transportScore: number;
  duplicateScore: number;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'UNSTABLE' | 'CRITICAL';
}

export interface RuntimeConvergenceSnapshot {
  surfaces: Record<string, SurfaceConvergenceState>;
  crossSurface: CrossSurfaceMetrics;
}

export interface CrossSurfaceMetrics {
  watermarkParity: boolean;
  maxWatermarkDrift: number;
  highestWatermark: number;
  divergenceIncidentCount: number;
  convergenceStabilityScore: number;
}

export interface SurfaceConvergenceState {
  surface: RuntimeSurface;
  currentWatermark: number;
  replayWatermark: number;
  replayLag: number;
  mutationQueueDepth: number;
  duplicateSuppressionCount: number;
  staleRejectionCount: number;
  projectionFreshnessAgeMs: number;
  rebuildQueuePressure: number;
  isStale: boolean;
  transportDegradationState: 'HEALTHY' | 'DEGRADED' | 'DISCONNECTED';
  lastSeenTimestamp: string;
  reconnectAttempts: number;
}
