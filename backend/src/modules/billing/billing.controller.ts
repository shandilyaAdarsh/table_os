// ============================================================
// src/modules/billing/billing.controller.ts
// Express controller validating DTO inputs and coordinating
// billing, settlement, splits, and projections calls.
// ============================================================

import type { Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { getBillById } from './billing.repository';
import {
  BillAggregationService,
  PaymentIntentService,
  SettlementLifecycleService,
  SplitBillService,
  RefundService,
  FinancialProjectionService,
} from './billing.service';

// --- Zod Input Validation Schemas ---

const aggregateBillSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1),
  tableId: z.string().uuid().nullable(),
  sessionId: z.string().uuid().nullable(),
});

const createIntentSchema = z.object({
  billId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  paymentMethod: z.enum(['cash', 'card', 'qr_pay', 'wallet', 'split', 'other']),
  idempotencyKey: z.string().min(1),
});

const settleIntentSchema = z.object({
  gatewayRef: z.string().optional().nullable(),
  gatewayPayload: z.any().optional().nullable(),
});

const settleBillSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'qr_pay', 'wallet', 'split', 'other']),
  amountMinor: z.number().int().positive(),
  gatewayRef: z.string().optional().nullable(),
  gatewayPayload: z.any().optional().nullable(),
});

const voidBillSchema = z.object({
  reason: z.string().min(3),
});

const splitFractionalSchema = z.object({
  splitCount: z.number().int().min(2),
});

const splitItemsSchema = z.object({
  splitGroups: z.array(
    z.object({
      seatNumber: z.number().int().positive(),
      items: z.array(
        z.object({
          billItemId: z.string().uuid(),
          quantity: z.number().int().positive(),
        })
      ).min(1),
    })
  ).min(2),
});

const executeRefundSchema = z.object({
  refundAmountMinor: z.number().int().positive(),
  reason: z.string().min(3),
  paymentTransactionId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
  gatewayRef: z.string().optional().nullable(),
});

const getReconciliationSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// --- Controller Endpoints ---

/**
 * Exposes active unpaid bills for a table.
 */
export async function getTableProjection(req: any, res: Response): Promise<void> {
  const { tableId } = req.params;
  if (!z.string().uuid().safeParse(tableId).success) {
    throw new AppError('Invalid table UUID format.', 400, ErrorCode.VALIDATION_ERROR);
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  const branchId = req.headers['x-branch-id'] as string || req.user?.branch_id;

  if (!tenantId || !branchId) {
    throw new AppError('Missing tenant or branch context.', 400, ErrorCode.BAD_REQUEST);
  }

  const projections = await FinancialProjectionService.getActiveTableBillProjection(tenantId, branchId, tableId);

  res.status(200).json({
    status: 'success',
    data: { projections },
  });
}

/**
 * Exposes cashier reconciliation report.
 */
export async function getReconciliation(req: any, res: Response): Promise<void> {
  const parsed = getReconciliationSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  const branchId = req.headers['x-branch-id'] as string || req.user?.branch_id;

  if (!tenantId || !branchId) {
    throw new AppError('Missing tenant or branch context.', 400, ErrorCode.BAD_REQUEST);
  }

  const view = await FinancialProjectionService.getFinancialReconciliationView({
    tenantId,
    branchId,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  });

  res.status(200).json({
    status: 'success',
    data: { reconciliation: view },
  });
}

/**
 * Combines multiple active table orders into a single check.
 */
export async function aggregateBill(req: any, res: Response): Promise<void> {
  const parsed = aggregateBillSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  const branchId = req.headers['x-branch-id'] as string || req.user?.branch_id;

  if (!tenantId || !branchId) {
    throw new AppError('Missing tenant or branch context.', 400, ErrorCode.BAD_REQUEST);
  }

  const bill = await BillAggregationService.aggregateOrdersIntoBill({
    tenantId,
    branchId,
    tableId: parsed.data.tableId,
    sessionId: parsed.data.sessionId,
    orderIds: parsed.data.orderIds,
  });

  res.status(201).json({
    status: 'success',
    data: { bill },
  });
}

/**
 * Exposes a bill's specific details.
 */
export async function getBillDetails(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;

  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const bill = await getBillById(tenantId, id);
  if (!bill) {
    throw new AppError('Bill not found.', 404, ErrorCode.NOT_FOUND);
  }

  res.status(200).json({
    status: 'success',
    data: { bill },
  });
}

/**
 * Initiates an idempotent checkout transaction intent.
 */
export async function createIntent(req: any, res: Response): Promise<void> {
  const parsed = createIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  const branchId = req.headers['x-branch-id'] as string || req.user?.branch_id;

  if (!tenantId || !branchId) {
    throw new AppError('Missing tenant or branch context.', 400, ErrorCode.BAD_REQUEST);
  }

  const intent = await PaymentIntentService.createPaymentIntent({
    tenantId,
    branchId,
    billId: parsed.data.billId,
    amountMinor: parsed.data.amountMinor,
    paymentMethod: parsed.data.paymentMethod,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  res.status(201).json({
    status: 'success',
    data: { intent },
  });
}

/**
 * Processes settlement callback of a gateway payment intent checkout.
 */
export async function settleIntent(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = settleIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const attempt = await PaymentIntentService.processIntentSettlement({
    tenantId,
    intentId: id,
    gatewayRef: parsed.data.gatewayRef || undefined,
    gatewayPayload: parsed.data.gatewayPayload || undefined,
    processedBy: req.user?.id,
  });

  res.status(200).json({
    status: 'success',
    data: { attempt },
  });
}

/**
 * Directly records check payment settlement (Cash or staff ledger bypass).
 */
export async function settleBill(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = settleBillSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const bill = await SettlementLifecycleService.applySettlement({
    tenantId,
    billId: id,
    paymentIntentId: null,
    paymentMethod: parsed.data.paymentMethod,
    amountMinor: parsed.data.amountMinor,
    gatewayRef: parsed.data.gatewayRef || undefined,
    gatewayPayload: parsed.data.gatewayPayload || undefined,
    processedBy: req.user?.id,
  });

  res.status(200).json({
    status: 'success',
    data: { bill },
  });
}

/**
 * Voids an active unpaid bill check.
 */
export async function voidBill(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = voidBillSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const bill = await SettlementLifecycleService.voidBill({
    tenantId,
    billId: id,
    reason: parsed.data.reason,
    voidedBy: req.user?.id,
  });

  res.status(200).json({
    status: 'success',
    data: { bill },
  });
}

/**
 * Splits an unpaid bill fractionally (equal split) across N seats.
 */
export async function splitFractional(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = splitFractionalSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const childBills = await SplitBillService.splitBillFractionally(tenantId, id, parsed.data.splitCount);

  res.status(200).json({
    status: 'success',
    data: { childBills },
  });
}

/**
 * Splits a parent bill into custom seat-based child bills allocating specific items.
 */
export async function splitItems(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = splitItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const childBills = await SplitBillService.splitBillByItems(tenantId, id, parsed.data.splitGroups);

  res.status(200).json({
    status: 'success',
    data: { childBills },
  });
}

/**
 * Performs a retry-safe, append-only refund recording and status modifications.
 */
export async function executeRefund(req: any, res: Response): Promise<void> {
  const { id } = req.params;
  const parsed = executeRefundSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Validation failed', 400, ErrorCode.VALIDATION_ERROR, true, parsed.error.format());
  }

  const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenant_id;
  if (!tenantId) {
    throw new AppError('Missing tenant context.', 400, ErrorCode.BAD_REQUEST);
  }

  const result = await RefundService.executeRefund({
    tenantId,
    billId: id,
    paymentTransactionId: parsed.data.paymentTransactionId,
    refundAmountMinor: parsed.data.refundAmountMinor,
    reason: parsed.data.reason,
    idempotencyKey: parsed.data.idempotencyKey,
    gatewayRef: parsed.data.gatewayRef,
    issuedBy: req.user?.id,
  });

  res.status(200).json({
    status: 'success',
    data: { refund: result.refund, bill: result.bill },
  });
}
