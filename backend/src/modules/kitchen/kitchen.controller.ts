// ============================================================
// src/modules/kitchen/kitchen.controller.ts
// Controller for KDS kitchen station operations.
// ============================================================

import type { Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as kitchenService from './kitchen.service';
import type { KitchenOrderStatus } from './kitchen.repository';

// New service imports
import { OrderItemWorkflowService } from './order-item-workflow.service';
import { OperationalReadModelService } from './operational-read-model.service';
import { RealtimeReconciliationService } from './realtime-reconciliation.service';
import { KitchenSLAService } from './kitchen-sla.service';

const routeOrderSchema = z.object({
  orderId: z.string().uuid(),
});

const transitionStatusSchema = z.object({
  targetStatus: z.enum(['pending', 'accepted', 'preparing', 'ready', 'delivered']),
  versionNum: z.number().int().positive(),
});

const listQueueQuerySchema = z.object({
  branchId: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'preparing', 'ready', 'delivered']).optional(),
  stationId: z.string().uuid().optional(),
});

export async function routeToKitchen(req: any, res: Response): Promise<void> {
  const parsed = routeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const ticket = await kitchenService.routeOrderToKitchen(tenantId, parsed.data.orderId);

  res.status(201).json({
    status: 'success',
    data: { ticket },
  });
}

export async function transitionTicketStatus(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = transitionStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const { targetStatus, versionNum } = parsed.data;

  const ticket = await kitchenService.transitionKitchenOrderStatus({
    tenantId,
    ticketId: id,
    targetStatus: targetStatus as KitchenOrderStatus,
    versionNum,
    userId: req.user?.id,
  });

  res.status(200).json({
    status: 'success',
    data: { ticket },
  });
}

export async function getTicketDetails(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const ticket = await kitchenService.getKitchenOrderTicket(tenantId, id);

  res.status(200).json({
    status: 'success',
    data: { ticket },
  });
}

export async function listKitchenQueue(req: any, res: Response): Promise<void> {
  const parsed = listQueueQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const { branchId, status, stationId } = parsed.data;

  const queue = await kitchenService.getKitchenQueue(tenantId, branchId, {
    status: status as KitchenOrderStatus,
    stationId,
  });

  res.status(200).json({
    status: 'success',
    data: { queue },
  });
}

// ─── NEW KDS RUNTIME HANDLERS ─────────────────────────────────

export async function transitionKdsItemStatus(req: any, res: Response): Promise<void> {
  const { preparationId } = req.params;
  const transitionSchema = z.object({
    branchId: z.string().uuid(),
    targetStatus: z.enum(['pending', 'preparing', 'completed', 'cancelled']),
    completedQuantity: z.number().int().nonnegative().optional(),
    versionNum: z.number().int().positive(),
  });

  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const { branchId, targetStatus, completedQuantity, versionNum } = parsed.data;

  const item = await OrderItemWorkflowService.transitionItemStatus({
    tenantId,
    branchId,
    preparationId,
    targetStatus,
    completedQuantity,
    versionNum,
    userId: req.user?.id || 'system',
  });

  // Invalidate read-model cache proactively
  OperationalReadModelService.invalidateCache(branchId);

  res.status(200).json({
    status: 'success',
    data: { item },
  });
}

export async function getFloorState(req: any, res: Response): Promise<void> {
  const schema = z.object({
    branchId: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const floor = await OperationalReadModelService.getFloorStateProjection(tenantId, parsed.data.branchId);

  res.status(200).json({
    status: 'success',
    data: { floor },
  });
}

export async function getWaiterDashboard(req: any, res: Response): Promise<void> {
  const schema = z.object({
    branchId: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const waiterDashboard = await OperationalReadModelService.getWaiterDashboardProjection(tenantId, parsed.data.branchId);

  res.status(200).json({
    status: 'success',
    data: { waiterDashboard },
  });
}

export async function getCustomerTracking(req: any, res: Response): Promise<void> {
  const { orderId } = req.params;

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const tracking = await OperationalReadModelService.getCustomerTrackingProjection(tenantId, orderId);

  res.status(200).json({
    status: 'success',
    data: { tracking },
  });
}

export async function reconcileRealtimeState(req: any, res: Response): Promise<void> {
  const schema = z.object({
    branchId: z.string().uuid(),
    lastKnownSequence: z.number().int().nonnegative(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const reconciliation = await RealtimeReconciliationService.reconcileClientState({
    tenantId,
    branchId: parsed.data.branchId,
    lastKnownSequence: parsed.data.lastKnownSequence,
  });

  res.status(200).json({
    status: 'success',
    data: { reconciliation },
  });
}

export async function evaluateQueueSLA(req: any, res: Response): Promise<void> {
  const schema = z.object({
    branchId: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const slaResults = await KitchenSLAService.evaluateActiveQueueSLA(tenantId, parsed.data.branchId);

  res.status(200).json({
    status: 'success',
    data: { slaResults },
  });
}
