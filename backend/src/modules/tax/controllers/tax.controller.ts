import type { Request, Response, NextFunction } from 'express';
import type { TaxService } from '../services/tax.service';
import {
  CreateTaxProfileSchema,
  UpdateTaxProfileSchema,
  CreateTaxRateSchema,
  AssignMenuItemTaxProfileSchema,
  ResolveTaxSchema,
  ResolveBatchTaxSchema
} from '../tax.validators';
import { z } from 'zod';
import { NotFoundError } from '../../../shared/errors/AppError';

export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  // ─── Profiles ─────────────────────────────────────────────────

  createProfile = async (req: Request<{ tenantId: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = CreateTaxProfileSchema.parse(req.body);
      const profile = await this.taxService.createProfile(req.params.tenantId, req.context.userId, payload);
      res.status(201).json(profile);
    } catch (error) {
      next(error);
    }
  };

  getProfile = async (req: Request<{ tenantId: string; id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const profile = await this.taxService.getProfile(req.params.tenantId, id);
      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request<{ tenantId: string; id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const payload = UpdateTaxProfileSchema.parse(req.body);
      const profile = await this.taxService.updateProfile(req.params.tenantId, id, req.context.userId, payload);
      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  };

  deleteProfile = async (req: Request<{ tenantId: string; id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.taxService.deleteProfile(req.params.tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Rates ────────────────────────────────────────────────────

  createRate = async (req: Request<{ tenantId: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = CreateTaxRateSchema.parse(req.body);
      const oldRateId = req.query.replace_rate_id ? z.string().uuid().parse(req.query.replace_rate_id) : null;
      const oldVersionNum = req.query.replace_version_num ? z.number().int().parse(Number(req.query.replace_version_num)) : undefined;

      const rate = await this.taxService.appendRate(req.params.tenantId, req.context.userId, oldRateId, payload, oldVersionNum);
      res.status(201).json(rate);
    } catch (error) {
      next(error);
    }
  };

  deactivateRate = async (req: Request<{ tenantId: string; id: string }>, res: Response, next: NextFunction) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const versionNum = z.number().int().parse(Number(req.query.version_num));
      await this.taxService.deactivateRate(req.params.tenantId, id, req.context.userId, versionNum);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  // ─── Menu Item Mapping ────────────────────────────────────────

  assignMenuItemProfile = async (req: Request<{ tenantId: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = AssignMenuItemTaxProfileSchema.parse(req.body);
      const mapping = await this.taxService.assignProfileToMenuItem(req.params.tenantId, req.context.userId, payload);
      res.status(200).json(mapping);
    } catch (error) {
      next(error);
    }
  };

  // ─── Resolution ───────────────────────────────────────────────

  resolveTax = async (req: Request<{ tenantId: string; menu_item_id: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = ResolveTaxSchema.parse({
        menu_item_id: req.params.menu_item_id,
        effective_at: req.query.effective_at as string | undefined
      });
      const resolved = await this.taxService.resolveTax(req.params.tenantId, payload.menu_item_id, payload.effective_at);
      if (!resolved) {
        throw new NotFoundError('No active tax profile found for this menu item');
      }
      res.status(200).json(resolved);
    } catch (error) {
      next(error);
    }
  };

  resolveBatchTax = async (req: Request<{ tenantId: string }>, res: Response, next: NextFunction) => {
    try {
      const payload = ResolveBatchTaxSchema.parse(req.body);
      const resolved = await this.taxService.resolveBatchTax(req.params.tenantId, payload.menu_item_ids, payload.effective_at);
      res.status(200).json(resolved);
    } catch (error) {
      next(error);
    }
  };
}
