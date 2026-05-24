// ============================================================
// src/modules/admin/tax/tax.admin.router.ts
// Admin API Router for Tax operations.
// Enforces permission controls for administrative operations.
// ============================================================

import { Router } from 'express';
import { adminTaxController } from './tax.admin.controller';
import { requirePermissions } from '../../../middleware/rbac.middleware';
import { requireMinRole } from '../../../middleware/auth.middleware';
import { ROLES, PERMISSIONS } from '../../../types/rbac.types';

const router: Router = Router({ mergeParams: true });

// ─── Profiles ─────────────────────────────────────────────────
router.post('/profiles', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  adminTaxController.createProfile
);

router.get('/profiles/:id', 
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU), 
  adminTaxController.getProfile
);

router.put('/profiles/:id', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  adminTaxController.updateProfile
);

router.delete('/profiles/:id', 
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  adminTaxController.deleteProfile
);

// ─── Rates ────────────────────────────────────────────────────
router.post('/rates', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  adminTaxController.createRate
);

router.delete('/rates/:id', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  adminTaxController.deactivateRate
);

// ─── Mapping ──────────────────────────────────────────────────
router.post('/items/assign', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  adminTaxController.assignMenuItemProfile
);

// ─── Resolution ───────────────────────────────────────────────
router.get('/resolve/items/:menu_item_id', 
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU), 
  adminTaxController.resolveTax
);

router.post('/resolve/batch', 
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU), 
  adminTaxController.resolveBatchTax
);

export { router as adminTaxRouter };
