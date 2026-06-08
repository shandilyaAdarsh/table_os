// ============================================================
// src/modules/cart/cart.controller.ts
// Express controller for Cart endpoints.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import * as cartService from './cart.service';
import {
  AddCartItemSchema,
  UpdateCartItemSchema,
  RemoveCartItemSchema,
  UpdateCartNotesSchema,
} from './cart.validators';
import { logMutationAudit, updateMutationAuditStatus } from '../idempotency/mutation-audit.repository';

function formatMutationResponse(res: Response, status: number, data: any, ctx: any, serverCartRevision: number) {
  res.status(status).json({
    success: true,
    data,
    mutation_ack: {
      mutation_id: ctx.mutation_id,
      acknowledged_at: new Date().toISOString(),
      server_cart_revision: serverCartRevision,
    }
  });
}

export async function getCart(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.qrSession!;
    const cartDetail = await cartService.getOrCreateCart(
      session.tenant_id,
      session.branch_id,
      session.table_id,
      session.id,
    );
    res.status(200).json({ success: true, data: cartDetail });
  } catch (err) {
    next(err);
  }
}

export async function addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = req.mutationContext!;
  try {
    const session = req.qrSession!;
    void logMutationAudit({
      ...ctx,
      tenant_id: ctx.tenant_id || session.tenant_id,
      branch_id: ctx.branch_id || session.branch_id,
      mutation_type: 'cart.add_item',
      status: 'IN_FLIGHT',
    });

    const dto = AddCartItemSchema.parse(req.body);
    const cartDetail = await cartService.addCartItem(session.tenant_id, session.id, dto, ctx.expected_cart_revision);
    
    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 201, cartDetail, ctx, cartDetail.cart.version_num);
  } catch (err: any) {
    void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', err.message);
    next(err);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = req.mutationContext!;
  try {
    const session = req.qrSession!;
    const itemId = req.params.itemId as string;
    void logMutationAudit({
      ...ctx,
      tenant_id: ctx.tenant_id || session.tenant_id,
      branch_id: ctx.branch_id || session.branch_id,
      mutation_type: 'cart.update_item',
      status: 'IN_FLIGHT',
    });

    const dto = UpdateCartItemSchema.parse(req.body);
    const cartDetail = await cartService.updateCartItem(session.tenant_id, session.id, itemId, dto, ctx.expected_cart_revision);
    
    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 200, cartDetail, ctx, cartDetail.cart.version_num);
  } catch (err: any) {
    void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', err.message);
    next(err);
  }
}

export async function removeItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = req.mutationContext!;
  try {
    const session = req.qrSession!;
    const itemId = req.params.itemId as string;
    void logMutationAudit({
      ...ctx,
      tenant_id: ctx.tenant_id || session.tenant_id,
      branch_id: ctx.branch_id || session.branch_id,
      mutation_type: 'cart.remove_item',
      status: 'IN_FLIGHT',
    });

    const dto = RemoveCartItemSchema.parse(req.body);
    const cartDetail = await cartService.removeCartItem(session.tenant_id, session.id, itemId, dto.version_num, ctx.expected_cart_revision);
    
    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 200, cartDetail, ctx, cartDetail.cart.version_num);
  } catch (err: any) {
    void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', err.message);
    next(err);
  }
}

export async function updateNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = req.mutationContext!;
  try {
    const session = req.qrSession!;
    void logMutationAudit({
      ...ctx,
      tenant_id: ctx.tenant_id || session.tenant_id,
      branch_id: ctx.branch_id || session.branch_id,
      mutation_type: 'cart.update_notes',
      status: 'IN_FLIGHT',
    });

    const dto = UpdateCartNotesSchema.parse(req.body);
    const cartDetail = await cartService.updateCartNotes(session.tenant_id, session.id, dto, ctx.expected_cart_revision);
    
    void updateMutationAuditStatus(ctx.mutation_id, 'ACKNOWLEDGED');
    formatMutationResponse(res, 200, cartDetail, ctx, cartDetail.cart.version_num);
  } catch (err: any) {
    void updateMutationAuditStatus(ctx.mutation_id, 'FAILED_FATAL', err.message);
    next(err);
  }
}
