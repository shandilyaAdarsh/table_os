// ============================================================
// src/modules/orders/orders.router.ts
// Router for Orders, checkout, list, and status FSM transitions.
// ============================================================

import { Router } from 'express';
import { requireQrSession } from '../tables/qr/qr.middleware';
import { authenticate } from '../../middleware/auth.middleware';
import { requestIdempotency } from '../../middleware/idempotency.middleware';
import { requireMutationEnvelope } from '../../middleware/mutation.middleware';
import {
  checkoutCart,
  getOrderDetails,
  transitionStatus,
  listBranchOrders,
  acceptOrderAlert,
  reassignOrderAlert,
  getPendingAlerts,
  getAvailableStaff,
} from './orders.controller';
import type { Request, Response, NextFunction } from 'express';

const router: Router = Router({ mergeParams: true });

// Dual authentication resolver: allows EITHER a QR scanning customer OR a logged-in staff member
function requireQrOrStaffAuth(req: Request, res: Response, next: NextFunction) {
  if (req.headers['x-qr-session-token'] || req.query.session_token) {
    return requireQrSession(req, res, next);
  }
  return authenticate(req, res, next);
}

// Customers or staff can checkout a cart
router.post('/checkout', requireQrOrStaffAuth, requireMutationEnvelope(), requestIdempotency(), checkoutCart);

// ── Order Alert routes (P3-STAFF-01) ────────────────────────────────────────
// IMPORTANT: Static GET paths MUST be declared before /:id to avoid being
// swallowed by the parameterised route (Express matches top-down).
router.get('/alerts/pending', authenticate, getPendingAlerts);
router.get('/alerts/staff-available', authenticate, getAvailableStaff);

// Staff-only list of all active orders
router.get('/', authenticate, listBranchOrders);

// Fetch order details is allowed for either QR customers or staff
router.get('/:id', requireQrOrStaffAuth, getOrderDetails);

// Staff-only routes: managing order state transitions
router.patch('/:id/status', authenticate, requireMutationEnvelope(), transitionStatus);
router.patch('/:id/accept', authenticate, acceptOrderAlert);
router.patch('/:id/reassign', authenticate, reassignOrderAlert);

export { router as ordersRouter };
