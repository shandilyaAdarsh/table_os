// ============================================================
// src/modules/admin/pricing/pricing.admin.controller.ts
// Admin API Controller for Pricing.
// Enforces tenant isolation via req.context.tenantId.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import * as pricingService from '../../pricing/services/pricing.service';
import { formatSuccess } from '../../../shared/utils/response-formatter';
import { validate } from '../../../shared/utils/validation.utils';
import {
  CreateMenuItemPriceSchema,
  UpdateMenuItemPriceSchema,
  DeleteMenuItemPriceSchema,
  PricingListQuerySchema,
  ResolvePriceQuerySchema
} from '../../pricing/pricing.validators';

export async function createPrice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context.tenantId!;
    const userId = req.context.userId;
    const dto = validate(CreateMenuItemPriceSchema, req.body);
    const result = await pricingService.createPrice(tenantId, dto, userId);
    res.status(201).json(formatSuccess(result));
  } catch (error) { next(error); }
}

export async function updatePrice(req: Request<{ priceId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context.tenantId!;
    const userId = req.context.userId;
    const priceId = String(req.params.priceId);
    const dtoData = validate(UpdateMenuItemPriceSchema, req.body);
    const { version_num, ...dto } = dtoData;
    
    const result = await pricingService.updatePrice(tenantId, priceId, version_num, dto, userId);
    res.json(formatSuccess(result));
  } catch (error) { next(error); }
}

export async function deletePrice(req: Request<{ priceId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context.tenantId!;
    const userId = req.context.userId;
    const priceId = String(req.params.priceId);
    const dtoData = validate(DeleteMenuItemPriceSchema, req.body);

    await pricingService.deletePrice(tenantId, priceId, dtoData.version_num, userId);
    res.status(204).send();
  } catch (error) { next(error); }
}

export async function listPrices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context.tenantId!;
    const query: any = validate(PricingListQuerySchema as any, req.query);
    const result = await pricingService.listPrices(tenantId, query);
    res.json(formatSuccess(result));
  } catch (error) { next(error); }
}

export async function resolvePrice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context.tenantId!;
    const query: any = validate(ResolvePriceQuerySchema as any, req.query);
    const resolution = await pricingService.resolvePrice(tenantId, query.menu_item_id, query.currency_code, query.as_of);
    res.json(formatSuccess(resolution));
  } catch (error) { next(error); }
}
