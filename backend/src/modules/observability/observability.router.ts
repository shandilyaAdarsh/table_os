// ============================================================
// src/modules/observability/observability.router.ts
// Deterministic runtime observability endpoints.
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, internalEngineeringOrAbove } from '../../middleware/auth.middleware';
import { RuntimeMetricsAggregator } from './runtime-metrics.aggregator';
import { RuntimeCertificationRunner } from './runtime-certification';
import { CorrelationGraphIndexer } from './correlation-graph.indexer';
import { RuntimeSafetyController, SafetyDirectiveType } from './runtime-safety.controller';
import { RuntimeIncidentRegistry } from './runtime-incident.registry';

const router: Router = Router({ mergeParams: true });

// Strict Production Hard-Fail Exclusion for detailed telemetry (unless overridden)
// Note: In a real system, you might allow restricted admin access in prod.
// For now, we follow the "DEV ONLY" constraint heavily requested by the architecture.
if (process.env.NODE_ENV === 'production') {
  router.use((_req, res) => {
    res.status(503).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Observability endpoints are restricted in production.' }
    });
  });
}

// GET /api/v1/runtime/observability/snapshot
router.get('/snapshot', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    // Retrieve deterministic in-memory snapshot aggregated from events
    const snapshot = RuntimeMetricsAggregator.getSnapshot(tenantId);

    res.status(200).json({
      success: true,
      data: snapshot
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/observability/events
router.get('/events', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    // Retrieve deterministic in-memory event buffer
    const events = RuntimeMetricsAggregator.getEvents(tenantId);

    res.status(200).json({
      success: true,
      data: events
    });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/observability/certify
router.post('/certify', authenticate, internalEngineeringOrAbove, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await RuntimeCertificationRunner.runAll();
    res.status(200).json({
      success: true,
      data: results
    });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/observability/certify/:scenarioId
router.post('/certify/:scenarioId', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scenarioId = String(req.params.scenarioId);
    const result = await RuntimeCertificationRunner.runScenario(scenarioId);
    
    if (!result) {
      res.status(404).json({ success: false, error: 'Scenario not found' });
    return;
    }

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/observability/replay/:runId/window
router.get('/replay/:runId/window', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = String(req.params.runId);
    const startIndex = parseInt(req.query.start_index as string || '0', 10);
    const endIndex = parseInt(req.query.end_index as string || '50', 10);
    const direction = (req.query.direction as string) === 'desc' ? 'desc' : 'asc';
    
    const paginated = RuntimeCertificationRunner.getPaginatedTrace(runId, startIndex, endIndex, direction);
    
    res.status(200).json({
      success: true,
      data: paginated
    });
  } catch (err) { next(err); }
});

// ==========================================
// GRAPH TRAVERSAL ENDPOINTS
// ==========================================

// GET /api/v1/runtime/observability/graph/node/:correlationId
router.get('/graph/node/:correlationId', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const correlationId = String(req.params.correlationId);
    
    const node = CorrelationGraphIndexer.getNode(tenantId, correlationId);
    if (!node) {
      res.status(404).json({ success: false, error: 'Node not found' });
      return;
    }
    
    res.status(200).json({ success: true, data: node });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/observability/graph/children/:correlationId
router.get('/graph/children/:correlationId', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const correlationId = String(req.params.correlationId);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const cursor = parseInt(req.query.cursor as string || '0', 10);
    
    const result = CorrelationGraphIndexer.fetchChildren(tenantId, correlationId, limit, cursor);
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ==========================================
// SAFETY CONTROL ENDPOINTS
// ==========================================

// GET /api/v1/runtime/observability/safety/directives
router.get('/safety/directives', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const directives = RuntimeSafetyController.getActiveDirectives(tenantId);
    res.status(200).json({ success: true, data: directives });
  } catch (err) { next(err); }
});

// POST /api/v1/runtime/observability/safety/directives
router.post('/safety/directives', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const { type, ttlMinutes, justification, incident_id, metadata } = req.body;
    
    // Check environment bounds
    if (type === 'THROTTLE_REPLAY' && process.env.ALLOW_RUNTIME_THROTTLING !== 'true') {
      res.status(403).json({ success: false, error: 'Throttling is not allowed by environment bounds.' });
      return;
    }
    
    const directive = RuntimeSafetyController.issueDirective(
      tenantId,
      type as SafetyDirectiveType,
      ttlMinutes || 60,
      req.context.userId || 'system',
      justification || 'No justification provided',
      incident_id,
      metadata
    );
    
    res.status(200).json({ success: true, data: directive });
  } catch (err) { next(err); }
});

// DELETE /api/v1/runtime/observability/safety/directives/:type
router.delete('/safety/directives/:type', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const type = req.params.type as SafetyDirectiveType;
    const { justification } = req.body;
    
    RuntimeSafetyController.revokeDirective(tenantId, type, req.context.userId || 'system', justification || 'Manual revocation');
    res.status(200).json({ success: true, message: 'Directive revoked' });
  } catch (err) { next(err); }
});

// ==========================================
// INCIDENT ENDPOINTS
// ==========================================

// GET /api/v1/runtime/observability/incidents
router.get('/incidents', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const incidents = RuntimeIncidentRegistry.getIncidentsByTenant(tenantId);
    res.status(200).json({ success: true, data: incidents });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/observability/incidents/:id
router.get('/incidents/:id', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = RuntimeIncidentRegistry.getIncident(req.params.id);
    if (!incident || incident.tenant_id !== req.context.tenantId) {
      res.status(404).json({ success: false, error: 'Incident not found' });
      return;
    }
    res.status(200).json({ success: true, data: incident });
  } catch (err) { next(err); }
});

// PATCH /api/v1/runtime/observability/incidents/:id/state
router.patch('/incidents/:id/state', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { state, note } = req.body;
    const incident = RuntimeIncidentRegistry.updateIncidentState(
      req.params.id, 
      state, 
      req.context.userId,
      note
    );
    res.status(200).json({ success: true, data: incident });
  } catch (err) { next(err); }
});

// PATCH /api/v1/runtime/observability/incidents/:id/escalation
router.patch('/incidents/:id/escalation', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { escalation_level, note } = req.body;
    const incident = RuntimeIncidentRegistry.getIncident(req.params.id);
    if (!incident || incident.tenant_id !== req.context.tenantId) {
      res.status(404).json({ success: false, error: 'Incident not found' });
      return;
    }
    incident.escalation_level = escalation_level;
    incident.updated_at = new Date().toISOString();
    if (note) incident.mitigation_notes.push(`[ESCALATION:${escalation_level}] ${note}`);
    res.status(200).json({ success: true, data: incident });
  } catch (err) { next(err); }
});

// PATCH /api/v1/runtime/observability/incidents/:id/owner
router.patch('/incidents/:id/owner', authenticate, internalEngineeringOrAbove, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { owner } = req.body;
    const incident = RuntimeIncidentRegistry.getIncident(req.params.id);
    if (!incident || incident.tenant_id !== req.context.tenantId) {
      res.status(404).json({ success: false, error: 'Incident not found' });
      return;
    }
    incident.owned_by = owner;
    incident.assigned_engineer = owner;
    incident.updated_at = new Date().toISOString();
    res.status(200).json({ success: true, data: incident });
  } catch (err) { next(err); }
});

export { router as observabilityRouter };
export default router;
