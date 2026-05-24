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
  try {
    const session = req.qrSession!;
    const dto = AddCartItemSchema.parse(req.body);
    const cartDetail = await cartService.addCartItem(session.tenant_id, session.id, dto);
    res.status(201).json({ success: true, data: cartDetail });
  } catch (err) {
    next(err);
  }
}

export async function updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.qrSession!;
    const itemId = req.params.itemId as string;
    const dto = UpdateCartItemSchema.parse(req.body);
    const cartDetail = await cartService.updateCartItem(session.tenant_id, session.id, itemId, dto);
    res.status(200).json({ success: true, data: cartDetail });
  } catch (err) {
    next(err);
  }
}

export async function removeItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.qrSession!;
    const itemId = req.params.itemId as string;
    
    // Parse from body or query string
    const inputVersion = req.body.version_num ?? (req.query.version_num ? Number(req.query.version_num) : undefined);
    const dto = RemoveCartItemSchema.parse({ version_num: inputVersion });
    
    const cartDetail = await cartService.removeCartItem(session.tenant_id, session.id, itemId, dto.version_num);
    res.status(200).json({ success: true, data: cartDetail });
  } catch (err) {
    next(err);
  }
}

export async function updateNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.qrSession!;
    const dto = UpdateCartNotesSchema.parse(req.body);
    const cartDetail = await cartService.updateCartNotes(session.tenant_id, session.id, dto);
    res.status(200).json({ success: true, data: cartDetail });
  } catch (err) {
    next(err);
  }
}
