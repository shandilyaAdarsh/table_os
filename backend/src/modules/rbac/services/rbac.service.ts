// ============================================================
// src/modules/rbac/services/rbac.service.ts
// Orchestrates role assignment, branch access, and permission resolution.
// Single entry point for all RBAC mutations.
// ============================================================

import {
  setTenantRole,
  removeTenantMembership,
} from '../repositories/rbac.repository';
import { grantBranchAccess, revokeAllBranchAccess } from './branch-access.service';
import { resolvePermissions } from '../../../utils/permission-checker';
import { permissionCache } from '../../../utils/permission-cache';
import { writeAuditLog } from '../../auth/repositories/auth.repository';
import { ForbiddenError, ValidationError } from '../../../shared/errors/AppError';
import { ROLE_HIERARCHY } from '../../../types/rbac.types';
import type { Role } from '../../../types/rbac.types';
import type { RoleAssignmentRequest } from '../rbac.types';
import { logger } from '../../../shared/utils/logger';

// ─── Role Guard ───────────────────────────────────────────────

/**
 * Prevents role escalation: a user may not assign a role
 * with a higher hierarchy score than their own role.
 */
function assertNoRoleEscalation(grantorRole: Role, targetRole: Role): void {
  const grantorLevel = ROLE_HIERARCHY[grantorRole] ?? 0;
  const targetLevel  = ROLE_HIERARCHY[targetRole]  ?? 0;

  if (targetLevel >= grantorLevel) {
    throw new ForbiddenError(
      `Role escalation denied: cannot assign role '${targetRole}' (your role: '${grantorRole}')`
    );
  }
}

// ─── Assign Role + Branch Access ──────────────────────────────

/**
 * Assigns a role to a user within a tenant and sets branch access.
 * Prevents role escalation — grantorRole must be higher in hierarchy.
 */
export async function assignTenantRole(
  request: RoleAssignmentRequest,
  grantorRole: Role
): Promise<void> {
  const { targetUserId, tenantId, role, branchIds = [], grantedBy } = request;

  // Validate role is a known value
  if (!ROLE_HIERARCHY[role as Role]) {
    throw new ValidationError({ role: `Unknown role: ${role}` });
  }

  // Prevent escalation
  assertNoRoleEscalation(grantorRole, role as Role);

  // Persist role in tenant_users
  await setTenantRole(targetUserId, tenantId, role);

  // Set branch access (revoke old, grant new)
  await revokeAllBranchAccess(targetUserId, tenantId);
  if (branchIds.length > 0) {
    await grantBranchAccess(targetUserId, tenantId, branchIds);
  }

  // Invalidate permission cache
  permissionCache.invalidate(targetUserId, tenantId);

  await writeAuditLog({
    userId: grantedBy,
    tenantId,
    eventType: 'SUSPICIOUS_ACTIVITY', // reuse audit log; real projects add ROLE_ASSIGNED event
    metadata: { action: 'ROLE_ASSIGNED', targetUserId, role, branchIds },
  });

  logger.info({ grantedBy, targetUserId, tenantId, role, branchIds }, 'Role assigned');
}

// ─── Revoke Membership ────────────────────────────────────────

/**
 * Removes a user from a tenant entirely.
 * Revokes all branch access and invalidates permission cache.
 */
export async function revokeTenantMembership(
  targetUserId: string,
  tenantId: string,
  revokedBy: string
): Promise<void> {
  await revokeAllBranchAccess(targetUserId, tenantId);
  await removeTenantMembership(targetUserId, tenantId);
  permissionCache.invalidate(targetUserId, tenantId);

  await writeAuditLog({
    userId: revokedBy,
    tenantId,
    eventType: 'SUSPICIOUS_ACTIVITY',
    metadata: { action: 'MEMBERSHIP_REVOKED', targetUserId },
  });

  logger.info({ revokedBy, targetUserId, tenantId }, 'Tenant membership revoked');
}

// ─── Re-export helpers ────────────────────────────────────────

export { resolvePermissions };
