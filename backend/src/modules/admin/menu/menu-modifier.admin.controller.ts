// ============================================================
// src/modules/admin/menu/menu-modifier.admin.controller.ts
// Admin API Controller for Menu Modifiers.
// Enforces tenant isolation via req.context.tenantId.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../../shared/utils/validation.utils';
import { formatSuccess } from '../../../shared/utils/response-formatter';
import {
  CreateModifierGroupSchema,
  UpdateModifierGroupSchema,
  CreateModifierOptionSchema,
  UpdateModifierOptionSchema
} from '../../menu/menu.validators';
import {
  createNewModifierGroup,
  updateExistingModifierGroup,
  addOptionToGroup,
  updateModifierOptionData,
  deleteModifierGroup,
  restoreModifierGroupData,
  deleteModifierOption,
  restoreModifierOptionData
} from '../../menu/services/menu.service';
import { findModifierGroupsByTenant } from '../../menu/repositories/modifier.repository';

export async function getGroups(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const groups = await findModifierGroupsByTenant(tenantId);
    res.json(formatSuccess(groups));
  } catch (err) { next(err); }
}

export async function createGroup(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const dto = validate(CreateModifierGroupSchema, req.body);
    const group = await createNewModifierGroup(tenantId, dto);
    res.status(201).json(formatSuccess(group));
  } catch (err) { next(err); }
}

export async function updateGroup(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const groupId = String(req.params.id);
    const dto = validate(UpdateModifierGroupSchema, req.body);
    const group = await updateExistingModifierGroup(tenantId, groupId, dto);
    res.json(formatSuccess(group));
  } catch (err) { next(err); }
}

export async function removeGroup(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const groupId = String(req.params.id);
    await deleteModifierGroup(tenantId, groupId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function restoreGroup(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const groupId = String(req.params.id);
    const group = await restoreModifierGroupData(tenantId, groupId);
    res.json(formatSuccess(group));
  } catch (err) { next(err); }
}

export async function createOption(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const groupId = String(req.params.id);
    const dto = validate(CreateModifierOptionSchema, { ...req.body, modifier_group_id: groupId });
    const option = await addOptionToGroup(tenantId, dto);
    res.status(201).json(formatSuccess(option));
  } catch (err) { next(err); }
}

export async function updateOption(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const optionId = String(req.params.id);
    const dto = validate(UpdateModifierOptionSchema, req.body);
    const option = await updateModifierOptionData(tenantId, optionId, dto);
    res.json(formatSuccess(option));
  } catch (err) { next(err); }
}

export async function removeOption(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const optionId = String(req.params.id);
    await deleteModifierOption(tenantId, optionId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function restoreOption(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const tenantId = req.context.tenantId!;
    const optionId = String(req.params.id);
    const option = await restoreModifierOptionData(tenantId, optionId);
    res.json(formatSuccess(option));
  } catch (err) { next(err); }
}
