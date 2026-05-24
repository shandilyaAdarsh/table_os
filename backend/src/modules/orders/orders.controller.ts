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

import { logMutationAudit, updateMutationAuditStatus } from '../idempotency/mutation-audit.repository';

// Input Validation Schemas
const checkoutSchema = z.object({
  cartId: z.string().uuid(),
  tableId: z.string().uuid(),
  orderNotes: z.string().max(1000).optional(),
});

function formatMutationResponse(res: Response, status: number, data: any, ctx: any, serverCartRevision?: number) {
  res.status(status).json({
    success: true,
    data,
    mutation_ack: {
      mutation_id: ctx.mutation_id,
      acknowledged_at: new Date().toISOString(),
      // Checkouts lock the cart, effectively making the revision irrelevant or finalized, but we pass it anyway if needed.
      server_cart_revision: serverCartRevision ?? ctx.expected_cart_revision,
    }
  });
}

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

export async function checkoutCart(req: any, res: Response, next: any): Promise<void> {
  const ctx = req.mutationContext!;
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
    }

    const { cartId, tableId, orderNotes } = parsed.data;

    // Determine context tenant_id, qr session
    const tenantId = ctx.tenant_id;
    if (!tenantId) {
      throw new AppError('Missing tenant identification header or session context.', 400, ErrorCode.BAD_REQUEST);
    }

    void logMutationAudit({ ...ctx, mutation_type: 'orders.checkout', status: 'IN_FLIGHT' });

    // QR sessions set source to 'qr_scan'
    const source = req.qrSession ? 'qr_scan' : 'staff_pos';

    const order = await ordersService.createOrderFromCart({
      tenantId,
      cartId,
      tableId,
      sessionId: req.qrSession?.id,
      idempotencyKey: ctx.idempotency_key,
      expectedCartRevision: ctx.expected_cart_revision,
      orderNotes,
      source,
      userId: req.user?.id,
    });

    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 201, { order }, ctx, order.cart_version);
  } catch (err: any) {
    void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', err.message);
    next(err);
  }
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
