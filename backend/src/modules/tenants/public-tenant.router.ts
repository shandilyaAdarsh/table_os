import { Router } from 'express';
import { getPublicOrganizations, getPublicBranches, getPublicStaff } from './public-tenant.controller';

const router: Router = Router();

// GET /api/v1/public/organizations
router.get('/', getPublicOrganizations);

// GET /api/v1/public/organizations/:orgId/branches
router.get('/:orgId/branches', getPublicBranches);

// GET /api/v1/public/organizations/:orgId/branches/:branchId/staff
router.get('/:orgId/branches/:branchId/staff', getPublicStaff);

export { router as publicTenantRouter };
