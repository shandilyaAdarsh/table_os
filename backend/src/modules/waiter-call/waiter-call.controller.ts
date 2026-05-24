// ============================================================
// src/modules/waiter-call/waiter-call.controller.ts
// Express controller handling public and staff-facing waiter calls.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { CreateWaiterCallSchema, UpdateWaiterCallStatusSchema } from './waiter-call.validators';
import * as waiterCallService from './waiter-call.service';

/**
 * Handles table-scoped customer waiter assistance requests.
 */
export async function createCall(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.qrSession!;
    const dto = CreateWaiterCallSchema.parse(req.body);

    const call = await waiterCallService.createWaiterCall({
      tenantId: session.tenant_id,
      tableId: session.table_id,
      sessionId: session.id,
      dto,
    });

    res.status(201).json({ success: true, data: call });
  } catch (err) {
    next(err);
  }
}

/**
 * Staff endpoint to acknowledge or resolve an active waiter call under OCC.
 */
export async function transitionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context!.tenantId!;
    const callId = req.params.id as string;
    const userId = req.context!.userId;
    const dto = UpdateWaiterCallStatusSchema.parse(req.body);

    const updatedCall = await waiterCallService.transitionCallStatus({
      tenantId,
      callId,
      dto,
      userId,
    });

    res.status(200).json({ success: true, data: updatedCall });
  } catch (err) {
    next(err);
  }
}

/**
 * Staff endpoint to retrieve active waiter calls for a branch.
 */
export async function listCalls(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context!.tenantId!;
    const branchId = req.query.branch_id as string;
    const status = req.query.status as any;

    const calls = await waiterCallService.listBranchWaiterCalls(tenantId, branchId, { status });

    res.status(200).json({ success: true, data: calls });
  } catch (err) {
    next(err);
  }
}
