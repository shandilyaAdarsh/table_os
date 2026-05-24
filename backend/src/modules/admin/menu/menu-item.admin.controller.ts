// ============================================================
// src/modules/admin/menu/menu-item.admin.controller.ts
// Admin API Controller for Menu Items.
// Enforces tenant isolation via req.context.tenantId.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/utils/validation.utils';
import { formatSuccess } from '../../../shared/utils/response-formatter';
import {
  CreateMenuItemSchema,
  UpdateMenuItemSchema,
  MenuItemListQuerySchema,
  LinkModifierGroupsSchema
} from '../../menu/menu.validators';
import {
  listMenuItems,
  createNewMenuItem,
  updateExistingMenuItem,
  deleteMenuItem,
  restoreMenuItem,
  linkModifierGroupsToItem
} from '../../menu/services/menu.service';
import { findItemById } from '../../menu/repositories/menu-item.repository';
import { AppError } from '../../../shared/errors/AppError';

export async function getList(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const query = validate(MenuItemListQuerySchema, req.query);
    const result = await listMenuItems(tenantId, query);
    res.json(formatSuccess(result));
  } catch (err) { next(err); }
}

export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const itemId = String(req.params.id);
    const item = await findItemById(tenantId, itemId);
    if (!item) throw new AppError('Menu item not found', 404, 'NOT_FOUND');
    res.json(formatSuccess(item));
  } catch (err) { next(err); }
}

export async function createItem(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const dto = validate(CreateMenuItemSchema, req.body);
    const item = await createNewMenuItem(tenantId, dto, req.context.userId);
    res.status(201).json(formatSuccess(item));
  } catch (err) { next(err); }
}

export async function updateItem(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const itemId = String(req.params.id);
    const dto = validate(UpdateMenuItemSchema, req.body);
    const item = await updateExistingMenuItem(tenantId, itemId, dto, req.context.userId);
    res.json(formatSuccess(item));
  } catch (err) { next(err); }
}

export async function removeItem(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const itemId = String(req.params.id);
    await deleteMenuItem(tenantId, itemId, req.context.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function restoreItem(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const itemId = String(req.params.id);
    const item = await restoreMenuItem(tenantId, itemId, req.context.userId);
    res.json(formatSuccess(item));
  } catch (err) { next(err); }
}

export async function linkModifiers(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const itemId = String(req.params.id);
    const dto = validate(LinkModifierGroupsSchema, req.body);
    await linkModifierGroupsToItem(tenantId, itemId, dto.modifier_group_ids);
    res.status(204).send();
  } catch (err) { next(err); }
}
