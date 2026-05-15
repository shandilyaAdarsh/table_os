// ============================================================
// src/modules/rbac/rbac.router.ts
// RBAC route definitions.
// All routes require authentication. Most require MANAGER or above.
// ============================================================

import { Router } from 'express';
import {
  assignRole,
  revokeMembership,
  getUserBranchAccesses,
  getActiveSessions,
} from './controllers/rbac.controller';
import {
  authenticate,
  requireMinRole,
  requirePermission,
  requireTenantAccess,
} from '../../middleware/auth.middleware';
import { ROLES, PERMISSIONS } from '../../types/rbac.types';

const router: Router = Router();

// ─── Session management (self) ────────────────────────────────
// Any authenticated user can list their own sessions
router.get('/sessions', authenticate, getActiveSessions);

// ─── Tenant-scoped RBAC management ───────────────────────────
const tenantScoped: Router = Router({ mergeParams: true });

tenantScoped.use(
  authenticate,
  requireTenantAccess('tenantId'),
  requireMinRole(ROLES.MANAGER)
);

// Assign role to a user (RESTAURANT_ADMIN or SUPER_ADMIN only for escalated roles)
tenantScoped.post('/roles', requirePermission(PERMISSIONS.MANAGE_ROLES), assignRole);

// Revoke membership (RESTAURANT_ADMIN or above)
tenantScoped.delete('/roles', requireMinRole(ROLES.RESTAURANT_ADMIN), revokeMembership);

// View branch access for a user
tenantScoped.get(
  '/branch-access/:userId',
  requirePermission(PERMISSIONS.VIEW_STAFF),
  getUserBranchAccesses
);

router.use('/:tenantId', tenantScoped);

export { router as rbacRouter };
