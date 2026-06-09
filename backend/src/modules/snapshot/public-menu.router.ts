// ============================================================
// src/modules/snapshot/public-menu.router.ts
// Router for all guest public-facing endpoints (Menu, Orders, Waiter Calls).
//
// Mounted at: /public
// ============================================================

import { Router } from 'express';
import { getPublicMenuSnapshot } from './public-menu.controller';
import { checkoutPublicOrder, getPublicOrderStatus } from '../orders/public-orders.controller';
import { createCall } from '../waiter-call/waiter-call.controller';
import { requireQrSession } from '../tables/qr/qr.middleware';
import { requestIdempotency } from '../../middleware/idempotency.middleware';
import { publicOrderLimiter } from '../../middleware/public-rate-limit.middleware';

const publicMenuRouter: Router = Router();

// 1. Unified middleware to construct tenant context from QR Session for idempotency tracking
const initPublicContext = (req: any, _res: any, next: any) => {
  if (req.qrSession) {
    req.context = {
      tenantId: req.qrSession.tenant_id,
    };
  }
  next();
};

// GET /public/menu/snapshot — CDN-cached public menu snapshot (no QR session required)
publicMenuRouter.get('/menu/snapshot', getPublicMenuSnapshot);

// POST /public/orders — Idempotent public customer checkout (QR session required)
publicMenuRouter.post(
  '/orders',
  requireQrSession,
  publicOrderLimiter,
  initPublicContext,
  requestIdempotency(),
  checkoutPublicOrder
);

// GET /public/orders/:id/status — Track status of placed orders (QR session required)
publicMenuRouter.get('/orders/:id/status', requireQrSession, getPublicOrderStatus);

// POST /public/waiter-call — Enables table-scoped waiter pings (QR session required)
publicMenuRouter.post('/waiter-call', requireQrSession, createCall);

export { publicMenuRouter };
export default publicMenuRouter;
