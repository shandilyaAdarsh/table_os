// ============================================================
// src/modules/context/context.router.ts
// Admin app bootstrap endpoint.
// Single deterministic payload consumed by Flutter on every login/restore.
// ============================================================

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { bootstrap } from './context.controller';

export const contextRouter: Router = Router();

// GET /api/v1/context/bootstrap
// Also aliased at GET /api/v1/tenants/current (see tenant.router.ts)
contextRouter.get('/bootstrap', authenticate, bootstrap);
