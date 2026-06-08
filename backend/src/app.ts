// ============================================================
// src/app.ts
// Express application factory. Wires all middleware and routes.
// ============================================================

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { corsOrigins, env } from './config/env';
import { authRouter } from './modules/auth/auth.router';
import { tenantRouter } from './modules/tenants/tenant.router';
import { rbacRouter } from './modules/rbac/rbac.router';
import { menuRouter } from './modules/menu/menu.router';
import { publicGuestMenuRouter } from './modules/menu/public-guest-menu.router';
import pricingRouter from './modules/pricing/pricing.router';
import { taxRouter } from './modules/tax/tax.router';
import { modifierRouter } from './modules/modifier/modifier.router';
import { availabilityRouter } from './modules/availability/availability.router';
import { staffRouter } from './modules/staff/staff.router';
import { snapshotRouter } from './modules/snapshot/snapshot.router';
import { publicMenuRouter } from './modules/snapshot/public-menu.router';
import { publicAvailabilityRouter } from './modules/availability/public-availability.router';
import { settingsRouter } from './modules/settings/settings.router';
import { publicTenantRouter } from './modules/tenants/public-tenant.router';
import { adminRouter } from './modules/admin/admin.router';
import { publicQrRouter } from './modules/tables/qr/table-qr.router';
import { cartRouter } from './modules/cart/cart.router';
import { ordersRouter } from './modules/orders/orders.router';
import { kitchenRouter } from './modules/kitchen/kitchen.router';
import { mutationsRouter } from './modules/kitchen/mutations.router';
import { billingRouter } from './modules/billing/billing.router';
import { infrastructureRouter } from './modules/infrastructure/infrastructure.router';
import { chaosRouter } from './modules/infrastructure/chaos.router';
import { runtimeRouter } from './modules/projection/runtime.router';
import { eventReplayRouter } from './modules/projection/event-replay.router';
import { deploymentRouter } from './modules/projection/deployment.router';
import { observabilityRouter } from './modules/observability/observability.router';
import { analyticsRouter } from './modules/analytics/analytics.router';
import { contextRouter } from './modules/context/context.router';
import { customerRouter } from './modules/customer/customer.router';
import { ObservabilityService } from './modules/infrastructure/observability.service';
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';

export function createApp(): express.Application {
  const app = express();

  // ─── Security headers ──────────────────────────────────────
  app.use(helmet());

  // ─── CORS ──────────────────────────────────────────────────
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (
          requestOrigin.startsWith('http://localhost:') ||
          requestOrigin.startsWith('http://127.0.0.1:') ||
          requestOrigin.startsWith('http://192.168.') ||
          requestOrigin.startsWith('http://10.')
        ) {
          return callback(null, true);
        }
        if (corsOrigins.includes(requestOrigin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Device-Fingerprint',
        'X-Device-Session-Id',
        'X-Forwarded-For',
        'X-QR-Session-Token',
        'X-Retry-Count',
        'x-request-id',
        'Idempotency-Key',
        'X-Idempotency-Key',
        'X-Branch-Id',
        'X-Terminal-Id',
      ],
    })
  );

  // ─── OPTIONS Preflight (must be before all routes) ─────────────────────
  // Required so browser preflights for credentialed cross-origin requests
  // receive the-correct CORS headers before touching any authenticated route.
  app.options('*', cors());

  // ─── Observability Context Propagation ─────────────────────
  app.use(ObservabilityService.observabilityMiddleware);

  // ─── Request logging ───────────────────────────────────────
  app.use(loggingMiddleware);

  // ─── Body parsing ──────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ─── Trust proxy ───────────────────────────────────────────
  // Always enabled so req.ip is authoritative (first hop from reverse proxy).
  // In development without a proxy, this is safe — Express falls back to
  // the direct connection address when no X-Forwarded-For header is present.
  app.set('trust proxy', 1);

  // ─── Health check ──────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'orderlli-backend',
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Routes ────────────────────────────────────────────────
  app.use('/auth',    authRouter);
  app.use('/api/v1/auth', authRouter);
  
  app.use('/tenants', tenantRouter);
  app.use('/api/v1/tenants', tenantRouter);
  
  app.use('/rbac',    rbacRouter);
  app.use('/api/v1/rbac', rbacRouter);
  
  // Menu routes: /api/tenants/:tenantId/menu/**
  app.use('/tenants/:tenantId/menu', menuRouter);
  app.use('/api/v1/tenants/:tenantId/menu', menuRouter);

  // Public Guest Menu API (QR flow)
  app.use('/menu', publicGuestMenuRouter);
  app.use('/api/v1/menu', publicGuestMenuRouter);

  app.use('/tenants/:tenantId/pricing', pricingRouter);
  app.use('/api/v1/tenants/:tenantId/pricing', pricingRouter);

  app.use('/tenants/:tenantId/tax', taxRouter);
  app.use('/api/v1/tenants/:tenantId/tax', taxRouter);

  app.use('/tenants/:tenantId/modifier', modifierRouter);
  app.use('/api/v1/tenants/:tenantId/modifier', modifierRouter);

  app.use('/tenants/:tenantId/availability', availabilityRouter);
  app.use('/api/v1/tenants/:tenantId/availability', availabilityRouter);

  app.use('/tenants/:tenantId/staff', staffRouter);
  app.use('/api/v1/tenants/:tenantId/staff', staffRouter);

  // Settings
  app.use('/settings', settingsRouter);
  app.use('/api/v1/settings', settingsRouter);

  // ─── Public Snapshot API (no auth required) ─────────────────
  // CDN-cacheable branch menu snapshots for QR ordering.
  // Per public_api_contracts.md — versioned at /api/v1/public/branches.
  // Wires up Snapshot and Availability routers.
  app.use('/api/v1/public/branches', snapshotRouter);
  app.use('/api/v1/public/branches', publicAvailabilityRouter);
  app.use('/public', publicMenuRouter);
  
  // ─── Public Organizations API (no auth required) ────────────
  app.use('/api/v1/public/organizations', publicTenantRouter);

  // ─── Public QR Runtime API (no auth required, rate limited) ──────────
  app.use('/api/v1/public/table', publicQrRouter);

  // ─── Public Cart API (requires QR session token) ────────────
  app.use('/api/v1/cart', cartRouter);

  // ─── Order API (requires QR session or Staff Auth) ──────────
  app.use('/api/v1/orders', ordersRouter);

  // ─── Kitchen KDS API (requires Staff Auth) ──────────────────
  app.use('/api/v1/kitchen', kitchenRouter);
  app.use('/api/v1/mutations', mutationsRouter);

  // ─── Billing/POS API (requires Staff Auth) ──────────────────
  app.use('/api/v1/billing', billingRouter);

  // ─── Infrastructure/Hardening API ──────────────────────────
  app.use('/api/v1/infrastructure', infrastructureRouter);
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/v1/infrastructure/chaos', chaosRouter);
  }

  // ─── Customer API ───────────────────────────────────────────
  app.use('/api/v1/customer', customerRouter);

  // ─── Analytics API ──────────────────────────────────────────
  app.use('/api/v1/analytics', analyticsRouter);

  // ─── Operational Runtime API ───────────────────────────────
  app.use('/api/v1/runtime', runtimeRouter);
  app.use('/api/v1/runtime/events', eventReplayRouter);
  app.use('/api/v1/runtime', deploymentRouter);
  app.use('/api/v1/runtime/observability', observabilityRouter);

  // ─── Admin API (requires auth & tenant context) ──────────────
  // The authoritative operational interface for the dashboard/admin panel.
  app.use('/v1/admin', adminRouter);
  app.use('/api/v1/admin', adminRouter);

  // ─── Context/Bootstrap API ────────────────────────────────────
  // Single-payload bootstrap for the admin app. Must resolve before routing.
  app.use('/api/v1/context', contextRouter);
  // ─── 404 handler ───────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ─── Global error handler — MUST be last ───────────────────
  app.use(errorMiddleware);

  return app;
}
