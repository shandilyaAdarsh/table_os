// ============================================================
// src/modules/modifier/modifier.router.ts
// Router config for the Core Modifier System.
// ============================================================

import { Router, type Router as ExpressRouter } from 'express';
import { ModifierController } from './controllers/modifier.controller';
import { ModifierService } from './services/modifier.service';
import { ModifierRepository } from './repositories/modifier.repository';
import { supabaseAdmin } from '../../config/supabase';
import {
  authenticate,
  requireTenantAccess,
  requireMinRole,
} from '../../middleware/auth.middleware';
import { requirePermissions } from '../../middleware/rbac.middleware';
import { ROLES, PERMISSIONS } from '../../types/rbac.types';

const router: ExpressRouter = Router({ mergeParams: true });

const modifierRepository = new ModifierRepository(supabaseAdmin);
const modifierService = new ModifierService(modifierRepository);
const modifierController = new ModifierController(modifierService);

// ─── Auth applied to all routes ───────────────────────────────
router.use(authenticate);
router.use(requireTenantAccess('tenantId'));

// ─── Modifier Groups ──────────────────────────────────────────
router.post(
  '/groups',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.createGroup
);

router.get(
  '/groups',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.listGroups
);

router.get(
  '/groups/:id',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.getGroup
);

router.patch(
  '/groups/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.updateGroup
);

router.delete(
  '/groups/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.deleteGroup
);

// ─── Modifier Options ──────────────────────────────────────────
router.post(
  '/options',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.createOption
);

router.get(
  '/options/:id',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.getOption
);

router.get(
  '/groups/:groupId/options',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.listOptionsByGroup
);

router.patch(
  '/options/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.updateOption
);

router.delete(
  '/options/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.deleteOption
);

// ─── Assignments ───────────────────────────────────────────────
router.post(
  '/assignments',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.assignGroupToItem
);

router.get(
  '/assignments/:id',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.getAssignment
);

router.get(
  '/items/:menuItemId/assignments',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.listAssignmentsByItem
);

router.patch(
  '/assignments/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.updateAssignment
);

router.delete(
  '/assignments/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  modifierController.deleteAssignment
);

// ─── Resolution & Validation ───────────────────────────────────
router.get(
  '/resolve/items/:menuItemId',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.resolveMenuItemModifiers
);

router.post(
  '/validate',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  modifierController.validateSelection
);

export { router as modifierRouter };
export default router;
