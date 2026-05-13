// ============================================================
// src/app.ts
// Express application factory. Wires all middleware and routes.
// ============================================================

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { corsOrigins, env } from './config/env';
import { logger } from './utils/logger';
import { authRouter } from './modules/auth/auth.router';
import { errorHandler } from './middleware/error.middleware';

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
  app.use(
    pinoHttp({
      logger,
      // Redact sensitive fields from logs
      redact: ['req.headers.authorization', 'req.body.password', 'req.body.new_password'],
      customLogLevel: (_req, res) => {
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    })
  );

  // ─── Body parsing ──────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ─── Trust proxy (for X-Forwarded-For in containerized/reverse-proxied envs) ─
  if (env.NODE_ENV !== 'development') {
    app.set('trust proxy', 1);
  }

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
  app.use('/auth', authRouter);

  // Future modules registered here:
  // app.use('/tenants', tenantsRouter);
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
  app.use(errorHandler);

  return app;
}
