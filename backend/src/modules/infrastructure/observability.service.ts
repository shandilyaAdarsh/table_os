// ============================================================
// src/modules/infrastructure/observability.service.ts
// Production-grade context propagation using AsyncLocalStorage
// and structured JSON logging wrapping standard logger.
// ============================================================

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/utils/logger';
import type { CorrelationContext } from './infrastructure.types';

// Establish global AsyncLocalStorage for context propagation
const contextStore = new AsyncLocalStorage<CorrelationContext>();

export const ObservabilityService = {
  /**
   * Run a function with the specified correlation context bound to the async execution context.
   */
  runWithContext<T>(context: CorrelationContext, fn: () => T): T {
    return contextStore.run(context, fn);
  },

  /**
   * Retrieve the active correlation context.
   */
  getContext(): CorrelationContext | null {
    return contextStore.getStore() ?? null;
  },

  /**
   * Generate a fresh fallback correlation context.
   */
  generateFallbackContext(tenantId?: string | null, branchId?: string | null): CorrelationContext {
    return {
      correlationId: crypto.randomUUID(),
      tenantId: tenantId ?? null,
      branchId: branchId ?? null,
      actorId: null,
      actorType: 'system'
    };
  },

  /**
   * Log structured information with automatically propagated context.
   */
  info(message: string, metadata?: Record<string, any>): void {
    const context = this.getContext();
    logger.info({
      correlation: context ? {
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        branchId: context.branchId,
        actorId: context.actorId,
        actorType: context.actorType
      } : undefined,
      ...metadata
    }, message);
  },

  /**
   * Log structured warning with automatically propagated context.
   */
  warn(message: string, metadata?: Record<string, any>): void {
    const context = this.getContext();
    logger.warn({
      correlation: context ? {
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        branchId: context.branchId,
        actorId: context.actorId,
        actorType: context.actorType
      } : undefined,
      ...metadata
    }, message);
  },

  /**
   * Log structured error with automatically propagated context and error details.
   */
  error(message: string, error?: any, metadata?: Record<string, any>): void {
    const context = this.getContext();
    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { raw: error };

    logger.error({
      correlation: context ? {
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        branchId: context.branchId,
        actorId: context.actorId,
        actorType: context.actorType
      } : undefined,
      error: errorDetails,
      ...metadata
    }, message);
  },

  /**
   * Express middleware to capture and inject request-scoped tracing context.
   */
  observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
    const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
    const tenantId = (req.headers['x-tenant-id'] as string) || req.context?.tenantId || null;
    const branchId = (req.headers['x-branch-id'] as string) || (req.headers['x-branch-ids'] as string)?.split(',')[0] || null;
    const actorId = (req.headers['x-actor-id'] as string) || req.context?.userId || null;
    const actorType = (req.headers['x-actor-type'] as any) || (req.context ? 'staff' : 'anonymous');

    const context: CorrelationContext = {
      correlationId,
      tenantId,
      branchId,
      actorId,
      actorType,
      ipAddress: req.ip || req.socket.remoteAddress || undefined,
      userAgent: req.headers['user-agent'] || undefined
    };

    // Inject headers to response so clients can trace
    res.setHeader('x-correlation-id', correlationId);

    // Bind request to AsyncLocalStorage
    contextStore.run(context, () => {
      next();
    });
  },

  /**
   * Enriches standard AppError or raw exceptions with active context.
   */
  enrichError(error: any): any {
    const context = this.getContext();
    if (error && typeof error === 'object' && context) {
      error.correlationId = context.correlationId;
      error.tenantId = context.tenantId;
      error.branchId = context.branchId;
    }
    return error;
  }
};
export default ObservabilityService;
