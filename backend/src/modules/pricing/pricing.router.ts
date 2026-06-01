import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermissions } from '../../middleware/rbac.middleware';
import * as pricingController from './controllers/pricing.controller';

const router: Router = Router();

// Secure all pricing routes
router.use(authenticate);

// Price Resolution (Public to internal services or roles needing pricing lookup)
// We might want to restrict this to branch_staff or pos systems
router.get(
  '/resolve',
  requirePermissions('ALL', 'VIEW_MENU'),
  pricingController.resolvePrice
);

router.post(
  '/resolved',
  requirePermissions('ALL', 'VIEW_MENU'),
  pricingController.resolvePricesBatch
);

// List prices for an item
router.get(
  '/',
  requirePermissions('ALL', 'VIEW_MENU'),
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

export default router;
