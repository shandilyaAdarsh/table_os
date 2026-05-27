import { ReplayFenceService } from '../../../src/modules/projection/replay-fence.service';
import { WorkerCoordinatorService } from '../../../src/modules/projection/worker-coordinator.service';
import { EventLedgerService } from '../../../src/modules/projection/event-ledger.service';
import { IncidentService } from '../../../src/modules/projection/incident.service';

async function runChaosSuite() {
  console.log('============================================================');
  console.log('STARTING PHASE 5 OPERATION CHAOS AND CONVERGENCE VALIDATION');
  console.log('============================================================\n');

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const otherTenantId = '99999999-9999-9999-9999-999999999999';
  const branchId = '22222222-2222-2222-2222-222222222222';
  const workerId = 'worker-node-alpha';
  const otherWorkerId = 'worker-node-beta';

  let passed = true;

  // ─── TEST 1: Replay Fencing & Stale Consumer Rejection ───────────
  try {
    console.log('Test 1: Replay Fencing...');
    await ReplayFenceService.clearFences(tenantId, branchId);

    // Initial check: no fences active
    const cleanCheck = await ReplayFenceService.validateGeneration({
      tenantId,
      branchId,
      clientGeneration: 100,
    });
    if (!cleanCheck.isAllowed) throw new Error('Expected clean check to pass');

    // Activate a fence
    const deploymentId = '33333333-3333-3333-3333-333333333333';
    await ReplayFenceService.activateFence({
      tenant_id: tenantId,
      branch_id: branchId,
      projection_generation: 500,
      active_deployment_id: deploymentId,
      replay_epoch: 'epoch_v2.0.0',
      compatibility_window: '1 hour',
      expires_in_seconds: 10,
    });

    // Validate stale consumer (generation 499) - should be rejected!
    const staleCheck = await ReplayFenceService.validateGeneration({
      tenantId,
      branchId,
      clientGeneration: 499,
      clientDeploymentId: deploymentId,
    });
    if (staleCheck.isAllowed) throw new Error('Stale generation 499 should have been rejected');
    console.log('  ✓ Stale consumer rejected correctly');

    // Validate compatible consumer (generation 500) - should be allowed!
    const validCheck = await ReplayFenceService.validateGeneration({
      tenantId,
      branchId,
      clientGeneration: 500,
      clientDeploymentId: deploymentId,
    });
    if (!validCheck.isAllowed) throw new Error('Compatible generation should have been allowed');
    console.log('  ✓ Compatible consumer allowed correctly');

    // Validate deployment mismatch - should be rejected!
    const mismatchCheck = await ReplayFenceService.validateGeneration({
      tenantId,
      branchId,
      clientGeneration: 500,
      clientDeploymentId: '44444444-4444-4444-4444-444444444444',
    });
    if (mismatchCheck.isAllowed) throw new Error('Mismatched deployment ID should have been rejected');
    console.log('  ✓ Mismatched deployment rejected correctly');

    await ReplayFenceService.clearFences(tenantId, branchId);
  } catch (err: any) {
    console.error('  ✗ Test 1 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 2: Worker Registry, Heartbeat, and Evictions ───────────
  try {
    console.log('\nTest 2: Worker Registry and Heartbeats...');
    
    // Register worker
    await WorkerCoordinatorService.registerWorker({
      worker_id: workerId,
      tenant_id: tenantId,
      branch_id: branchId,
      worker_role: 'REPLAYER',
      deployment_version: 'v2.0.0',
    });

    await WorkerCoordinatorService.heartbeat(workerId, 12); // load 12
    console.log('  ✓ Registered and heartbeated worker');

    // Stale eviction check
    const evicted = await WorkerCoordinatorService.evictStaleWorkers(tenantId, branchId);
    console.log(`  ✓ Checked stale worker evictions (evicted: ${evicted})`);
  } catch (err: any) {
    console.error('  ✗ Test 2 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 3: Lease-Based Projection Lock Ownership ────────────────
  try {
    console.log('\nTest 3: Lease Locking and Conflict Resolution...');
    
    // Clean registration of both nodes
    await WorkerCoordinatorService.registerWorker({
      worker_id: workerId,
      tenant_id: tenantId,
      branch_id: branchId,
      worker_role: 'REPLAYER',
      deployment_version: 'v2.0.0',
    });
    await WorkerCoordinatorService.registerWorker({
      worker_id: otherWorkerId,
      tenant_id: tenantId,
      branch_id: branchId,
      worker_role: 'REPLAYER',
      deployment_version: 'v2.0.0',
    });

    // Acquire lock for worker alpha
    const acquiredAlpha = await WorkerCoordinatorService.acquireProjectionLease({
      projectionName: 'table_runtime',
      tenantId,
      branchId,
      workerId,
      leaseDurationSeconds: 2,
    });
    if (!acquiredAlpha) throw new Error('Alpha worker failed to acquire initial lock');
    console.log('  ✓ Alpha acquired lease successfully');

    // Attempt to steal by beta (should fail)
    const acquiredBetaConflict = await WorkerCoordinatorService.acquireProjectionLease({
      projectionName: 'table_runtime',
      tenantId,
      branchId,
      workerId: otherWorkerId,
      leaseDurationSeconds: 2,
    });
    if (acquiredBetaConflict) throw new Error('Beta stole active lock illegally');
    console.log('  ✓ Lock conflict blocked beta worker correctly');

    // Release lock alpha
    await WorkerCoordinatorService.releaseProjectionLease('table_runtime', tenantId, branchId, workerId);
    console.log('  ✓ Alpha released lease successfully');

    // Now beta can acquire
    const acquiredBetaSuccess = await WorkerCoordinatorService.acquireProjectionLease({
      projectionName: 'table_runtime',
      tenantId,
      branchId,
      workerId: otherWorkerId,
      leaseDurationSeconds: 2,
    });
    if (!acquiredBetaSuccess) throw new Error('Beta failed to acquire released lock');
    console.log('  ✓ Beta acquired released lease successfully');
  } catch (err: any) {
    console.error('  ✗ Test 3 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 4: Durable Checkpoint Persistence ──────────────────────
  try {
    console.log('\nTest 4: Durable Checkpoints...');
    const checkpoint = {
      tenant_id: tenantId,
      branch_id: branchId,
      projection_name: 'table_runtime',
      last_sequence: 1450,
      checksum: 'sha256_dummy_checksum_val',
    };

    await EventLedgerService.saveCheckpoint(checkpoint);
    const fetched = await EventLedgerService.getCheckpoint(tenantId, branchId, 'table_runtime');
    if (!fetched || Number(fetched.last_sequence) !== 1450) {
      throw new Error('Checkpoint mismatch after save/get cycle');
    }
    console.log('  ✓ Durable checkpoint saved and recovered correctly');
  } catch (err: any) {
    console.error('  ✗ Test 4 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 5: Incident Escalation & Degradation Scoring ───────────
  try {
    console.log('\nTest 5: Operational Incidents & Recovery Rebuilds...');
    
    // Log incident
    await IncidentService.logIncident({
      tenant_id: tenantId,
      branch_id: branchId,
      incident_type: 'CHECKSUM_DRIFT',
      severity: 'CRITICAL',
      message: 'State checksum drift detected during rolling upgrade sequence',
    });

    const score = await IncidentService.getDegradationScore(tenantId, branchId);
    console.log(`  ✓ Calculated degradation score: ${score}`);
    if (score === 0) throw new Error('Degradation score should be greater than zero');
  } catch (err: any) {
    console.error('  ✗ Test 5 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 6: Tenant Isolation Validation ──────────────────────────
  try {
    console.log('\nTest 6: Cross-Tenant Isolation validation...');
    const otherScore = await IncidentService.getDegradationScore(otherTenantId, branchId);
    if (otherScore !== 0) throw new Error('Incident leakage across tenant context!');
    console.log('  ✓ Verified absolute tenant isolation');
  } catch (err: any) {
    console.error('  ✗ Test 6 Failed:', err.message);
    passed = false;
  }

  console.log('\n============================================================');
  if (passed) {
    console.log('ALL PHASE 5 OPERATION CHAOS TESTS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('PHASE 5 OPERATIONS TEST SUITE FAILED!');
    process.exit(1);
  }
}

void runChaosSuite();
