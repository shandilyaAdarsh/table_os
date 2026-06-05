// ============================================================
// src/modules/admin/dashboard/dashboard.admin.router.ts
// ============================================================

import { Router } from 'express';
import { AdminDashboardController } from './dashboard.admin.controller';

const router: Router = Router({ mergeParams: true });
const dashboardController = new AdminDashboardController();

// PATCH /api/v1/admin/dashboard/dismiss-qr-banner
router.patch('/dismiss-qr-banner', dashboardController.dismissQrBanner);

export { router as adminDashboardRouter };
