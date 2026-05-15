// ============================================================
// src/middleware/rbac.middleware.ts
// Composable RBAC middleware helpers.
// Use these in route definitions for declarative authorization.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { assertBranchAccess } from '../modules/rbac/services/branch-access.service';
import { assertTenantMember } from '../modules/rbac/services/tenant-membership.service';
import { ForbiddenError, AuthenticationError } from '../shared/errors/AppError';
import { ROLES } from '../types/rbac.types';
import type { Permission } from '../types/rbac.types';

// ─── assertTenantMembership ───────────────────────────────────

/**
 * Middleware that validates the user is an active tenant_users member.
 * Unlike requireTenantAccess (which checks JWT claim matching),
 * this hits the DB to verify live membership status.
 *
 * Use for: routes where membership could have changed since JWT was issued.
 */
export function assertTenantMembership(tenantIdParam = 'tenantId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) return next(new AuthenticationError());

      if (req.context.role === ROLES.SUPER_ADMIN) return next();

      const tenantId = req.params[tenantIdParam] ?? req.context.tenantId;
      if (!tenantId) return next(new ForbiddenError('Tenant ID is required'));

      await assertTenantMember(req.context.userId, tenantId);

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── assertBranch ─────────────────────────────────────────────

/**
 * Middleware that validates branch access against the database.
 * More strict than requireBranchAccess (which only checks the JWT claim).
 *
 * Use for: write operations where branch tampering is high-risk.
 */
export function assertBranch(branchIdParam = 'branchId', tenantIdParam = 'tenantId') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.context) return next(new AuthenticationError());

      const tenantId  = req.params[tenantIdParam] ?? req.context.tenantId;
      const branchId  = req.params[branchIdParam];

      if (!tenantId || !branchId) {
        return next(new ForbiddenError('Tenant ID and Branch ID are required'));
      }

      await assertBranchAccess(req.context.userId, tenantId, branchId, req.context.role);

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ─── requireOwnership ─────────────────────────────────────────

/**
 * Validates that the requesting user owns the resource.
 * Pass a function that extracts the owner ID from the request.
 * Managers and above bypass ownership checks.
 */
export function requireOwnership(
  extractOwnerId: (req: Request) => string | undefined
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    // Managers and above bypass ownership checks
    const bypassRoles: string[] = [
      ROLES.SUPER_ADMIN,
      ROLES.RESTAURANT_ADMIN,
      ROLES.MANAGER,
    ];

    if (bypassRoles.includes(req.context.role)) return next();

    const ownerId = extractOwnerId(req);

    if (!ownerId || ownerId !== req.context.userId) {
      return next(new ForbiddenError('You do not own this resource'));
    }

    next();
  };
}

// ─── requirePermissions (composable, variadic) ────────────────

/**
 * Variadic permission check — supports AND and OR modes.
 *
 * @param mode 'ALL' = user must have all listed perms, 'ANY' = at least one.
 */
export function requirePermissions(
  mode: 'ALL' | 'ANY',
  ...perms: Permission[]
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    if (req.context.role === ROLES.SUPER_ADMIN) return next();

    if (mode === 'ALL') {
      const missing = perms.filter((p) => !req.context.permissions.has(p));
      if (missing.length > 0) {
        return next(new ForbiddenError(`Missing required permissions: ${missing.join(', ')}`));
      }
    } else {
      const hasAny = perms.some((p) => req.context.permissions.has(p));
      if (!hasAny) {
        return next(new ForbiddenError(`Requires at least one of: ${perms.join(', ')}`));
      }
    }

    next();
  };
}
