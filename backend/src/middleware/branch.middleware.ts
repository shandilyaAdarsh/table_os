// ============================================================
// src/middleware/branch.middleware.ts
// Branch-level authorization middleware.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { AuthenticationError, ForbiddenError } from '../shared/errors/AppError';
import { ROLES } from '../types/rbac.types';

/**
 * Validates that the user has access to the requested branch.
 * Enforces branch-level authorization as defined in req.context.branchIds.
 */
export function requireBranchAccess(branchIdParam = 'branchId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) {
      return next(new AuthenticationError('Authentication context missing'));
    }

    // Super admins and Restaurant Admins typically have access to all branches in a tenant
    if (
      req.context.role === ROLES.SUPER_ADMIN || 
      req.context.role === ROLES.RESTAURANT_ADMIN
    ) {
      return next();
    }

    const requestedBranchId = 
      req.params[branchIdParam] || 
      req.body[branchIdParam] || 
      req.query[branchIdParam];

    if (!requestedBranchId) {
      return next(new ForbiddenError('Branch ID is required for this operation'));
    }

    // Check if the requested branch is in the user's authorized branches
    const hasAccess = req.context.branchIds.includes(requestedBranchId);

    if (!hasAccess) {
      return next(new ForbiddenError('You do not have authorization for this branch'));
    }

    next();
  };
}
