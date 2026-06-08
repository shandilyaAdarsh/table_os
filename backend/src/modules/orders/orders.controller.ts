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
import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

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
    const tenantId = ctx.tenant_id || req.headers['x-tenant-id'] || req.qrSession?.tenantId;
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
      userId: req.context?.id,
    });

    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 201, { order }, ctx, ctx.expected_cart_revision);
  } catch (err: any) {
    if (err instanceof AppError) {
      void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_RETRYABLE', err.message);
    } else {
      void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', 'Internal error');
    }
    next(err);
  }
}

const directOrderSchema = z.object({
  tableId: z.string().uuid(),
  items: z.array(z.object({
    menu_item_id: z.string().uuid(),
    quantity: z.number().int().positive(),
    modifiers: z.array(z.any()).optional(),
    item_notes: z.string().optional(),
  })).min(1),
  orderNotes: z.string().max(1000).optional(),
});

export async function createDirectOrder(req: any, res: Response, next: any): Promise<void> {
  const ctx = req.mutationContext!;
  try {
    const parsed = directOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
    }

    const { tableId, items, orderNotes } = parsed.data;

    // Determine context tenant_id, qr session
    const tenantId = ctx.tenant_id || req.headers['x-tenant-id'] || req.qrSession?.tenantId;
    if (!tenantId) {
      throw new AppError('Missing tenant identification header or session context.', 400, ErrorCode.BAD_REQUEST);
    }

    // QR sessions set source to 'qr_scan', staff app sets source to 'staff_pos'
    const source = req.qrSession ? 'qr_scan' : 'staff_pos';
    const branchId = req.qrSession?.branchId || req.user?.branch_id;
    if (!branchId) {
      throw new AppError('Missing branch context.', 400, ErrorCode.BAD_REQUEST);
    }

    void logMutationAudit({ ...ctx, mutation_type: 'orders.direct', status: 'IN_FLIGHT' });

    logger.info({
      stage: 'controller_entry_createDirectOrder',
      tenantId,
      branchId,
      tableId,
      sessionId: req.qrSession?.id || req.user?.id,
      items,
    });

    const order = await ordersService.createDirectOrder({
      tenantId,
      branchId,
      tableId,
      sessionId: req.qrSession?.id || req.user?.id, // Use user ID as session for staff
      items,
      idempotencyKey: ctx.idempotency_key,
      orderNotes,
      source,
      userId: req.user?.id,
    });

    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 201, { order }, ctx);
  } catch (err: any) {
    void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', err.message);
    next(err);
  }
}

export async function getOrderDetails(req: any, res: Response, next: any): Promise<void> {
  try {
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
  } catch (err) {
    next(err);
  }
}

export async function getPendingAlerts(req: any, res: Response, next: any): Promise<void> {
  try {
    const { branchId } = z.object({ branchId: z.string().uuid() }).parse(req.query);
    const tenantId = req.context?.tenant_id;
    const staffId = req.context?.id;
    if (!tenantId || !staffId) throw new AppError('Unauthorized', 401, ErrorCode.UNAUTHORIZED);

    const orders = await ordersService.getPendingOrdersForStaff(tenantId, branchId, staffId);
    res.status(200).json({ status: 'success', data: { orders } });
  } catch (err) {
    next(err);
  }
}

export async function transitionStatus(req: any, res: Response, next: any): Promise<void> {
  try {
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
  } catch (err) {
    next(err);
  }
}

export async function getAvailableStaff(req: any, res: Response, next: any): Promise<void> {
  try {
    const { branchId } = z.object({ branchId: z.string().uuid() }).parse(req.query);
    const tenantId = req.context?.tenant_id;
    if (!tenantId) throw new AppError('Unauthorized', 401, ErrorCode.UNAUTHORIZED);

    // Fetch online/active staff members in this branch (those with active presence or recent activity)
    const { data, error } = await supabaseAdmin
      .from('staff')
      .select('id, name, first_name, last_name, role')
      .eq('tenant_id', tenantId)
      .eq('branch_id', branchId)
      .eq('is_active', true);

    if (error) throw error;

    // Get active order counts per staff
    const staffIds = (data ?? []).map((s: any) => s.id);
    let orderCounts: Record<string, number> = {};

    if (staffIds.length > 0) {
      const { data: orderData } = await supabaseAdmin
        .from('orders')
        .select('tables!inner(assigned_waiter_id)')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .in('status', ['pending', 'accepted', 'preparing']);

      (orderData ?? []).forEach((o: any) => {
        const wId = o.tables?.assigned_waiter_id;
        if (wId) orderCounts[wId] = (orderCounts[wId] ?? 0) + 1;
      });
    }

    const staffList = (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.first_name ? `${s.first_name} ${s.last_name}`.trim() : s.name,
      role: s.role,
      activeOrderCount: orderCounts[s.id] ?? 0,
    }));

    res.status(200).json({ status: 'success', data: { staff: staffList } });
  } catch (err) {
    next(err);
  }
}

export async function listBranchOrders(req: any, res: Response, next: any): Promise<void> {
  try {
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
  } catch (err) {
    next(err);
  }
}

export async function acceptOrderAlert(_req: any, res: any, _next: any) {
  res.status(200).json({ success: true });
}

export async function reassignOrderAlert(_req: any, res: any, _next: any) {
  res.status(200).json({ success: true });
}
