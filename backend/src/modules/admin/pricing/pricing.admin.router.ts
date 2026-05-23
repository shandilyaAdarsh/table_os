// ============================================================
// src/modules/admin/pricing/pricing.admin.router.ts
// Admin API Router for Pricing operations.
// Enforces permission controls for administrative operations.
// ============================================================

import { Router } from 'express';
import { requirePermissions } from '../../../middleware/rbac.middleware';
import * as pricingController from './pricing.admin.controller';

const router: Router = Router({ mergeParams: true });

// Resolve Price
router.get(
  '/resolve',
  requirePermissions('ANY', 'VIEW_MENU', 'MANAGE_MENU'),
  pricingController.resolvePrice
);

// List prices for an item
router.get(
  '/',
  requirePermissions('ANY', 'VIEW_MENU', 'MANAGE_MENU'),
  pricingController.listPrices
);

// Create new price
router.post(
  '/',
  requirePermissions('ALL', 'MANAGE_MENU'),
  pricingController.createPrice
);

// Update a price
router.patch(
  '/:priceId',
  requirePermissions('ALL', 'MANAGE_MENU'),
  pricingController.updatePrice
);

// Soft delete a price
router.delete(
  '/:priceId',
  requirePermissions('ALL', 'MANAGE_MENU'),
  pricingController.deletePrice
);

export { router as adminPricingRouter };
