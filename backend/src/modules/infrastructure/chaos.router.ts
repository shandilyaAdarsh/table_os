import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate, managerOrAbove } from '../../middleware/auth.middleware';
import { IncidentService } from '../projection/incident.service';

const router: Router = Router({ mergeParams: true });

// POST /api/v1/infrastructure/chaos/gap
router.post('/gap', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const tenantId = req.context.tenantId!;
  const branchId = req.body.branch_id || (req.query.branch_id as string);

  if (!branchId) {
    res.status(400).json({ success: false, error: 'branch_id is required' });
    return;
  }

  await IncidentService.logIncident({
    tenant_id: tenantId,
    branch_id: branchId,
    incident_type: 'SEQUENCE_GAP',
    severity: 'WARNING',
    message: 'SIMULATED: Sequence gap detected in operational projection engine during delta replay.',
    details: { gap_start: 104, gap_end: 110 },
  });

  res.status(200).json({ success: true, message: 'Chaos event SEQUENCE_GAP injected successfully.' });
});

// POST /api/v1/infrastructure/chaos/drift
router.post('/drift', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const tenantId = req.context.tenantId!;
  const branchId = req.body.branch_id || (req.query.branch_id as string);

  if (!branchId) {
    res.status(400).json({ success: false, error: 'branch_id is required' });
    return;
  }

  await IncidentService.logIncident({
    tenant_id: tenantId,
    branch_id: branchId,
    incident_type: 'CHECKSUM_DRIFT',
    severity: 'CRITICAL',
    message: 'SIMULATED: Integrity checksum drift detected between local projection store and backend projection metadata.',
    details: { expected_hash: 'sha256-a1b2c3d4', actual_hash: 'sha256-e5f6g7h8' },
  });

  res.status(200).json({ success: true, message: 'Chaos event CHECKSUM_DRIFT injected successfully.' });
});

// POST /api/v1/infrastructure/chaos/partition
router.post('/partition', authenticate, managerOrAbove, async (req: Request, res: Response) => {
  const tenantId = req.context.tenantId!;
  const branchId = req.body.branch_id || (req.query.branch_id as string);

  if (!branchId) {
    res.status(400).json({ success: false, error: 'branch_id is required' });
    return;
  }

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

export { router as chaosRouter };
export default router;
