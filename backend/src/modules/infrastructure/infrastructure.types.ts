// ============================================================
// src/modules/infrastructure/infrastructure.types.ts
// Hardened Type definitions and DTO contracts for reliability runtime.
// ============================================================

export interface CorrelationContext {
  correlationId: string;
  tenantId: string | null;
  branchId: string | null;
  actorId: string | null;
  actorType: 'staff' | 'customer' | 'system' | 'anonymous';
  ipAddress?: string;
  userAgent?: string;
}

export interface TraceHeaders {
  'x-correlation-id': string;
  'x-tenant-id'?: string;
  'x-branch-id'?: string;
  'x-actor-id'?: string;
  'x-actor-type'?: string;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLogPayload {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  correlation: Partial<CorrelationContext>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    raw?: any;
  };
  metadata?: Record<string, any>;
}

export interface MetricDefinition {
  name: string;
  tags: {
    tenantId?: string;
    branchId?: string;
    category?: string;
    workerName?: string;
    status?: string;
    [key: string]: string | undefined;
  };
  value: number;
  timestamp: string;
}

export interface HealthDependencyReport {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  latencyMs: number;
  message?: string;
  version?: string;
}

export interface HealthReport {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  environment: string;
  version: string;
  dependencies: {
    database: HealthDependencyReport;
    queue: HealthDependencyReport;
    realtime: HealthDependencyReport;
    workers: HealthDependencyReport;
    cache?: HealthDependencyReport;
  };
}

export interface WorkerLease {
  id: string;
  workerName: string;
  nodeId: string;
  leaseAcquiredAt: string;
  leaseExpiresAt: string;
  status: 'active' | 'orphaned' | 'released';
  versionNum: number;
}

export interface AuditLogEntry {
  id?: string;
  tenantId: string | null;
  branchId: string | null;
  actorId: string | null;
  actorType: 'staff' | 'customer' | 'system' | 'anonymous';
  action: string;
  payload: Record<string, any>;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
}

export interface RateLimitQuota {
  limit: number;      // Max tokens allowed in bucket
  refillRate: number; // Tokens refilled per second
  windowSec: number;  // Expiry TTL window in seconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSec: number;
}

export type RecoveryJobType = 'projection_rebuild' | 'reconciliation_repair' | 'dead_letter_replay';
export type RecoveryJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface RecoveryJob {
  id: string;
  tenantId: string;
  jobType: RecoveryJobType;
  status: RecoveryJobStatus;
  parameters: Record<string, any>;
  resultSummary?: Record<string, any>;
  errorMessage?: string;
  startedBy?: string;
  startedAt: string;
  completedAt?: string;
}
