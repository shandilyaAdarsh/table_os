// ============================================================
// Public guest menu API (QR scan flow — no authentication).
// GET /api/v1/menu/categories?tenantId=&branchId=
// GET /api/v1/menu/items?tenantId=&branchId=
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors/AppError';
import { formatSuccess } from '../../shared/utils/response-formatter';
import {
  getVisibleCategoriesForBranch,
  getEffectiveMenuForBranch,
} from './services/menu.service';

const router = Router();

const GuestMenuQuerySchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
});

function parseGuestQuery(req: Request) {
  const parsed = GuestMenuQuerySchema.safeParse({
    tenantId: req.query.tenantId,
    branchId: req.query.branchId,
  });
  if (!parsed.success) {
    throw new AppError('tenantId and branchId are required', 422, 'VALIDATION_ERROR');
  }
  return parsed.data;
}

router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, branchId } = parseGuestQuery(req);
    const categories = await getVisibleCategoriesForBranch(tenantId, branchId);
    res.json(formatSuccess(categories));
  } catch (err) {
    next(err);
  }
});

router.get('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, branchId } = parseGuestQuery(req);
    const items = await getEffectiveMenuForBranch(tenantId, {
      branch_id: branchId,
      include_unavailable: false,
      limit: 500,
    });
    res.json(formatSuccess(items));
  } catch (err) {
    next(err);
  }
});

export { router as publicGuestMenuRouter };
