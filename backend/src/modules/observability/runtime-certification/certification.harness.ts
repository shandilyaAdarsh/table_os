// ============================================================
// src/modules/observability/runtime-certification/certification.harness.ts
// Deterministic test harness for distributed convergence engineering.
// ============================================================

import { RuntimeEventTelemetry, RuntimeSnapshot } from '../telemetry.types';
import { RuntimeMetricsAggregator } from '../runtime-metrics.aggregator';
import * as fs from 'fs';
import * as path from 'path';

export interface CertificationScenario {
  id: string;
  name: string;
  description: string;
  execute: (harness: CertificationHarness) => Promise<void>;
  assert: (harness: CertificationHarness) => void;
}

export interface CertificationResult {
  scenarioId: string;
  success: boolean;
  timestamp: string;
  trace: RuntimeEventTelemetry[];
  snapshot: RuntimeSnapshot;
  errors: string[];
}

export class CertificationHarness {
  private tenantId: string;
  private domain = 'orders';
  private originalDateNow: () => number;
  private syntheticTime: number = 0;
  private trace: RuntimeEventTelemetry[] = [];
  public errors: string[] = [];
  private surfaceClockSkews: Map<string, number> = new Map();
  private surfaceVisibility: Map<string, string> = new Map();

  constructor(scenarioId: string) {
    this.tenantId = `cert_${scenarioId}_${Date.now()}`;
    this.originalDateNow = Date.now;
  }

  public getTenantId() { return this.tenantId; }
  public getDomain() { return this.domain; }

  /**
   * Begins deterministic execution. Mocks timers.
   */
  public async run(scenario: CertificationScenario): Promise<CertificationResult> {
    this.setupDeterminism();
    try {
      await scenario.execute(this);
      scenario.assert(this);
    } catch (err: any) {
      this.errors.push(err.message || 'Unknown error');
    } finally {
      this.teardownDeterminism();
    }

    const result: CertificationResult = {
      scenarioId: scenario.id,
      success: this.errors.length === 0,
      timestamp: new Date().toISOString(),
      trace: [...this.trace],
      snapshot: RuntimeMetricsAggregator.getSnapshot(this.tenantId),
      errors: [...this.errors]
    };

    this.saveArtifact(result);
    RuntimeMetricsAggregator.clearTenant(this.tenantId);

    return result;
  }

  /**
   * Emit an event into the aggregator deterministicly, applying surface-specific clock skews.
   */
  public emitEvent(eventTemplate: Partial<RuntimeEventTelemetry>): void {
    const surface = eventTemplate.runtime_surface || 'BACKEND_ENGINE';
    const skew = this.surfaceClockSkews.get(surface) || 0;
    const visibility = this.surfaceVisibility.get(surface) || 'visible';
    
    const fullEvent: RuntimeEventTelemetry = {
      tenant_id: this.tenantId,
      runtime_surface: surface as any,
      domain: this.domain as any,
      event_timestamp: new Date(this.syntheticTime + skew).toISOString(),
      correlation_id: `cert_${this.syntheticTime}_${Math.random().toString(36).substring(7)}`,
      certification_run_id: this.tenantId,
      severity: 'INFO',
      event_type: 'SIMULATION_TRIGGERED',
      metadata: { visibilityState: visibility },
      ...eventTemplate
    } as RuntimeEventTelemetry;

    // Merge metadata
    if (eventTemplate.metadata) {
      fullEvent.metadata = { ...fullEvent.metadata, ...eventTemplate.metadata };
    }

    this.trace.push(fullEvent);
    RuntimeMetricsAggregator.ingestEvent(fullEvent);
  }

  public advanceTime(ms: number) {
    this.syntheticTime += ms;
  }

  public assertSnapshot(condition: (snapshot: RuntimeSnapshot) => boolean, errorMessage: string) {
    const snapshot = RuntimeMetricsAggregator.getSnapshot(this.tenantId);
    if (!condition(snapshot)) {
      this.errors.push(errorMessage);
    }
  }

  public assertTrace(condition: (trace: RuntimeEventTelemetry[]) => boolean, errorMessage: string) {
    if (!condition(this.trace)) {
      this.errors.push(errorMessage);
    }
  }

  private setupDeterminism() {
    this.syntheticTime = 1600000000000; // Fixed start time
    global.Date.now = () => this.syntheticTime;
  }

  private teardownDeterminism() {
    global.Date.now = this.originalDateNow;
  }

  public setClockSkew(surface: string, driftMs: number) {
    this.surfaceClockSkews.set(surface, driftMs);
  }

  public setVisibilityState(surface: string, state: 'visible' | 'hidden' | 'backgrounded') {
    this.surfaceVisibility.set(surface, state);
  }

  private saveArtifact(result: CertificationResult) {
    const dir = path.join(__dirname, 'artifacts');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filename = `${result.scenarioId}_${result.success ? 'PASS' : 'FAIL'}_${this.tenantId}.json`;
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(result, null, 2));
  }
}
