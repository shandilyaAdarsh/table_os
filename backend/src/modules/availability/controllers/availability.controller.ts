// ============================================================
// src/modules/availability/controllers/availability.controller.ts
// Express controller layer for the Core Availability System.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AvailabilityService } from '../services/availability.service';
import {
  CreateAvailabilityScheduleSchema,
  UpdateAvailabilityScheduleSchema,
  CreateBranchItemAvailabilitySchema,
  UpdateBranchItemAvailabilitySchema,
  CreateItemAvailabilityExceptionSchema,
  UpdateItemAvailabilityExceptionSchema,
  ResolveItemAvailabilitySchema,
  ResolveItemAvailabilityBatchSchema
} from '../availability.validators';

export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ─── Availability Schedules ───────────────────────────────────

  createSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = CreateAvailabilityScheduleSchema.parse(req.body);
      const schedule = await this.availabilityService.createSchedule(tenantId, req.context.userId, payload);
      res.status(201).json(schedule);
    } catch (error) {
      next(error);
    }
  };

  getSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const schedule = await this.availabilityService.getScheduleById(tenantId, id);
      res.status(200).json(schedule);
    } catch (error) {
      next(error);
    }
  };

  listSchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const menu_item_id = req.query.menu_item_id ? String(req.query.menu_item_id) : undefined;
      const branch_id = req.query.branch_id === 'null' ? null : req.query.branch_id ? String(req.query.branch_id) : undefined;
      const is_active = req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await this.availabilityService.listSchedules(tenantId, {
        menu_item_id,
        branch_id,
        is_active,
        page,
        limit,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateAvailabilityScheduleSchema.parse(req.body);
      const schedule = await this.availabilityService.updateSchedule(tenantId, id, req.context.userId, payload);
      res.status(200).json(schedule);
    } catch (error) {
      next(error);
    }
  };

  deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.availabilityService.softDeleteSchedule(tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Branch Item Availability ──────────────────────────────────

  createOperationalState = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = CreateBranchItemAvailabilitySchema.parse(req.body);
      const state = await this.availabilityService.createOperationalState(tenantId, req.context.userId, payload);
      res.status(201).json(state);
    } catch (error) {
      next(error);
    }
  };

  getOperationalState = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const state = await this.availabilityService.getOperationalStateById(tenantId, id);
      res.status(200).json(state);
    } catch (error) {
      next(error);
    }
  };

  listOperationalStates = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const menu_item_id = req.query.menu_item_id ? String(req.query.menu_item_id) : undefined;
      const branch_id = req.query.branch_id ? String(req.query.branch_id) : undefined;
      const is_active = req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await this.availabilityService.listOperationalStates(tenantId, {
        menu_item_id,
        branch_id,
        is_active,
        page,
        limit,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateOperationalState = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateBranchItemAvailabilitySchema.parse(req.body);
      const state = await this.availabilityService.updateOperationalState(tenantId, id, req.context.userId, payload);
      res.status(200).json(state);
    } catch (error) {
      next(error);
    }
  };

  deleteOperationalState = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.availabilityService.softDeleteOperationalState(tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Item Availability Exceptions ──────────────────────────────

  createException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = CreateItemAvailabilityExceptionSchema.parse(req.body);
      const exception = await this.availabilityService.createException(tenantId, req.context.userId, payload);
      res.status(201).json(exception);
    } catch (error) {
      next(error);
    }
  };

  getException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const exception = await this.availabilityService.getExceptionById(tenantId, id);
      res.status(200).json(exception);
    } catch (error) {
      next(error);
    }
  };

  listExceptions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const menu_item_id = req.query.menu_item_id ? String(req.query.menu_item_id) : undefined;
      const branch_id = req.query.branch_id === 'null' ? null : req.query.branch_id ? String(req.query.branch_id) : undefined;
      const is_active = req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await this.availabilityService.listExceptions(tenantId, {
        menu_item_id,
        branch_id,
        is_active,
        page,
        limit,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateItemAvailabilityExceptionSchema.parse(req.body);
      const exception = await this.availabilityService.updateException(tenantId, id, req.context.userId, payload);
      res.status(200).json(exception);
    } catch (error) {
      next(error);
    }
  };

  deleteException = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.availabilityService.softDeleteException(tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Dynamic Resolution Engines ────────────────────────────────

  resolve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      const payload = ResolveItemAvailabilitySchema.parse({
        menu_item_id: req.query.menu_item_id,
        branch_id: req.query.branch_id,
        resolved_at: req.query.resolved_at,
      });

      const resolved = await this.availabilityService.resolveItemAvailability(
        tenantId,
        payload.menu_item_id,
        payload.branch_id,
        payload.resolved_at
      );
      res.status(200).json(resolved);
    } catch (error) {
      next(error);
    }
  };

  resolveBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.context.tenantId!;
      // Accept array of item ids from request body
      const payload = ResolveItemAvailabilityBatchSchema.parse({
        menu_item_ids: req.body.menu_item_ids,
        branch_id: req.body.branch_id,
        resolved_at: req.body.resolved_at,
      });

      const resolved = await this.availabilityService.resolveItemAvailabilityBatch(
        tenantId,
        payload.menu_item_ids,
        payload.branch_id,
        payload.resolved_at
      );
      res.status(200).json(resolved);
    } catch (error) {
      next(error);
    }
  };
}
