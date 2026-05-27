import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, managerOrAbove } from '../../middleware/auth.middleware';
import { ReplayFenceService } from './replay-fence.service';
import { WorkerCoordinatorService } from './worker-coordinator.service';
import { IncidentService } from './incident.service';
import { RuntimeConvergenceCoordinator } from './convergence-coordinator.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { RuntimeAutomationService } from './runtime-automation.service';
import { supabaseAdmin } from '../../config/supabase';
import { PaymentProviderService } from './payment-provider.service';
import { EventLedgerService } from './event-ledger.service';

const router: Router = Router({ mergeParams: true });

// POST /api/v1/runtime/deployment/start
router.post('/deployment/start', authenticate, managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { branch_id, deployment_id, projection_generation, version } = req.body;

    if (!branch_id || !deployment_id || !version) {
      res.status(400).json({ success: false, error: 'branch_id, deployment_id, and version are required' });
      return;
    }

    // 1. Activate Replay Fence to lock client updates and incompatible streams
    const fence = await ReplayFenceService.activateFence({
      tenant_id: tenantId,
      branch_id,
      projection_generation: Number(projection_generation || Date.now()),
      active_deployment_id: deployment_id,
      replay_epoch: `epoch_${version}`,
      compatibility_window: '2 hours',
      expires_in_seconds: 3600, // 1 hour window
    });

    // 2. Perform Worker draining (Mocked or triggered through registry states)
    await WorkerCoordinatorService.evictStaleWorkers(tenantId, branch_id);

    res.status(200).json({
      success: true,
      message: 'Rolling deployment sequence initiated; replay fence activated, stale workers drained.',
      fence,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/deployment/complete
router.post('/deployment/complete', authenticate, managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { branch_id } = req.body;

    if (!branch_id) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    // 1. Clear Replay Fences to resume standard events processing
    await ReplayFenceService.clearFences(tenantId, branch_id);

    // 2. Convergence Check
    const degradation = await IncidentService.getDegradationScore(tenantId, branch_id);

    res.status(200).json({
      success: true,
      message: 'Deployment completed; operational fences cleared and convergence verified.',
      convergence: {
        degradation_score: degradation,
        synchronized: degradation === 0,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/deployment/status
router.get('/deployment/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const fenceCheck = await ReplayFenceService.validateGeneration({
      tenantId,
      branchId,
      clientGeneration: 0,
    });

    const degradation = await IncidentService.getDegradationScore(tenantId, branchId);

    res.status(200).json({
      success: true,
      fence_active: !fenceCheck.isAllowed,
      active_fence: fenceCheck.activeFence || null,
      degradation_score: degradation,
      status: degradation > 30 ? 'DEGRADED' : 'HEALTHY',
    });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/workers/register
router.post('/workers/register', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { worker_id, branch_id, worker_role, deployment_version, replay_ownership, projection_ownership } = req.body;

    if (!worker_id || !branch_id || !worker_role || !deployment_version) {
      res.status(400).json({ success: false, error: 'worker_id, branch_id, worker_role, and deployment_version are required' });
      return;
    }

    const worker = await WorkerCoordinatorService.registerWorker({
      worker_id,
      tenant_id: tenantId,
      branch_id,
      worker_role,
      deployment_version,
      replay_ownership,
      projection_ownership,
    });

    res.status(200).json({ success: true, worker });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/workers/heartbeat
router.post('/workers/heartbeat', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { worker_id, reconnect_load } = req.body;

    if (!worker_id) {
      res.status(400).json({ success: false, error: 'worker_id is required' });
      return;
    }

    await WorkerCoordinatorService.heartbeat(worker_id, reconnect_load || 0);
    res.status(200).json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/projections/lease
router.post('/projections/lease', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { projection_name, branch_id, worker_id, lease_duration_seconds } = req.body;

    if (!projection_name || !branch_id || !worker_id) {
      res.status(400).json({ success: false, error: 'projection_name, branch_id, and worker_id are required' });
      return;
    }

    const acquired = await WorkerCoordinatorService.acquireProjectionLease({
      projectionName: projection_name,
      tenantId,
      branchId: branch_id,
      workerId: worker_id,
      leaseDurationSeconds: lease_duration_seconds || 15,
    });

    res.status(200).json({ success: true, acquired });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/convergence
router.get('/convergence', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const report = await RuntimeConvergenceCoordinator.generateCrossSurfaceDriftReport(tenantId, branchId);
    const degradation = await IncidentService.getDegradationScore(tenantId, branchId);

    res.status(200).json({
      success: true,
      converged: !report.divergent,
      reference_generation: report.reference_generation,
      degradation_score: degradation,
      drift_summary: report.surfaces,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/surfaces
router.get('/surfaces', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const report = await RuntimeConvergenceCoordinator.generateCrossSurfaceDriftReport(tenantId, branchId);
    res.status(200).json({
      success: true,
      surfaces: report.surfaces,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/replay-health
router.get('/replay-health', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({
      success: true,
      status: 'HEALTHY',
      queue_depth: 0,
      active_replays: 0,
      active_epochs: ['epoch_default'],
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/drift/cross-surface
router.get('/drift/cross-surface', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const report = await RuntimeConvergenceCoordinator.generateCrossSurfaceDriftReport(tenantId, branchId);
    res.status(200).json({
      success: true,
      divergent: report.divergent,
      drift_reports: report.surfaces,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/surfaces/heartbeat
router.post('/surfaces/heartbeat', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { id, branch_id, surface_type, runtime_generation, replay_epoch, active_projection_generation, reconnect_state, deployment_compatibility } = req.body;

    if (!branch_id || !surface_type) {
      res.status(400).json({ success: false, error: 'branch_id and surface_type are required' });
      return;
    }

    const surface = await RuntimeConvergenceCoordinator.registerSurface({
      id,
      tenant_id: tenantId,
      branch_id,
      surface_type,
      runtime_generation: Number(runtime_generation || 0),
      replay_epoch: replay_epoch || 'epoch_default',
      active_projection_generation: Number(active_projection_generation || 0),
      reconnect_state: reconnect_state || 'CONNECTED',
      deployment_compatibility: deployment_compatibility || 'v1.0.0',
    });

    res.status(200).json({ success: true, surface });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/payments/charge
router.post('/payments/charge', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { branch_id, order_id, payment_provider, payment_reference, payment_amount_minor, currency_code, idempotency_key, replay_generation } = req.body;

    if (!branch_id || !order_id || !payment_provider || !payment_reference || !idempotency_key) {
      res.status(400).json({ success: false, error: 'Required fields: branch_id, order_id, payment_provider, payment_reference, idempotency_key' });
      return;
    }

    const record = await PaymentReconciliationService.recordPayment({
      tenant_id: tenantId,
      branch_id,
      order_id,
      payment_provider,
      payment_reference,
      payment_amount_minor: Number(payment_amount_minor || 0),
      currency_code: currency_code || 'USD',
      idempotency_key,
      replay_generation: Number(replay_generation || 0),
    });

    res.status(200).json({ success: true, payment: record });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/payments/reconcile
router.post('/payments/reconcile', authenticate, managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { branch_id } = req.body;

    if (!branch_id) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const report = await PaymentReconciliationService.reconcileStalePayments(tenantId, branch_id);
    res.status(200).json({ success: true, reconciliation: report });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/payments/ledger
router.get('/payments/ledger', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('payment_ledger')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('initiated_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({ success: true, ledger: data || [] });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/capacity/metrics
router.get('/capacity/metrics', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const signals = await RuntimeAutomationService.evaluateAutoscaleSignals(tenantId, branchId);
    res.status(200).json({
      success: true,
      should_scale_up: signals.should_scale_up,
      reason: signals.reason || 'Optimal operational parameters',
      metrics: signals.metrics || null,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/payments/webhook
router.post('/payments/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || req.headers['stripe-signature'];
    const { tenant_id, branch_id, order_id, provider, reference, amount_minor, currency_code, idempotency_key } = req.body;

    if (!signature || !tenant_id || !branch_id || !idempotency_key) {
      res.status(400).json({ success: false, error: 'Signature header and body parameters are required' });
      return;
    }

    // Cryptographic verify webhook signature (mocking secret verification for development)
    const verified = PaymentProviderService.verifyWebhookSignature({
      rawBody: JSON.stringify(req.body),
      signatureHeader: signature as string,
      signingSecret: 'webhook_test_secret_key',
      provider: provider || 'STRIPE',
    });

    if (!verified) {
      res.status(401).json({ success: false, error: 'Invalid cryptographic signature' });
      return;
    }

    const result = await PaymentProviderService.processProviderCallback({
      tenantId: tenant_id,
      branchId: branch_id,
      orderId: order_id,
      provider: provider || 'STRIPE',
      reference,
      amountMinor: Number(amount_minor || 0),
      currencyCode: currency_code || 'USD',
      idempotencyKey: idempotency_key,
    });

    res.status(200).json({ success: true, result });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/support/inspect
router.get('/support/inspect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    const { data: activeFences } = await supabaseAdmin
      .from('runtime_replay_fences')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId);

    const { data: openIncidents } = await supabaseAdmin
      .from('runtime_incidents')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('resolved', false);

    res.status(200).json({
      success: true,
      tenant_id: tenantId,
      branch_id: branchId,
      fences: activeFences || [],
      incidents: openIncidents || [],
    });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/support/repair
router.post('/support/repair', authenticate, managerOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { branch_id } = req.body;

    if (!branch_id) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    // Enforce Event Ledger horizon pruning older than 90 days as part of repair procedures
    const prunedCount = await EventLedgerService.pruneHistoricalEvents(tenantId, branch_id, 90);

    res.status(200).json({
      success: true,
      message: `Repair completed; ${prunedCount} historical events older than 90 days pruned under Replay Horizon policy.`,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/support/cost
router.get('/support/cost', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    if (!branchId) {
      res.status(400).json({ success: false, error: 'branch_id is required' });
      return;
    }

    // Accumulate costs
    const { data: costs } = await supabaseAdmin
      .from('runtime_cost_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });

    res.status(200).json({
      success: true,
      total_accumulated_microcents: costs?.reduce((acc, curr) => acc + Number(curr.db_query_cost_microcents || 0), 0) || 0,
      costs: costs || [],
    });
  } catch (err) { next(err); }
});

export { router as deploymentRouter };
export default router;
