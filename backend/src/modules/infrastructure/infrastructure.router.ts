// ============================================================
// src/modules/infrastructure/infrastructure.router.ts
// Router wiring up reliability checks, metrics, and recovery actions.
// Enforces strict tenant authentication and rate-limiting limits.
// ============================================================

import { Router } from 'express';
import { InfrastructureController } from './infrastructure.controller';
import { authenticate, managerOrAbove } from '../../middleware/auth.middleware';
import { RateLimitService } from './rate-limit.service';

const router: Router = Router({ mergeParams: true });

// ─── Health Checks (Public / Container Probes) ──────────────────
router.get('/health/live', InfrastructureController.getLiveness);
router.get('/health/ready', InfrastructureController.getReadiness);

// ─── Telemetry & Metrics (Authenticated Managers only) ──────────
router.get(
  '/metrics',
  authenticate,
  managerOrAbove,
  RateLimitService.rateLimitMiddleware('RECONCILIATION'),
  InfrastructureController.getMetrics
);

// ─── Compliance Audit Log Exports (Authenticated Managers only) ──
router.get(
  '/audit/export',
  authenticate,
  managerOrAbove,
  RateLimitService.rateLimitMiddleware('RECONCILIATION'),
  InfrastructureController.exportAuditLogs
);

// ─── Disaster Recovery Toolkits (Authenticated Managers only) ─────
router.post(
  '/recovery/dead-letter/:eventId/replay',
  authenticate,
  managerOrAbove,
  InfrastructureController.replayDeadLetter
);

router.post(
  '/recovery/projections/rebuild',
  authenticate,
  managerOrAbove,
  InfrastructureController.rebuildProjection
);

router.post(
  '/recovery/reconciliation/repair',
  authenticate,
  managerOrAbove,
  InfrastructureController.repairReconciliation
);

export { router as infrastructureRouter };
export default router;
