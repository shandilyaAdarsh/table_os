// ============================================================
// src/modules/orders/orders.controller.ts
// Controller layer for Order checkout and status transitions.
// ============================================================

import type { Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as ordersService from './orders.service';
import type { OrderStatus } from './orders.repository';

// Input Validation Schemas
const checkoutSchema = z.object({
  cartId: z.string().uuid(),
  tableId: z.string().uuid(),
  idempotencyKey: z.string().min(1).optional(),
  orderNotes: z.string().max(1000).optional(),
});

const transitionStatusSchema = z.object({
  targetStatus: z.enum([
    'pending',
    'accepted',
    'preparing',
    'ready',
    'delivered',
    'completed',
    'cancelled',
    'sync_conflict',
  ]),
  versionNum: z.number().int().positive(),
  reason: z.string().max(500).optional(),
  cancellationReason: z.string().max(500).optional(),
});

const listOrdersQuerySchema = z.object({
  branchId: z.string().uuid(),
  status: z.enum([
    'pending',
    'accepted',
    'preparing',
    'ready',
    'delivered',
    'completed',
    'cancelled',
    'sync_conflict',
  ]).optional(),
});

export async function checkoutCart(req: any, res: Response): Promise<void> {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const { cartId, tableId, idempotencyKey, orderNotes } = parsed.data;

  // Determine context tenant_id, qr session
  const tenantId = req.headers['x-tenant-id'] as string || req.qrSession?.tenant_id || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant identification header or session context.', 400, ErrorCode.BAD_REQUEST);
  }

  // QR sessions set source to 'qr_scan'
  const source = req.qrSession ? 'qr_scan' : 'staff_pos';

  const order = await ordersService.createOrderFromCart({
    tenantId,
    cartId,
    tableId,
    sessionId: req.qrSession?.id,
    idempotencyKey,
    orderNotes,
    source,
    userId: req.user?.id,
  });

  res.status(201).json({
    status: 'success',
    data: { order },
  });
}

export async function getOrderDetails(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const tenantId = req.headers['x-tenant-id'] as string || req.qrSession?.tenant_id || req.user?.tenant_id;

  if (!tenantId) {
    throw new AppError('Missing tenant identification context.', 400, ErrorCode.BAD_REQUEST);
  }

  const order = await ordersService.getOrder(tenantId, id);

  res.status(200).json({
    status: 'success',
    data: { order },
  });
}

export async function transitionStatus(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = transitionStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant identification context.', 400, ErrorCode.BAD_REQUEST);
  }

  const { targetStatus, versionNum, reason, cancellationReason } = parsed.data;

  const additionalFields: any = {};
  if (targetStatus === 'cancelled') {
    additionalFields.cancellation_reason = cancellationReason || 'Cancelled by staff/admin';
  }

  const order = await ordersService.transitionOrderStatus({
    tenantId,
    orderId: id,
    targetStatus,
    versionNum,
    userId: req.user?.id,
    reason,
    additionalFields,
  });

  res.status(200).json({
    status: 'success',
    data: { order },
  });
}

export async function listBranchOrders(req: any, res: Response): Promise<void> {
  const parsed = listOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant identification context.', 400, ErrorCode.BAD_REQUEST);
  }

  const { branchId, status } = parsed.data;

  const orders = await ordersService.listBranchOrders(tenantId, branchId, { status: status as OrderStatus });

  res.status(200).json({
    status: 'success',
    data: { orders },
  });
}
