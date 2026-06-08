// ============================================================
// src/modules/tenants/staff.router.ts
// Staff routes mounted under /api/v1/tenants/:tenantId/staff
// ============================================================

import { Router } from 'express';
import { listStaff } from './controllers/staff.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { tenantContext } from '../../middleware/tenant.middleware';

const staffRouter: Router = Router({ mergeParams: true });

// Enforce auth + tenant isolation
staffRouter.use(authenticate, tenantContext);

// GET /api/v1/tenants/:tenantId/staff?branchId=:branchId
staffRouter.get('/', listStaff);

export { staffRouter };
