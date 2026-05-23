// ============================================================
// src/modules/kitchen/kitchen.router.ts
// Secure KDS router for kitchen stations.
// ============================================================

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  routeToKitchen,
  transitionTicketStatus,
  getTicketDetails,
  listKitchenQueue,
  transitionKdsItemStatus,
  getFloorState,
  getWaiterDashboard,
  getCustomerTracking,
  reconcileRealtimeState,
  evaluateQueueSLA
} from './kitchen.controller';

const router: Router = Router({ mergeParams: true });

// All KDS operations require valid staff authentication
router.use(authenticate);

// Routing a submitted order to kitchen
router.post('/route', routeToKitchen);

// KDS Queue operations
router.get('/', listKitchenQueue);
router.get('/:id', getTicketDetails);
router.patch('/:id/status', transitionTicketStatus);

// ─── NEW KDS RUNTIME ROUTES ───────────────────────────────────

// Item-level lifecycle transitions
router.patch('/items/:preparationId/status', transitionKdsItemStatus);

// Read-model projections
router.get('/projections/floor', getFloorState);
router.get('/projections/waiter', getWaiterDashboard);
router.get('/projections/customer/:orderId', getCustomerTracking);

// Reconnect-safe gap reconciliation
router.post('/reconcile', reconcileRealtimeState);

// SLA evaluation and priority escalations
router.post('/sla/evaluate', evaluateQueueSLA);

export { router as kitchenRouter };
