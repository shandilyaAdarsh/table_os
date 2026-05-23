// ============================================================
// src/modules/qr/qr.router.ts
// Public QR endpoints (no auth).
// Mounted at: /api/v1/qr
// ============================================================

import { Router } from 'express';
import { resolveSession, validateSession } from './qr.controller';

const router: Router = Router({ mergeParams: true });

// POST /api/v1/qr/resolve
router.post('/resolve', resolveSession);

// GET /api/v1/qr/session
router.get('/session', validateSession);

export { router as qrRouter };
