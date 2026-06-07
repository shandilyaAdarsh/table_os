import { Router } from 'express';
import * as controller from './controllers/settings.controller';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { tenantContext } from '../../middleware/tenant.middleware';
import { PERMISSIONS } from '../../types/rbac.types';

export const settingsRouter: Router = Router({ mergeParams: true });

settingsRouter.use(authenticate, tenantContext);

settingsRouter.get(
  '/',
  controller.getSettings
);

settingsRouter.patch(
  '/',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  controller.updateSettings
);
