import { Router, type Router as ExpressRouter } from 'express';
import { TaxController } from './controllers/tax.controller';
import { TaxService } from './services/tax.service';
import { TaxRepository } from './repositories/tax.repository';
import { supabaseAdmin } from '../../config/supabase';
import {
  authenticate,
  requireTenantAccess,
  requireMinRole,
} from '../../middleware/auth.middleware';
import { requirePermissions } from '../../middleware/rbac.middleware';
import { ROLES, PERMISSIONS } from '../../types/rbac.types';

const router: ExpressRouter = Router({ mergeParams: true });

const taxRepository = new TaxRepository(supabaseAdmin);
const taxService = new TaxService(taxRepository);
const taxController = new TaxController(taxService);

// ─── Auth applied to all routes ───────────────────────────────
router.use(authenticate);
router.use(requireTenantAccess('tenantId'));

// ─── Profiles ─────────────────────────────────────────────────
router.post('/profiles', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  taxController.createProfile
);

router.get('/profiles/:id', 
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU), 
  taxController.getProfile
);

router.put('/profiles/:id', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  taxController.updateProfile
);

router.delete('/profiles/:id', 
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  taxController.deleteProfile
);

// ─── Rates ────────────────────────────────────────────────────
router.post('/rates', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  taxController.createRate
);

router.delete('/rates/:id', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  taxController.deactivateRate
);

// ─── Mapping ──────────────────────────────────────────────────
router.post('/items/assign', 
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU), 
  taxController.assignMenuItemProfile
);

// ─── Resolution ───────────────────────────────────────────────
router.get('/resolve/items/:menu_item_id', 
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU), 
  taxController.resolveTax
);

router.post('/resolve/batch', 
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU), 
  taxController.resolveBatchTax
);

export { router as taxRouter };
