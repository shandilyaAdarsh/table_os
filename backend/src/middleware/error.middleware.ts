// ============================================================
// src/middleware/error.middleware.ts
// Global error handler. Must be registered LAST in Express.
// Maps AppError subclasses → structured JSON. Never leaks internals.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  RateLimitError,
  AccountLockedError,
} from '../shared/errors/AppError';
import { moduleLogger } from '../utils/logger';

const log = moduleLogger('error-handler');

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    retry_after?: number;
    locked_until?: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Operational (expected) errors — safe to surface to client
  if (err instanceof AppError && err.isOperational) {
    const body: ErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err instanceof ValidationError) {
      body.error.fields = err.fields;
    }

    if (err instanceof RateLimitError) {
      body.error.retry_after = err.retry_after;
      res.setHeader('Retry-After', String(err.retry_after));
    }

    if (err instanceof AccountLockedError && err.locked_until) {
      body.error.locked_until = err.locked_until.toISOString();
    }

    log.warn({ code: err.code, status: err.statusCode, path: req.path }, err.message);
    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected / programming errors — never leak internals
  log.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    },
  });
}
