import { Router } from 'express';
import * as controller from './controllers/tenant.controller';
import { bootstrap } from '../context/context.controller';
import { 
  authenticate, 
  requireRole, 
  requirePermission 
} from '../../middleware/auth.middleware';
import { tenantContext } from '../../middleware/tenant.middleware';
import { ROLES, PERMISSIONS } from '../../types/rbac.types';

export const tenantRouter: Router = Router();

// ============================================================
// GET /api/v1/tenants/current
// Alias for the bootstrap endpoint — returns the same single-payload
// context used by the Flutter admin app on startup.
// MUST be declared before /:tenantId to avoid being captured as a param.
// ============================================================
tenantRouter.get('/current', authenticate, bootstrap);

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

// Update branch
tenantScoped.patch(
  '/branches/:branchId',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  controller.updateBranch
);

// Delete branch
tenantScoped.delete(
  '/branches/:branchId',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  controller.deleteBranch
);

// Mount scoped router
tenantRouter.use('/:tenantId', tenantScoped);
