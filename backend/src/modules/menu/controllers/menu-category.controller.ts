// ============================================================
// src/modules/menu/controllers/menu-category.controller.ts
// Controller layer for Menu Categories.
// Handles HTTP request/response formatting, delegates to Service.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/utils/validation.utils';
import { formatSuccess } from '../../../shared/utils/response-formatter';
import { ForbiddenError } from '../../../shared/errors/AppError';
import {
  CreateMenuCategorySchema,
  UpdateMenuCategorySchema,
  SetCategoryBranchVisibilitySchema,
  MenuCategoryListQuerySchema
} from '../menu.validators';
import {
  getCategoryTree,
  listCategories,
  getVisibleCategoriesForBranch,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
  setCategoryVisibilityForBranch
} from '../services/menu.service';

export async function getTree(req: Request<{ tenantId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const tree = await getCategoryTree(tenantId);
    res.json(formatSuccess(tree));
  } catch (err) { next(err); }
}

export async function getList(req: Request<{ tenantId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const query = validate(MenuCategoryListQuerySchema, req.query);
    const result = await listCategories(tenantId, query);
    res.json(formatSuccess(result));
  } catch (err) { next(err); }
}

export async function getBranchCategories(req: Request<{ tenantId: string; branchId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const branchId = String(req.params.branchId);
    const categories = await getVisibleCategoriesForBranch(tenantId, branchId);
    res.json(formatSuccess(categories));
  } catch (err) { next(err); }
}

export async function createCategory(req: Request<{ tenantId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId; // Derived strictly from auth context
    if (!tenantId) throw new ForbiddenError('Tenant context is required');
    const dto = validate(CreateMenuCategorySchema, req.body);
    const category = await createMenuCategory(tenantId, dto, req.context);
    res.status(201).json(formatSuccess(category));
  } catch (err) { next(err); }
}

export async function updateCategory(req: Request<{ tenantId: string; categoryId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const categoryId = String(req.params.categoryId);
    const dto = validate(UpdateMenuCategorySchema, req.body);
    const category = await updateMenuCategory(tenantId, categoryId, dto, req.context.userId);
    res.json(formatSuccess(category));
  } catch (err) { next(err); }
}

export async function removeCategory(req: Request<{ tenantId: string; categoryId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const categoryId = String(req.params.categoryId);
    await deleteMenuCategory(tenantId, categoryId, req.context.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function setBranchVisibility(req: Request<{ tenantId: string; categoryId: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = String(req.params.tenantId);
    const categoryId = String(req.params.categoryId);
    const dto = validate(SetCategoryBranchVisibilitySchema, req.body);
    await setCategoryVisibilityForBranch(tenantId, categoryId, dto);
    res.status(204).send();
  } catch (err) { next(err); }
}
