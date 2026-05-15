// ============================================================
// src/modules/rbac/services/branch-access.service.ts
// Single authority for branch-level authorization checks.
// All branch access decisions must flow through this service.
// ============================================================

import {
  getUserBranchAccess,
  hasBranchAccess,
  assignBranchAccess,
  revokeBranchAccess,
} from '../repositories/rbac.repository';
import { ForbiddenError } from '../../../shared/errors/AppError';
import { permissionCache } from '../../../utils/permission-cache';
import { logger } from '../../../shared/utils/logger';

/**
 * Asserts the user has access to the given branch within the tenant.
 * RESTAURANT_ADMIN and MANAGER have implicit access to all branches
 * in their tenant — verified by checking their role from context.
 *
 * @param userRole - The role from the verified JWT context (not the request).
 */
export async function assertBranchAccess(
  userId: string,
  tenantId: string,
  branchId: string,
  userRole: string
): Promise<void> {
  // SUPER_ADMIN and RESTAURANT_ADMIN bypass branch checks
  if (userRole === 'SUPER_ADMIN' || userRole === 'RESTAURANT_ADMIN') {
    return;
  }

  // MANAGER also has all-branch access
  if (userRole === 'MANAGER') {
    return;
  }

  // All other roles must have explicit branch assignment
  const hasAccess = await hasBranchAccess(userId, tenantId, branchId);

  if (!hasAccess) {
    logger.warn({ userId, tenantId, branchId, userRole }, 'Branch access denied');
    throw new ForbiddenError('Access to this branch is not permitted');
  }
}

/**
 * Returns branch IDs the user is authorized for.
 * RESTAURANT_ADMIN / MANAGER get undefined (all branches).
 */
export async function getAuthorizedBranchIds(
  userId: string,
  tenantId: string,
  userRole: string
): Promise<string[] | undefined> {
  if (userRole === 'SUPER_ADMIN' || userRole === 'RESTAURANT_ADMIN' || userRole === 'MANAGER') {
    return undefined; // undefined = all branches
  }

  const access = await getUserBranchAccess(userId, tenantId);
  return access.map((a) => a.branch_id);
}

/**
 * Assign branch access and invalidate permission cache.
 */
export async function grantBranchAccess(
  userId: string,
  tenantId: string,
  branchIds: string[]
): Promise<void> {
  await assignBranchAccess(userId, tenantId, branchIds);
  permissionCache.invalidate(userId, tenantId);
  logger.info({ userId, tenantId, branchIds }, 'Branch access granted');
}

/**
 * Revoke all branch access and invalidate permission cache.
 */
export async function revokeAllBranchAccess(userId: string, tenantId: string): Promise<void> {
  await revokeBranchAccess(userId, tenantId);
  permissionCache.invalidate(userId, tenantId);
  logger.info({ userId, tenantId }, 'All branch access revoked');
}
