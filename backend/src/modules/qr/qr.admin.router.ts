// ============================================================
// src/modules/qr/qr.admin.router.ts
// Admin QR management endpoints.
// Mounted at: /api/v1/admin/qr
// ============================================================

import { Router } from 'express';
import { requireMinRole } from '../../middleware/auth.middleware';
import { ROLES } from '../../types/rbac.types';
import { createCode, invalidateCode } from './qr.admin.controller';

const router: Router = Router({ mergeParams: true });

// POST /api/v1/admin/qr/codes
router.post('/codes', requireMinRole(ROLES.MANAGER), createCode);

// POST /api/v1/admin/qr/codes/:qrCodeId/invalidate
router.post('/codes/:qrCodeId/invalidate', requireMinRole(ROLES.MANAGER), invalidateCode);

export { router as qrAdminRouter };
