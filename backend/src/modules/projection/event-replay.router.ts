import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { EventLedgerService } from './event-ledger.service';
import { TelemetryBroadcaster } from '../observability/telemetry.broadcaster';

const router: Router = Router({ mergeParams: true });

// GET /api/v1/runtime/events/replay
router.get('/replay', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;
    const fromSequence = req.query.from_seq ? Number(req.query.from_seq) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const events = await EventLedgerService.getEventsForReplay({
      tenantId,
      branchId,
      fromSequence,
      limit,
    });

    res.status(200).json({
      success: true,
      from_sequence: fromSequence,
      count: events.length,
      data: events,
    });

    TelemetryBroadcaster.enqueue({
      tenant_id: tenantId,
      runtime_surface: 'BACKEND_ENGINE',
      domain: 'system',
      severity: 'INFO',
          event_type: 'REPLAY_COMPLETED',
      metadata: { from_sequence: fromSequence, returned_count: events.length }
    });
  } catch (err) { next(err); }
});

// GET /api/v1/runtime/events/range
router.get('/range', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const startSeq = Number(req.query.start || 1);
    const endSeq = Number(req.query.end || startSeq + 49);

    const limit = Math.max(1, endSeq - startSeq + 1);

    const events = await EventLedgerService.getEventsForReplay({
      tenantId,
      fromSequence: startSeq,
      limit,
    });

    res.status(200).json({
      success: true,
      start_sequence: startSeq,
      end_sequence: endSeq,
      data: events,
    });

    if (events.length < limit) {
      TelemetryBroadcaster.enqueue({
        tenant_id: tenantId,
        runtime_surface: 'BACKEND_ENGINE',
        domain: 'system',
        severity: 'INFO',
          event_type: 'REPLAY_GAP_DETECTED',
        metadata: { expected: limit, returned: events.length, startSeq, endSeq }
      });
    }

  } catch (err) { next(err); }
});

// GET /api/v1/runtime/events/checkpoint
router.get('/checkpoint', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.context.tenantId!;
    const branchId = req.query.branch_id as string;

    const events = await EventLedgerService.getEventsForReplay({
      tenantId,
      branchId,
      limit: 1,
    });

    res.status(200).json({
      success: true,
      checkpoint_sequence: events.length > 0 ? events[0].global_sequence : 0,
      active_epoch: 'epoch_default_production',
      synchronized: true,
    });
  } catch (err) { next(err); }
});

export { router as eventReplayRouter };
export default router;
