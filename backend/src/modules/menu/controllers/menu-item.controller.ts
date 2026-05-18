// ============================================================
// src/modules/menu/controllers/menu-item.controller.ts
// Controller layer for Menu Items.
// Handles HTTP request/response formatting, delegates to Service.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/utils/validation.utils';
import { formatSuccess } from '../../../shared/utils/response-formatter';
import {
  CreateMenuItemSchema,
  UpdateMenuItemSchema,
  MenuItemListQuerySchema
} from '../menu.validators';
import {
  listMenuItems,
  getMenuItemById,
  createNewMenuItem,
  updateExistingMenuItem,
  deleteMenuItem
} from '../services/menu.service';

export async function getList(req: Request<{ tenantId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const query = validate(MenuItemListQuerySchema, req.query);
    const result = await listMenuItems(tenantId, query);
    res.json(formatSuccess(result));
  } catch (err) { next(err); }
}

export async function getById(req: Request<{ tenantId: string; itemId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const itemId = String(req.params.itemId);
    const item = await getMenuItemById(tenantId, itemId);
    res.json(formatSuccess(item));
  } catch (err) { next(err); }
}

export async function createItem(req: Request<{ tenantId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const dto = validate(CreateMenuItemSchema, req.body);
    const item = await createNewMenuItem(tenantId, dto, req.context.userId);
    res.status(201).json(formatSuccess(item));
  } catch (err) { next(err); }
}

export async function updateItem(req: Request<{ tenantId: string; itemId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const itemId = String(req.params.itemId);
    const dto = validate(UpdateMenuItemSchema, req.body);
    const item = await updateExistingMenuItem(tenantId, itemId, dto, req.context.userId);
    res.json(formatSuccess(item));
  } catch (err) { next(err); }
}

export async function removeItem(req: Request<{ tenantId: string; itemId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const itemId = String(req.params.itemId);
    await deleteMenuItem(tenantId, itemId, req.context.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}
