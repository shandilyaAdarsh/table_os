// ============================================================
// src/modules/admin/admin.router.ts
// Main Router for all Admin APIs.
// Enforces Authentication and Tenant context globally.
// ============================================================

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { tenantContext } from '../../middleware/tenant.middleware';
import { adminMenuRouter } from './menu/menu.admin.router';
import { adminPricingRouter } from './pricing/pricing.admin.router';
import { adminTaxRouter } from './tax/tax.admin.router';
import { tablesRouter } from '../tables/tables.router';
import { qrAdminRouter } from '../tables/qr/qr.admin.router';
import { maintenanceRouter } from '../maintenance/maintenance.router';
import { waiterCallRouter } from '../waiter-call/waiter-call.router';
import { adminOnboardingRouter } from './onboarding/onboarding.admin.router';

const router: Router = Router({ mergeParams: true });

// ─── Global Admin Middleware ──────────────────────────────────
// Every Admin API requires authentication and a valid tenant context
router.use(authenticate);
router.use(tenantContext);

// ─── Module Routers ───────────────────────────────────────────
router.use('/menu', adminMenuRouter);
router.use('/pricing', adminPricingRouter);
router.use('/tax', adminTaxRouter);
router.use('/tables', tablesRouter);
router.use('/qr', qrAdminRouter);
router.use('/maintenance', maintenanceRouter);
router.use('/waiter-calls', waiterCallRouter);
router.use('/onboarding', adminOnboardingRouter);

// Future Admin routers:
// router.use('/staff', adminStaffRouter);

export { router as adminRouter };
