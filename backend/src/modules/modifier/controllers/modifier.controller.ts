// ============================================================
// src/modules/modifier/controllers/modifier.controller.ts
// Express controller layer for the Core Modifier System.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ModifierService } from '../services/modifier.service';
import {
  CreateModifierGroupSchema,
  UpdateModifierGroupSchema,
  CreateModifierOptionSchema,
  UpdateModifierOptionSchema,
  CreateMenuItemModifierGroupSchema,
  UpdateMenuItemModifierGroupSchema,
  ValidateModifierSelectionSchema
} from '../modifier.validators';

export class ModifierController {
  constructor(private readonly modifierService: ModifierService) {}

  // ─── Modifier Groups ──────────────────────────────────────────

  createGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = CreateModifierGroupSchema.parse(req.body);
      const group = await this.modifierService.createGroup(tenantId, req.context.userId, payload);
      res.status(201).json(group);
    } catch (error) {
      next(error);
    }
  };

  getGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const group = await this.modifierService.getGroupById(tenantId, id);
      res.status(200).json(group);
    } catch (error) {
      next(error);
    }
  };

  listGroups = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const is_active = req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await this.modifierService.listGroups(tenantId, { is_active, page, limit });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateModifierGroupSchema.parse(req.body);
      const group = await this.modifierService.updateGroup(tenantId, id, req.context.userId, payload);
      res.status(200).json(group);
    } catch (error) {
      next(error);
    }
  };

  deleteGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.modifierService.softDeleteGroup(tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Modifier Options ──────────────────────────────────────────

  createOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = CreateModifierOptionSchema.parse(req.body);
      const option = await this.modifierService.createOption(tenantId, req.context.userId, payload);
      res.status(201).json(option);
    } catch (error) {
      next(error);
    }
  };

  getOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const option = await this.modifierService.getOptionById(tenantId, id);
      res.status(200).json(option);
    } catch (error) {
      next(error);
    }
  };

  listOptionsByGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const groupId = z.string().uuid().parse(req.params.groupId);
      const is_active = req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined;

      const options = await this.modifierService.listOptionsByGroup(tenantId, groupId, { is_active });
      res.status(200).json(options);
    } catch (error) {
      next(error);
    }
  };

  updateOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateModifierOptionSchema.parse(req.body);
      const option = await this.modifierService.updateOption(tenantId, id, req.context.userId, payload);
      res.status(200).json(option);
    } catch (error) {
      next(error);
    }
  };

  deleteOption = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.modifierService.softDeleteOption(tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Menu Item Assignment ──────────────────────────────────────────

  assignGroupToItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = CreateMenuItemModifierGroupSchema.parse(req.body);
      const assignment = await this.modifierService.assignGroupToItem(tenantId, req.context.userId, payload);
      res.status(201).json(assignment);
    } catch (error) {
      next(error);
    }
  };

  getAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const assignment = await this.modifierService.getAssignmentById(tenantId, id);
      res.status(200).json(assignment);
    } catch (error) {
      next(error);
    }
  };

  listAssignmentsByItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const menuItemId = z.string().uuid().parse(req.params.menuItemId);
      const assignments = await this.modifierService.listAssignmentsByItem(tenantId, menuItemId);
      res.status(200).json(assignments);
    } catch (error) {
      next(error);
    }
  };

  updateAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateMenuItemModifierGroupSchema.parse(req.body);
      const assignment = await this.modifierService.updateAssignment(tenantId, id, req.context.userId, payload);
      res.status(200).json(assignment);
    } catch (error) {
      next(error);
    }
  };

  deleteAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.modifierService.softDeleteAssignment(tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Resolvers & Validation endpoints ──────────────────────────────

  resolveMenuItemModifiers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const menuItemId = z.string().uuid().parse(req.params.menuItemId);
      const resolved = await this.modifierService.resolveMenuItemModifiers(tenantId, menuItemId);
      res.status(200).json(resolved);
    } catch (error) {
      next(error);
    }
  };

  validateSelection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = ValidateModifierSelectionSchema.parse(req.body);
      const result = await this.modifierService.validateSelection(tenantId, payload);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
