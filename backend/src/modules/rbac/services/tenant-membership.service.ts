// ============================================================
// src/modules/rbac/services/tenant-membership.service.ts
// Verifies and enforces tenant membership rules.
// This is the single authority for "is this user in this tenant?".
// ============================================================

import { getTenantMembership, getUserTenantMemberships } from '../repositories/rbac.repository';
import { ForbiddenError } from '../../../shared/errors/AppError';
import { logger } from '../../../shared/utils/logger';
import type { TenantMembership } from '../rbac.types';

/**
 * Asserts the user is an active member of the given tenant.
 * Throws ForbiddenError if not — NEVER leaks whether the tenant exists.
 *
 * Use this as a guard in every tenant-scoped service call.
 */
export async function assertTenantMember(userId: string, tenantId: string): Promise<TenantMembership> {
  const membership = await getTenantMembership(userId, tenantId);

  if (!membership) {
    logger.warn({ userId, tenantId }, 'Tenant membership check failed — user is not a member');
    throw new ForbiddenError('Access to this tenant is not permitted');
  }

  return membership;
}

/**
 * Check membership without throwing — for conditional logic.
 */
export async function isTenantMember(userId: string, tenantId: string): Promise<boolean> {
  const membership = await getTenantMembership(userId, tenantId);
  return membership !== null;
}

/**
 * Get all tenants for a user.
 */
export async function getUserTenants(userId: string): Promise<TenantMembership[]> {
  return getUserTenantMemberships(userId);
}
