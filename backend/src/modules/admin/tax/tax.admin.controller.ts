// ============================================================
// src/modules/admin/tax/tax.admin.controller.ts
// Admin API Controller for Tax System.
// Enforces tenant isolation via req.context.tenantId.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../../../config/supabase';
import { TaxRepository } from '../../tax/repositories/tax.repository';
import { TaxService } from '../../tax/services/tax.service';
import {
  CreateTaxProfileSchema,
  UpdateTaxProfileSchema,
  CreateTaxRateSchema,
  AssignMenuItemTaxProfileSchema,
  ResolveTaxSchema,
  ResolveBatchTaxSchema
} from '../../tax/tax.validators';
import { NotFoundError } from '../../../shared/errors/AppError';
import { formatSuccess } from '../../../shared/utils/response-formatter';

const taxRepository = new TaxRepository(supabaseAdmin);
const taxService = new TaxService(taxRepository);

export class AdminTaxController {
  
  // ─── Profiles ─────────────────────────────────────────────────

  createProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = CreateTaxProfileSchema.parse(req.body);
      const profile = await taxService.createProfile(req.context.tenantId!, req.context.userId, payload);
      res.status(201).json(formatSuccess(profile));
    } catch (error) { next(error); }
  };

  getProfile = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const profile = await taxService.getProfile(req.context.tenantId!, id);
      res.status(200).json(formatSuccess(profile));
    } catch (error) { next(error); }
  };

  updateProfile = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateTaxProfileSchema.parse(req.body);
      const profile = await taxService.updateProfile(req.context.tenantId!, id, req.context.userId, payload);
      res.status(200).json(formatSuccess(profile));
    } catch (error) { next(error); }
  };

  deleteProfile = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await taxService.deleteProfile(req.context.tenantId!, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) { next(error); }
  };

  // ─── Rates ────────────────────────────────────────────────────

  createRate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = CreateTaxRateSchema.parse(req.body);
      const oldRateId = req.query.replace_rate_id ? z.string().uuid().parse(req.query.replace_rate_id) : null;
      const oldVersionNum = req.query.replace_version_num ? z.number().int().parse(Number(req.query.replace_version_num)) : undefined;

      const rate = await taxService.appendRate(req.context.tenantId!, req.context.userId, oldRateId, payload, oldVersionNum);
      res.status(201).json(formatSuccess(rate));
    } catch (error) { next(error); }
  };

  deactivateRate = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await taxService.deactivateRate(req.context.tenantId!, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) { next(error); }
  };

  // ─── Menu Item Mapping ────────────────────────────────────────

  assignMenuItemProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = AssignMenuItemTaxProfileSchema.parse(req.body);
      const mapping = await taxService.assignProfileToMenuItem(req.context.tenantId!, req.context.userId, payload);
      res.status(200).json(formatSuccess(mapping));
    } catch (error) { next(error); }
  };

  // ─── Resolution ───────────────────────────────────────────────

  resolveTax = async (req: Request<{ menu_item_id: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = ResolveTaxSchema.parse({
        menu_item_id: req.params.menu_item_id,
        effective_at: req.query.effective_at as string | undefined
      });
      const resolved = await taxService.resolveTax(req.context.tenantId!, payload.menu_item_id, payload.effective_at);
      if (!resolved) {
        throw new NotFoundError('No active tax profile found for this menu item');
      }
      res.status(200).json(formatSuccess(resolved));
    } catch (error) { next(error); }
  };

  resolveBatchTax = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = ResolveBatchTaxSchema.parse(req.body);
      const resolved = await taxService.resolveBatchTax(req.context.tenantId!, payload.menu_item_ids, payload.effective_at);
      res.status(200).json(formatSuccess(resolved));
    } catch (error) { next(error); }
  };
}

export const adminTaxController = new AdminTaxController();
