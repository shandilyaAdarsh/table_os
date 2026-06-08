// ============================================================
// src/modules/customer/customer.router.ts
// Customer-facing endpoints (Cart, Recommendations, etc)
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { formatSuccess } from '../../shared/utils/response-formatter';
import { getCartRecommendations } from '../menu/services/menu-recommendation.service';

const router = Router();

const RecommendationQuerySchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
});

const RecommendationBodySchema = z.object({
  cart_item_ids: z.array(z.string().uuid()).min(1).max(50), // cap cart size to prevent abuse
  limit: z.number().int().min(1).max(10).optional().default(5) // hard cap: max 10, default 5
});

router.post('/cart/recommendations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Determine tenant/branch context. Could be in query or headers depending on how QR app sends it.
    // The public Guest router uses query params `tenantId` and `branchId`.
    const query = RecommendationQuerySchema.parse(req.query);
    const body = RecommendationBodySchema.parse(req.body);

    const recommendations = await getCartRecommendations(
      query.tenantId, 
      query.branchId, 
      body.cart_item_ids,
      body.limit
    );

    res.json(formatSuccess({ recommendations }));
  } catch (err) {
    next(err);
  }
});

import { CustomerService } from './customer.service';

router.get('/orders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id;
    // Extract tenantId and tableId from query parameters
    const tenantId = String(req.query.tenantId);
    const tableId = String(req.query.tableId);

    const order = await CustomerService.getGuestOrderConfirmation(orderId as string, tenantId as string, tableId as string);
    
    res.json(formatSuccess(order));
  } catch (err) {
    next(err);
  }
});

export { router as customerRouter };
