// ============================================================
// src/modules/waiter-call/waiter-call.router.ts
// Router for Staff-facing Waiter Call management.
// ============================================================

import { Router } from 'express';
import { transitionStatus, listCalls } from './waiter-call.controller';

const router: Router = Router({ mergeParams: true });

// Staff can list and update waiter call statuses
router.get('/', listCalls);
router.patch('/:id/status', transitionStatus);

export { router as waiterCallRouter };
