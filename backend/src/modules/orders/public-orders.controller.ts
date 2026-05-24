// ============================================================
// src/modules/orders/public-orders.controller.ts
// Controller handling customer public checkout and status operations.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { PublicCheckoutSchema } from './public-orders.validators';
import * as publicOrdersService from './public-orders.service';
import { getOrder } from './orders.service';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

/**
 * Handles public customer order placement.
 */
export async function checkoutPublicOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.qrSession!;
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const dto = PublicCheckoutSchema.parse(req.body);

    const order = await publicOrdersService.createPublicOrder({
      tenantId: session.tenant_id,
      tableId: session.table_id,
      sessionId: session.id,
      branchId: session.branch_id,
      idempotencyKey,
      input: dto,
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

/**
 * Exposes order tracking status to public customers.
 */
export async function getPublicOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.qrSession!;
    const orderId = req.params.id as string;

    const order = await getOrder(session.tenant_id, orderId);

    // Strict security constraint: Customer can only poll status of orders placed on their active table session
    if (order.table_id !== session.table_id) {
      throw new AppError(
        'Access denied: You can only track orders placed at your active table.',
        403,
        ErrorCode.FORBIDDEN
      );
    }

    res.status(200).json({
      success: true,
      data: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
}
