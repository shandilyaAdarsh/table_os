// ============================================================
// src/modules/maintenance/maintenance.router.ts
// Router for administrative lifecycle maintenance, queue,
// and transactional reconciliation tasks.
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { cleanupStaleCarts, cleanupExpiredQRSessions } from './maintenance.service';
import {
  reconcileStuckPaidOrders,
  reconcileStuckKitchenTickets,
  reconcileAbandonedCheckouts,
  reconcileStaleIdempotencyLocks
} from './reconciliation.service';
import {
  reclaimAbandonedLocks,
  repairDeadLetterEvent
} from './worker.service';
import { OutboxProcessor } from './outbox-processor';
import {
  simulateEventReplay,
  executeLiveEventReplay
} from './replay.service';
import {
  getPartitionLag,
  scanAllPartitionsHealth
} from './lag-tracker.service';
import { getCircuitBreaker } from './circuit-breaker.service';

const router: Router = Router({ mergeParams: true });

/**
 * POST /cleanup/carts
 * Triggers bulk abandonment of stale open carts
 */
router.post('/cleanup/carts', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const tenantId = req.context?.tenantId;
  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant context is missing.' });
    return;
  }

  try {
    const ageMinutes = req.body.ageMinutes ? Number(req.body.ageMinutes) : 60;
    const count = await cleanupStaleCarts(tenantId, ageMinutes);
    res.status(200).json({
      success: true,
      message: `Successfully cleaned up stale carts.`,
      transitioned_count: count,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /cleanup/sessions
 * Triggers expiration transition for expired QR sessions
 */
router.post('/cleanup/sessions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const tenantId = req.context?.tenantId;
  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant context is missing.' });
    return;
  }

  try {
    const count = await cleanupExpiredQRSessions(tenantId);
    res.status(200).json({
      success: true,
      message: `Successfully transitioned expired QR sessions.`,
      transitioned_count: count,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /reconcile
 * Triggers all active transactional reconciliation workers
 */
router.post('/reconcile', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const tenantId = req.context?.tenantId;
  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant context is missing.' });
    return;
  }

  try {
    const paidOrdersCount = await reconcileStuckPaidOrders(tenantId);
    const kitchenTicketsCount = await reconcileStuckKitchenTickets(tenantId);
    const lockedCartsCount = await reconcileAbandonedCheckouts(tenantId);
    const staleLocksCount = await reconcileStaleIdempotencyLocks(tenantId);

    res.status(200).json({
      success: true,
      message: 'Transactional reconciliation tasks completed successfully.',
      metrics: {
        reconciled_paid_orders: paidOrdersCount,
        reconciled_kitchen_tickets: kitchenTicketsCount,
        reclaimed_abandoned_carts: lockedCartsCount,
        recovered_stale_idempotency_locks: staleLocksCount
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /worker/process
 * Triggers batch outbox queue processing sweep
 */
router.post('/worker/process', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const workerName = (req.body.workerName as string) ?? 'DefaultOutboxWorker';
    const limit = req.body.limit ? Number(req.body.limit) : 50;
    
    const processedCount = await OutboxProcessor.processPendingEvents(workerName, limit);
    
    res.status(200).json({
      success: true,
      message: 'Outbox processing run completed successfully.',
      processed_events_count: processedCount
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /worker/reclaim
 * Triggers recovery of crashed worker execution locks
 */
router.post('/worker/reclaim', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reclaimedCount = await reclaimAbandonedLocks();
    res.status(200).json({
      success: true,
      message: 'Worker lock reclamation job completed.',
      reclaimed_locks_count: reclaimedCount
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /dlq/:eventId/retry
 * Replays a failed/poison event from the Dead Letter Queue
 */
router.post('/dlq/:eventId/retry', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const tenantId = req.context?.tenantId;
  if (!tenantId) {
    res.status(400).json({ success: false, error: 'Tenant context is missing.' });
    return;
  }

  try {
    const eventId = req.params.eventId as string;
    const success = await repairDeadLetterEvent(eventId, tenantId);
    res.status(200).json({
      success,
      message: `Successfully replayed event ${eventId} from Dead Letter Queue.`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /replay/:eventId/dry-run
 * Performs safety validation and state difference simulation (no DB side-effects)
 */
router.post('/replay/:eventId/dry-run', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const eventId = req.params.eventId as string;
    const trigger = (req.body.triggeredBy as string) ?? 'AdminPanel';
    const reason = (req.body.reason as string) ?? 'Dry-run validation analysis';
    
    const report = await simulateEventReplay({
      eventId,
      triggeredBy: trigger,
      replayReason: reason
    });

    res.status(200).json({
      success: true,
      report
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /replay/:eventId/live
 * Triggers real outbox delivery pipeline re-run for a specific event
 */
router.post('/replay/:eventId/live', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const eventId = req.params.eventId as string;
    const trigger = (req.body.triggeredBy as string) ?? 'AdminPanel';
    const reason = (req.body.reason as string) ?? 'Manual administrative live replay';

    const report = await executeLiveEventReplay({
      eventId,
      triggeredBy: trigger,
      replayReason: reason
    });

    res.status(200).json({
      success: true,
      report
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /queue/health
 * Returns status analysis, lags, oldest events across active queue partitions
 */
router.get('/queue/health', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const healthSummaries = await scanAllPartitionsHealth();
    res.status(200).json({
      success: true,
      partitions: healthSummaries
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /queue/:partitionKey/lag
 * Returns oldest event lag metrics for a targeted partition key
 */
router.get('/queue/:partitionKey/lag', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const partitionKey = req.params.partitionKey as string;
    const report = await getPartitionLag(partitionKey);
    res.status(200).json({
      success: true,
      report
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /circuit/:name/reset
 * Resets a circuit breaker state back to CLOSED
 */
router.post('/circuit/:name/reset', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const name = req.params.name as string;
    const breaker = getCircuitBreaker(name);
    breaker.reset();

    res.status(200).json({
      success: true,
      message: `Successfully reset circuit breaker '${name}' to CLOSED state.`
    });
  } catch (err) {
    next(err);
  }
});

export { router as maintenanceRouter };
