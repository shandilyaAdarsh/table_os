// ============================================================
// src/modules/admin/menu/menu-category.admin.controller.ts
// Admin API Controller for Menu Categories.
// Enforces tenant isolation via req.context.tenantId.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/utils/validation.utils';
import { formatSuccess } from '../../../shared/utils/response-formatter';
import {
  CreateMenuCategorySchema,
  UpdateMenuCategorySchema,
  MenuCategoryListQuerySchema
} from '../../menu/menu.validators';
import {
  getCategoryTree,
  listCategories,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  restoreMenuCategory
} from '../../menu/services/menu.service';
import { findCategoryById } from '../../menu/repositories/menu-category.repository';
import { AppError } from '../../../shared/errors/AppError';

export async function getTree(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const tree = await getCategoryTree(tenantId);
    res.json(formatSuccess(tree));
  } catch (err) { next(err); }
}

export async function getList(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const query = validate(MenuCategoryListQuerySchema, req.query);
    const result = await listCategories(tenantId, query);
    res.json(formatSuccess(result));
  } catch (err) { next(err); }
}

export async function getById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const categoryId = String(req.params.id);
    const category = await findCategoryById(tenantId, categoryId);
    if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND');
    res.json(formatSuccess(category));
  } catch (err) { next(err); }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const dto = validate(CreateMenuCategorySchema, req.body);
    const category = await createMenuCategory(tenantId, dto, req.context);
    res.status(201).json(formatSuccess(category));
  } catch (err) { next(err); }
}

export async function updateCategory(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const categoryId = String(req.params.id);
    const dto = validate(UpdateMenuCategorySchema, req.body);
    const category = await updateMenuCategory(tenantId, categoryId, dto, req.context.userId);
    res.json(formatSuccess(category));
  } catch (err) { next(err); }
}

export async function removeCategory(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const categoryId = String(req.params.id);
    await deleteMenuCategory(tenantId, categoryId, req.context.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function restoreCategory(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const categoryId = String(req.params.id);
    const category = await restoreMenuCategory(tenantId, categoryId, req.context.userId);
    res.json(formatSuccess(category));
  } catch (err) { next(err); }
}
