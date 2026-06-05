import { Router } from 'express';
import * as controller from './controllers/staff.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { tenantContext } from '../../middleware/tenant.middleware';

export const staffRouter: Router = Router({ mergeParams: true });

// Require authentication and strictly enforce tenant bounds
staffRouter.use(authenticate, tenantContext);

// Get all staff for tenant
staffRouter.get(
  '/',
  // requirePermission(PERMISSIONS.MANAGE_STAFF), // Assuming such permission exists or rely on tenant access
  controller.listStaff
);

// Create new staff
staffRouter.post(
  '/',
  // requirePermission(PERMISSIONS.MANAGE_STAFF),
  controller.createStaff
);

// Update staff
staffRouter.patch(
  '/:staffId',
  // requirePermission(PERMISSIONS.MANAGE_STAFF),
  controller.updateStaff
);

// Delete staff
staffRouter.delete(
  '/:staffId',
  // requirePermission(PERMISSIONS.MANAGE_STAFF),
  controller.deleteStaff
);
