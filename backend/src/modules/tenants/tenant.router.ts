import { Router } from 'express';
import * as controller from './controllers/tenant.controller';
import { 
  authenticate, 
  requireRole, 
  requirePermission 
} from '../../middleware/auth.middleware';
import { tenantContext } from '../../middleware/tenant.middleware';
import { ROLES, PERMISSIONS } from '../../types/rbac.types';

export const tenantRouter: Router = Router();

// ============================================================
// GLOBAL ROUTES (Super Admin Only)
// ============================================================

// Provision new tenant (Onboarding)
tenantRouter.post(
  '/',
  authenticate,
  requireRole(ROLES.SUPER_ADMIN),
  controller.createTenant
);

// ============================================================
// TENANT-SCOPED ROUTES
// ============================================================

const tenantScoped = Router({ mergeParams: true });

// Require authentication and strictly enforce tenant bounds
tenantScoped.use(authenticate, tenantContext);

// Get tenant details
tenantScoped.get(
  '/',
  // requirePermission(PERMISSIONS.MANAGE_SETTINGS), 
  controller.getTenant
);

// Get tenant branches
tenantScoped.get(
  '/branches',
  // Everyone with access to the tenant can see branches, 
  // or restrict based on specific permission.
  controller.listBranches
);

// Create branch
tenantScoped.post(
  '/branches',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  controller.createBranch
);

// Special endpoint for Flutter Admin App context bootstrap
tenantRouter.get(
  '/current',
  authenticate,
  controller.getCurrentContext
);

// Mount scoped router
tenantRouter.use('/:tenantId', tenantScoped);
