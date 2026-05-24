// ============================================================
// src/modules/snapshot/snapshot.router.ts
// Router for the public branch menu snapshot API.
//
// Mounted at: /api/v1/public/branches
// Full route:  GET /api/v1/public/branches/:branchId/menu-snapshot
//
// This is a PUBLIC endpoint — no authentication middleware.
// CDN and public clients (QR code scanners, Flutter app) hit this.
// ============================================================

import { Router } from 'express';
import { getMenuSnapshot } from './snapshot.controller';

const snapshotRouter: Router = Router({ mergeParams: true });

// GET /api/v1/public/branches/:branchId/menu-snapshot
snapshotRouter.get('/:branchId/menu-snapshot', getMenuSnapshot);

export { snapshotRouter };
