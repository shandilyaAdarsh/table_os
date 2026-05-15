// ============================================================
// src/middleware/tenant.middleware.ts
// Hardened tenant isolation middleware.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { AuthenticationError, ForbiddenError } from '../shared/errors/AppError';
import { ROLES } from '../types/rbac.types';

/**
 * Ensures that the request is scoped to a valid tenant.
 * TRUSTS ONLY the tenantId from the verified JWT context.
 * Rejects requests if tenantId is missing (except for super_admin).
 */
export function tenantContext(req: Request, _res: Response, next: NextFunction): void {
  if (!req.context) {
    return next(new AuthenticationError('Authentication context missing'));
  }

  // Super admins can bypass tenant scoping for global operations,
  // but if they are acting on a specific tenant, they should provide it.
  if (req.context.role === ROLES.SUPER_ADMIN) {
    return next();
  }

  if (!req.context.tenantId) {
    return next(new ForbiddenError('User is not associated with any tenant'));
  }

  // Security: Prevent tenant shadowing/leakage
  // If the request contains a tenantId in body or params, it MUST match the JWT tenantId.
  const requestedTenantId = req.params.tenantId || req.body.tenantId || req.query.tenantId;
  
  if (requestedTenantId && requestedTenantId !== req.context.tenantId) {
    return next(new ForbiddenError('Cross-tenant data access is strictly prohibited'));
  }

  next();
}
