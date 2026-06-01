import type { Request, Response, NextFunction } from 'express';
import * as pricingService from '../services/pricing.service';
import { formatSuccess } from '../../../shared/utils/response-formatter';
import { validate } from '../../../shared/utils/validation.utils';
import {
  CreateMenuItemPriceSchema,
  UpdateMenuItemPriceSchema,
  DeleteMenuItemPriceSchema,
  PricingListQuerySchema,
  ResolvePriceQuerySchema
} from '../pricing.validators';

export async function createPrice(req: Request<{ tenantId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const userId = req.context.userId;
    const dto = validate(CreateMenuItemPriceSchema, req.body);
    const result = await pricingService.createPrice(tenantId, dto, userId);
    res.status(201).json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
}

export async function updatePrice(req: Request<{ tenantId: string; priceId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const userId = req.context.userId;
    const priceId = String(req.params.priceId);
    const dtoData = validate(UpdateMenuItemPriceSchema, req.body);
    const { version_num, ...dto } = dtoData;
    
    const result = await pricingService.updatePrice(tenantId, priceId, version_num, dto, userId);
    res.json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
}

export async function deletePrice(req: Request<{ tenantId: string; priceId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const userId = req.context.userId;
    const priceId = String(req.params.priceId);
    const dtoData = validate(DeleteMenuItemPriceSchema, req.body);

    await pricingService.deletePrice(tenantId, priceId, dtoData.version_num, userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function listPrices(req: Request<{ tenantId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const query: any = validate(PricingListQuerySchema as any, req.query);
    const result = await pricingService.listPrices(tenantId, query);
    // Explicitly destructure or format it correctly according to formatSuccess signature
    // Assume formatSuccess(data) wraps { success: true, data } and we can inject meta or just return as is for now
    res.json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
}

export async function resolvePrice(req: Request<{ tenantId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const query: any = validate(ResolvePriceQuerySchema as any, req.query);

    const resolution = await pricingService.resolvePrice(tenantId, query.menu_item_id, query.currency_code, query.as_of);
    
    res.json(formatSuccess(resolution));
  } catch (error) {
    next(error);
  }
}

export async function resolvePricesBatch(req: Request<{ tenantId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const entityIds = req.body.entity_ids || [];
    const currencyCode = req.body.currency_code || 'USD';
    const asOf = req.body.as_of;

    const resolutions = await pricingService.resolvePricesBatch(tenantId, entityIds, currencyCode, asOf);
    
    res.json(formatSuccess(resolutions));
  } catch (error) {
    next(error);
  }
}
