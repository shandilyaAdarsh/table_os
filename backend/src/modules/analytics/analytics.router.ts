import { Router } from 'express';
import * as controller from './analytics.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { tenantContext } from '../../middleware/tenant.middleware';

export const analyticsRouter: Router = Router({ mergeParams: true });

// Enforce auth and tenant scoping for all analytics endpoints
analyticsRouter.use(authenticate, tenantContext);

analyticsRouter.get('/daily', controller.getDailySummary);
analyticsRouter.get('/range', controller.getAnalyticsRange);
