// ============================================================
// src/modules/availability/availability.router.ts
// Router config for the Core Availability System.
// ============================================================

import { Router, type Router as ExpressRouter } from 'express';
import { AvailabilityController } from './controllers/availability.controller';
import { AvailabilityService } from './services/availability.service';
import { AvailabilityRepository } from './repositories/availability.repository';
import { supabaseAdmin } from '../../config/supabase';
import {
  authenticate,
  requireTenantAccess,
  requireMinRole,
} from '../../middleware/auth.middleware';
import { requirePermissions } from '../../middleware/rbac.middleware';
import { ROLES, PERMISSIONS } from '../../types/rbac.types';

const router: ExpressRouter = Router({ mergeParams: true });

const availabilityRepository = new AvailabilityRepository(supabaseAdmin);
const availabilityService = new AvailabilityService(availabilityRepository);
const availabilityController = new AvailabilityController(availabilityService);

// ─── Auth applied to all routes ───────────────────────────────
router.use(authenticate);
router.use(requireTenantAccess('tenantId'));

// ─── Availability Resolution (Public/Staff Engine) ───────────
router.get(
  '/resolve',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.resolve
);

router.post(
  '/resolve-batch',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.resolveBatch
);

// ─── Availability Schedules ───────────────────────────────────
router.post(
  '/schedules',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.createSchedule
);

router.get(
  '/schedules',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.listSchedules
);

router.get(
  '/schedules/:id',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.getSchedule
);

router.patch(
  '/schedules/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.updateSchedule
);

router.delete(
  '/schedules/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.deleteSchedule
);

// ─── Branch Item Availability (Operational State) ─────────────
router.post(
  '/states',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.createOperationalState
);

router.get(
  '/states',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.listOperationalStates
);

router.get(
  '/states/:id',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.getOperationalState
);

router.patch(
  '/states/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.updateOperationalState
);

router.delete(
  '/states/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.deleteOperationalState
);

// ─── Item Availability Exceptions ──────────────────────────────
router.post(
  '/exceptions',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.createException
);

router.get(
  '/exceptions',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.listExceptions
);

router.get(
  '/exceptions/:id',
  requirePermissions('ANY', PERMISSIONS.VIEW_MENU, PERMISSIONS.MANAGE_MENU),
  availabilityController.getException
);

router.patch(
  '/exceptions/:id',
  requireMinRole(ROLES.MANAGER),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.updateException
);

router.delete(
  '/exceptions/:id',
  requireMinRole(ROLES.RESTAURANT_ADMIN),
  requirePermissions('ANY', PERMISSIONS.MANAGE_MENU),
  availabilityController.deleteException
);

export { router as availabilityRouter };
export default router;
