// ============================================================
// src/modules/billing/billing.router.ts
// Secure Billing & POS Router exposing production-grade billing flows.
// ============================================================

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requestIdempotency } from '../../middleware/idempotency.middleware';
import {
  aggregateBill,
  createIntent,
  settleIntent,
  settleBill,
  voidBill,
  splitFractional,
  splitItems,
  executeRefund,
  getTableProjection,
  getReconciliation,
  getBillDetails,
} from './billing.controller';

const router: Router = Router({ mergeParams: true });

// All billing endpoints require staff authentication
router.use(authenticate);

// Projections & Cashier Dashboards
router.get('/projections/table/:tableId', getTableProjection);
router.get('/projections/reconciliation', getReconciliation);

// Bill Lifecycle Management
router.post('/bills/aggregate', aggregateBill);
router.get('/bills/:id', getBillDetails);
router.post('/bills/:id/settle', settleBill);
router.post('/bills/:id/void', voidBill);
router.post('/bills/:id/split/fractional', splitFractional);
router.post('/bills/:id/split/items', splitItems);
router.post('/bills/:id/refund', executeRefund);

// Payment Intents (idempotent, gateway checkpointing)
router.post('/intents', requestIdempotency(), createIntent);
router.post('/intents/:id/settle', settleIntent);

export { router as billingRouter };
