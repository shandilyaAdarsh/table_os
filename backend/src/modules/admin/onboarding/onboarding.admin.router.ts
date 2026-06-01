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

export { router as adminOnboardingRouter };
