// ============================================================
// src/modules/admin/onboarding/onboarding.admin.router.ts
// Router for Admin Onboarding API.
// ============================================================

import { Router } from 'express';
import { AdminOnboardingController } from './onboarding.admin.controller';

const router: Router = Router({ mergeParams: true });
const onboardingController = new AdminOnboardingController();

// GET /api/v1/admin/onboarding/status
router.get('/status', onboardingController.getOnboardingStatus);

// POST /api/v1/admin/onboarding/skip
router.post('/skip', onboardingController.skipOnboarding);

// PUT /api/v1/admin/onboarding/restaurant-info
router.put('/restaurant-info', onboardingController.updateRestaurantInfo);

// PUT /api/v1/admin/onboarding/business-config
router.put('/business-config', onboardingController.updateBusinessConfig);

// PUT /api/v1/admin/onboarding/gst-legal
router.put('/gst-legal', onboardingController.updateGstLegalConfig);

// PUT /api/v1/admin/onboarding/tables-hours
router.put('/tables-hours', onboardingController.updateTablesAndHours);

export { router as adminOnboardingRouter };
