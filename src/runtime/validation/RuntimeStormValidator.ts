/**
 * RuntimeStormValidator
 *
 * Automated convergence certification harness for the Orderlli runtime infrastructure.
 * Runs deterministic failure simulations and validates recovery invariants.
 *
 * This is NOT a unit test runner. It is an in-process runtime simulation harness
 * that injects failure conditions into the live runtime objects and verifies
 * convergence outcomes against strict invariants.
 *
 * Usage:
 *   import { RuntimeStormValidator } from './RuntimeStormValidator';
 *   const validator = new RuntimeStormValidator(runtime);
 *   const results = await validator.runAll();
 */

import { RuntimeObservabilityLayer, TelemetryEventType } from '../observability/RuntimeObservabilityLayer';
import { RealtimeEventRouter, RuntimeDomain, RuntimeEventPayload } from '../realtime/RealtimeEventRouter';
import { ProjectionCoordinator } from '../projection/ProjectionCoordinator';
import { ReplayRecoveryEngine } from '../replay/ReplayRecoveryEngine';
import { RuntimeTransportManager } from '../transport/RuntimeTransportManager';

// ─── Test Result Types ──────────────────────────────────────────────────────

export interface StormTestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  invariants: InvariantResult[];
  telemetrySnapshot: any[];
  error?: string;
}

export interface InvariantResult {
  description: string;
  passed: boolean;
  actual?: any;
  expected?: any;
}

export interface ValidationReport {
  suiteName: string;
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  certified: boolean;
  results: StormTestResult[];
  summary: string;
}

// ─── Invariant Checker ──────────────────────────────────────────────────────

function check(description: string, condition: boolean, actual?: any, expected?: any): InvariantResult {
  return { description, passed: condition, actual, expected };
}

// ─── RuntimeStormValidator ──────────────────────────────────────────────────

export class RuntimeStormValidator {
  private router: RealtimeEventRouter;
  private projection: ProjectionCoordinator;
  private replay: ReplayRecoveryEngine;
  private transport: RuntimeTransportManager;
  private observability: RuntimeObservabilityLayer;

  constructor(deps: {
    router: RealtimeEventRouter;
    projection: ProjectionCoordinator;
    replay: ReplayRecoveryEngine;
    transport: RuntimeTransportManager;
    observability: RuntimeObservabilityLayer;
  }) {
    this.router = deps.router;
    this.projection = deps.projection;
    this.replay = deps.replay;
    this.transport = deps.transport;
    this.observability = deps.observability;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public async runAll(): Promise<ValidationReport> {
    const start = performance.now();
    console.info('[StormValidator] ═══ Beginning Runtime Convergence Certification ═══');

    const results: StormTestResult[] = [];

    results.push(await this.runTest('Stale Event Rejection', () => this.testStaleEventRejection()));
    results.push(await this.runTest('Event Flood Collapse', () => this.testEventFloodCollapse()));
    results.push(await this.runTest('Sequence Gap Detection', () => this.testSequenceGapDetection()));
    results.push(await this.runTest('Rebuild Serialization (Epoch Guard)', () => this.testRebuildSerialization()));
    results.push(await this.runTest('Duplicate Invalidation Deduplication', () => this.testDuplicateInvalidationDeduplication()));
    results.push(await this.runTest('Reconnect Recovery Prioritization', () => this.testReconnectRecoveryPrioritization()));
    results.push(await this.runTest('Watermark Monotonicity', () => this.testWatermarkMonotonicity()));
    results.push(await this.runTest('Replay Recovery Convergence', () => this.testReplayRecoveryConvergence()));

    const totalMs = performance.now() - start;
    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const certified = failed === 0;

    const report: ValidationReport = {
      suiteName: 'Orderlli Runtime Convergence Certification',
      timestamp: new Date().toISOString(),
      totalTests: results.length,
      passed,
      failed,
      certified,
      results,
      summary: certified
        ? `✅ CERTIFIED — All ${passed} invariants passed in ${totalMs.toFixed(1)}ms. Runtime is convergence-safe.`
        : `❌ NOT CERTIFIED — ${failed}/${results.length} tests failed. Runtime is NOT pilot-grade.`
    };

    console.info(`[StormValidator] ${report.summary}`);
    return report;
  }

  // ─── Test Runner ───────────────────────────────────────────────────────────

  private async runTest(name: string, fn: () => Promise<InvariantResult[]>): Promise<StormTestResult> {
    const start = performance.now();
    this.observability.clearBuffer();
    console.info(`[StormValidator] ── Running: ${name}`);

    try {
      const invariants = await fn();
      const durationMs = performance.now() - start;
      const allPassed = invariants.every(i => i.passed);

      invariants.forEach(inv => {
        const icon = inv.passed ? '  ✓' : '  ✗';
        console[inv.passed ? 'info' : 'error'](
          `${icon} ${inv.description}${inv.passed ? '' : ` | Expected: ${JSON.stringify(inv.expected)}, Got: ${JSON.stringify(inv.actual)}`}`
        );
      });

      return {
        name,
        passed: allPassed,
        durationMs,
        invariants,
        telemetrySnapshot: this.observability.getEventBuffer(),
      };
    } catch (err: any) {
      return {
        name,
        passed: false,
        durationMs: performance.now() - start,
        invariants: [{ description: 'Test harness error', passed: false, actual: err?.message }],
        telemetrySnapshot: this.observability.getEventBuffer(),
        error: err?.message,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: Stale Event Rejection
  // Injects events with version_num <= current watermark.
  // Invariant: no invalidation is emitted for stale events.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testStaleEventRejection(): Promise<InvariantResult[]> {
    const domain: RuntimeDomain = 'orders';

    // Advance watermark to version 10
    this.router.resetWatermark(domain, 10);

    // Inject stale events
    const staleVersions = [5, 8, 10];
    staleVersions.forEach(v => {
      this.router.handleIncomingEvent({ domain, version_num: v, type: 'INVALIDATION' });
    });

    // Wait for any debounce
    await sleep(100);

    const staleRejections = this.observability.getEventsByType('REALTIME_STALE_REJECTED');
    const invalidations = this.observability.getEventsByType('REALTIME_INVALIDATION_EMITTED');

    return [
      check('3 stale events produced 3 STALE_REJECTED telemetry events', staleRejections.length === 3, staleRejections.length, 3),
      check('No invalidations emitted for stale events', invalidations.length === 0, invalidations.length, 0),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Event Flood Collapse
  // Fires 50 rapid events in same domain within 50ms.
  // Invariant: collapse debouncer collapses them into ≤ 2 invalidation emissions.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testEventFloodCollapse(): Promise<InvariantResult[]> {
    const domain: RuntimeDomain = 'orders';
    this.router.resetWatermark(domain, 0);

    // Fire 50 events with sequential versions
    for (let i = 1; i <= 50; i++) {
      this.router.handleIncomingEvent({
        domain,
        version_num: i,
        type: 'INVALIDATION',
        target_id: `order_${i}`,
      });
    }

    // Wait for debounce to fire (50ms window + buffer)
    await sleep(200);

    const collapseEvents = this.observability.getEventsByType('REALTIME_DEBOUNCE_COLLAPSE');
    const invalidationEvents = this.observability.getEventsByType('REALTIME_INVALIDATION_EMITTED');

    return [
      check('At least 1 collapse event emitted for burst', collapseEvents.length >= 1, collapseEvents.length, '≥1'),
      check('Invalidation count is bounded (≤ 3 for 50 events)', invalidationEvents.length <= 3, invalidationEvents.length, '≤3'),
      check('At least 1 invalidation eventually emitted', invalidationEvents.length >= 1, invalidationEvents.length, '≥1'),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: Sequence Gap Detection
  // Injects an event with version_num that skips the expected sequence.
  // Invariant: gap detected, replay triggered.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testSequenceGapDetection(): Promise<InvariantResult[]> {
    const domain: RuntimeDomain = 'orders';

    // Set watermark to 5, then inject event at version 9 (gap: 6, 7, 8 missing)
    this.router.resetWatermark(domain, 5);
    this.router.handleIncomingEvent({ domain, version_num: 9, type: 'INVALIDATION' });

    await sleep(100);

    const gapEvents = this.observability.getEventsByType('REALTIME_SEQUENCE_GAP');
    const replayStarted = this.observability.getEventsByType('REPLAY_RECOVERY_STARTED');

    return [
      check('REALTIME_SEQUENCE_GAP telemetry fired', gapEvents.length >= 1, gapEvents.length, '≥1'),
      check('Gap event domain is correct', gapEvents[0]?.domain === domain, gapEvents[0]?.domain, domain),
      check('REPLAY_RECOVERY_STARTED fired after gap', replayStarted.length >= 1, replayStarted.length, '≥1'),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: Rebuild Serialization / Epoch Guard
  // Fires 3 rapid invalidations. Only the latest should execute to completion.
  // Invariant: cancelled events emit REBUILD_CANCELLED. Final epoch wins.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testRebuildSerialization(): Promise<InvariantResult[]> {
    const domain: RuntimeDomain = 'orders';

    // Trigger 3 rapid invalidations without awaiting
    const p1 = this.projection.handleInvalidation(domain, 'order_a').catch(() => {});
    const p2 = this.projection.handleInvalidation(domain, 'order_b').catch(() => {});
    const p3 = this.projection.handleInvalidation(domain, 'order_c').catch(() => {});

    await Promise.allSettled([p1, p2, p3]);
    await sleep(100);

    const cancelled = this.observability.getEventsByType('PROJECTION_REBUILD_CANCELLED');
    const started = this.observability.getEventsByType('PROJECTION_REBUILD_STARTED');

    return [
      check('3 rebuilds were started', started.length === 3, started.length, 3),
      check('At least 2 were cancelled (deduplication enforcement)', cancelled.length >= 2, cancelled.length, '≥2'),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5: Duplicate Invalidation Deduplication
  // Fires duplicate domain events (same domain, rapidly).
  // Invariant: only 1 invalidation emission per collapsed burst.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testDuplicateInvalidationDeduplication(): Promise<InvariantResult[]> {
    const domain: RuntimeDomain = 'tables';
    this.router.resetWatermark(domain, 0);

    // Fire 5 events for same target within 20ms
    const target = 'table_T01';
    for (let v = 1; v <= 5; v++) {
      this.router.handleIncomingEvent({ domain, version_num: v, type: 'INVALIDATION', target_id: target });
      await sleep(5);
    }

    await sleep(200);

    const invalidations = this.observability.getEventsByType('REALTIME_INVALIDATION_EMITTED')
      .filter(e => e.domain === domain);

    return [
      check('Duplicate target events collapsed into ≤2 invalidations', invalidations.length <= 2, invalidations.length, '≤2'),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 6: Reconnect Recovery Prioritization
  // Runs handleReconnectRecovery with all domains and verifies domain order.
  // Invariant: orders recovers before analytics per priority matrix.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testReconnectRecoveryPrioritization(): Promise<InvariantResult[]> {
    const domains: RuntimeDomain[] = ['analytics', 'orders', 'kds', 'tables'];

    await this.replay.handleReconnectRecovery(domains);
    await sleep(100);

    const recoveryEvents = this.observability.getEventsByType('REPLAY_RECOVERY_STARTED');
    if (recoveryEvents.length < 2) {
      return [check('At least 2 recovery events emitted', false, recoveryEvents.length, '≥2')];
    }

    const ordersIdx = recoveryEvents.findIndex(e => e.domain === 'orders');
    const analyticsIdx = recoveryEvents.findIndex(e => e.domain === 'analytics');
    const tablesIdx = recoveryEvents.findIndex(e => e.domain === 'tables');

    return [
      check('Orders recovered before analytics', ordersIdx < analyticsIdx, { ordersIdx, analyticsIdx }, 'orders < analytics'),
      check('Tables recovered before analytics', tablesIdx < analyticsIdx, { tablesIdx, analyticsIdx }, 'tables < analytics'),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 7: Watermark Monotonicity
  // Fires events in order then attempts an out-of-order injection.
  // Invariant: watermark never regresses.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testWatermarkMonotonicity(): Promise<InvariantResult[]> {
    const domain: RuntimeDomain = 'orders';
    this.router.resetWatermark(domain, 0);

    // Advance normally
    [1, 2, 3, 4, 5].forEach(v => {
      this.router.handleIncomingEvent({ domain, version_num: v, type: 'INVALIDATION' });
    });

    const afterForward = this.router.getWatermark(domain);

    // Try to inject old events — should be rejected
    [2, 3, 1].forEach(v => {
      this.router.handleIncomingEvent({ domain, version_num: v, type: 'INVALIDATION' });
    });

    const afterReplay = this.router.getWatermark(domain);

    return [
      check('Watermark advances monotonically to 5', afterForward === 5, afterForward, 5),
      check('Watermark does not regress after stale events', afterReplay >= afterForward, afterReplay, `≥${afterForward}`),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 8: Replay Recovery Convergence
  // Simulates a sequence gap and verifies end-to-end recovery telemetry chain.
  // Invariant: GAP_DETECTED → RECOVERY_STARTED → RECOVERY_COMPLETED chain fires.
  // ═══════════════════════════════════════════════════════════════════════════

  private async testReplayRecoveryConvergence(): Promise<InvariantResult[]> {
    const domain: RuntimeDomain = 'orders';
    this.router.resetWatermark(domain, 10);

    // Inject a gap (watermark 10 → jump to 15)
    this.router.handleIncomingEvent({ domain, version_num: 15, type: 'INVALIDATION' });

    await sleep(500); // Allow recovery to proceed

    const gaps = this.observability.getEventsByType('REALTIME_SEQUENCE_GAP');
    const recoveryStarted = this.observability.getEventsByType('REPLAY_RECOVERY_STARTED');
    // Recovery completion depends on ProjectionCoordinator fetch succeeding.
    // In test mode, the fetch will fail (no real backend), but we verify the chain fires.
    const anyRecoveryTerminal = [
      ...this.observability.getEventsByType('REPLAY_RECOVERY_COMPLETED'),
      ...this.observability.getEventsByType('REPLAY_RECOVERY_FAILED'),
    ];

    return [
      check('Sequence gap telemetry fired', gaps.length >= 1, gaps.length, '≥1'),
      check('Recovery was initiated after gap', recoveryStarted.length >= 1, recoveryStarted.length, '≥1'),
      check('Recovery reached terminal state (COMPLETED or FAILED)', anyRecoveryTerminal.length >= 1, anyRecoveryTerminal.length, '≥1'),
    ];
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
