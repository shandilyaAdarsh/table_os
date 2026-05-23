// ============================================================
// src/modules/infrastructure/infrastructure.controller.ts
// Administrative, telemetry, health, and operational recovery controller.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { HealthcheckService } from './healthcheck.service';
import { MetricsService } from './metrics.service';
import { AuditRuntimeService } from './audit-runtime.service';
import { RecoveryToolkitService } from './recovery-toolkit.service';

export const InfrastructureController = {
  /**
   * GET /health/live
   * Lightweight container liveness check.
   */
  getLiveness(_req: Request, res: Response): void {
    const report = HealthcheckService.getLivenessReport();
    res.status(200).json({ success: true, ...report });
  },

  /**
   * GET /health/ready
   * Deep readiness check covering all dependencies.
   */
  async getReadiness(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await HealthcheckService.getReadinessReport();
      const statusCode = report.status === 'UP' ? 200 : report.status === 'DEGRADED' ? 200 : 503;
      res.status(statusCode).json({ success: report.status !== 'DOWN', ...report });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /telemetry/metrics
   * Expose system and branch-level metrics overview.
   */
  async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.context?.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    try {
      const branchId = (req.query.branchId as string) || undefined;
      const hours = req.query.hours ? Number(req.query.hours) : 24;
      const summary = await MetricsService.getMetricsSummary(tenantId, branchId, hours);
      res.status(200).json({ success: true, metrics: summary });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /audit/export
   * Secure, date-bounded compliance audit logs export.
   */
  async exportAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.context?.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    try {
      const startDate = (req.query.startDate as string) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = (req.query.endDate as string) || new Date().toISOString();
      const limit = req.query.limit ? Number(req.query.limit) : 1000;

      const logs = await AuditRuntimeService.exportTenantAuditTrail(tenantId, startDate, endDate, limit);

      // Record that an audit trail export action occurred
      await AuditRuntimeService.recordAudit({
        tenantId,
        branchId: null,
        action: 'AUDIT_LOG_EXPORTED',
        payload: { startDate, endDate, recordsCount: logs.length },
        actorId: req.context?.userId,
        actorType: 'staff'
      });

      res.status(200).json({ success: true, count: logs.length, logs });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /recovery/dead-letter/:eventId/replay
   * Manually replay a poisoned DLQ outbox event.
   */
  async replayDeadLetter(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.context?.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    try {
      const eventId = req.params.eventId;
      const triggeredBy = req.context?.userId || 'system-admin';

      const success = await RecoveryToolkitService.replayDeadLetterEvent(tenantId, eventId as string, triggeredBy as string);
      if (success) {
        res.status(200).json({ success: true, message: `Successfully replayed event ${eventId}` });
      } else {
        res.status(500).json({ success: false, error: 'Replay process failed. Consult observability logs.' });
      }
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /recovery/projections/rebuild
   * Rebuild aggregate read models from immutable event streams.
   */
  async rebuildProjection(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.context?.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    try {
      const branchId = req.body.branchId;
      const projectionType = req.body.projectionType; // 'billing' | 'kds'
      const triggeredBy = req.context?.userId || 'system-admin';

      if (!branchId || !projectionType) {
        res.status(400).json({ success: false, error: 'Missing branchId or projectionType parameters' });
        return;
      }

      const jobId = await RecoveryToolkitService.rebuildProjections(tenantId, branchId, projectionType, triggeredBy);
      res.status(200).json({ success: true, jobId, message: `Projection rebuild job initialized for ${projectionType}` });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /recovery/reconciliation/repair
   * Automated alignment of out-of-sync split balances or checkout states.
   */
  async repairReconciliation(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = req.context?.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, error: 'Tenant context required' });
      return;
    }

    try {
      const branchId = req.body.branchId;
      const triggeredBy = req.context?.userId || 'system-admin';

      if (!branchId) {
        res.status(400).json({ success: false, error: 'Missing branchId parameter' });
        return;
      }

      const jobId = await RecoveryToolkitService.repairReconciliationDrift(tenantId, branchId, triggeredBy);
      res.status(200).json({ success: true, jobId, message: 'Reconciliation repair job initialized successfully' });
    } catch (err) {
      next(err);
    }
  }
};
export default InfrastructureController;
