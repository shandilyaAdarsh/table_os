import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate, managerOrAbove } from '../../middleware/auth.middleware';
import { IncidentService } from '../projection/incident.service';
import { TelemetryBroadcaster } from '../observability/telemetry.broadcaster';

const router: Router = Router({ mergeParams: true });

// Strict Production Hard-Fail Exclusion
if (process.env.NODE_ENV === 'production') {
  router.use((_req, res) => {
    res.status(503).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Chaos testing routes are authoritatively disabled in production environments.' }
    });
  });
}

// POST /api/v1/infrastructure/chaos/sequence-gap
router.post('/sequence-gap', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const tenantId = req.context.tenantId!;
  const branchId = req.body.branch_id || (req.query.branch_id as string);

  if (!branchId) {
    res.status(400).json({ success: false, error: 'branch_id is required' });
    return;
  }

  TelemetryBroadcaster.enqueue({
    tenant_id: tenantId,
    runtime_surface: 'BACKEND_ENGINE',
    domain: 'system',
    severity: 'INFO',
          event_type: 'SIMULATION_TRIGGERED',
    metadata: { simulation: 'sequence_gap', details: req.body }
  });

  await IncidentService.logIncident({
    tenant_id: tenantId,
    branch_id: branchId,
    incident_type: 'SEQUENCE_GAP',
    severity: 'WARNING',
    message: 'SIMULATED: Sequence gap detected in operational projection engine.',
    details: { gap_start: 104, gap_end: 110 },
  });

  res.status(200).json({ success: true, message: 'Chaos event SEQUENCE_GAP injected successfully.' });
});

// POST /api/v1/infrastructure/chaos/duplicate-flood
router.post('/duplicate-flood', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const tenantId = req.context.tenantId!;
  
  TelemetryBroadcaster.enqueue({
    tenant_id: tenantId,
    runtime_surface: 'BACKEND_ENGINE',
    domain: 'system',
    severity: 'INFO',
          event_type: 'SIMULATION_TRIGGERED',
    metadata: { simulation: 'duplicate_flood', details: req.body }
  });

  res.status(200).json({ success: true, message: 'Chaos event DUPLICATE_FLOOD injected successfully.' });
});

// POST /api/v1/infrastructure/chaos/reconnect-storm
router.post('/reconnect-storm', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const tenantId = req.context.tenantId!;
  const branchId = req.body.branch_id || (req.query.branch_id as string);

  if (!branchId) {
    res.status(400).json({ success: false, error: 'branch_id is required' });
    return;
  }

  TelemetryBroadcaster.enqueue({
    tenant_id: tenantId,
    runtime_surface: 'BACKEND_ENGINE',
    domain: 'system',
    severity: 'INFO',
          event_type: 'SIMULATION_TRIGGERED',
    metadata: { simulation: 'reconnect_storm', details: req.body }
  });

  await IncidentService.logIncident({
    tenant_id: tenantId,
    branch_id: branchId,
    incident_type: 'RECONNECT_STORM',
    severity: 'CRITICAL',
    message: 'SIMULATED: Reconnect storm following simulated network partition; load threshold exceeded.',
    details: { active_connections: 120, queue_latency_ms: 1200 },
  });

  res.status(200).json({ success: true, message: 'Chaos event RECONNECT_STORM injected successfully.' });
});

// POST /api/v1/infrastructure/chaos/replay-chaos
router.post('/replay-chaos', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const tenantId = req.context.tenantId!;
  
  TelemetryBroadcaster.enqueue({
    tenant_id: tenantId,
    runtime_surface: 'BACKEND_ENGINE',
    domain: 'system',
    severity: 'INFO',
          event_type: 'SIMULATION_TRIGGERED',
    metadata: { simulation: 'replay_chaos', details: req.body }
  });

  res.status(200).json({ success: true, message: 'Chaos event REPLAY_CHAOS injected successfully.' });
});

export { router as chaosRouter };
export default router;
