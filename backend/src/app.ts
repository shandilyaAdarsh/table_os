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
import { errorMiddleware } from './middleware/error.middleware';
import { loggingMiddleware } from './middleware/logging.middleware';

export function createApp(): express.Application {
  const app = express();

  // ─── Security headers ──────────────────────────────────────
  app.use(helmet());

  // ─── CORS ──────────────────────────────────────────────────
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Device-Fingerprint',
        'X-Device-Session-Id',
        'X-Forwarded-For',
      ],
    })
  );

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
  app.use('/tenants', tenantRouter);
  app.use('/rbac',    rbacRouter);

  // Future modules registered here:
  // app.use('/staff', staffRouter);
  // app.use('/menu', menuRouter);

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
