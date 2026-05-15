// ============================================================
// src/shared/context/tenant.context.ts
// Request-scoped tenant context utility.
// SINGLE source of truth for reading tenant/user context.
// ============================================================

import type { Request } from 'express';
import { AuthenticationError } from '../errors/AppError';
import type { Role, Permission } from '../../types/rbac.types';

// ─── TenantContext ────────────────────────────────────────────

/**
 * Safe accessor for request-scoped auth context.
 * Always use this — never read req.context directly in service layers.
 * Throws AuthenticationError if context is missing (should never happen
 * if authenticate middleware is applied, but guards against middleware gaps).
 */
export const TenantContext = {
  /**
   * Get the verified tenant ID from the request context.
   * Returns null for SUPER_ADMIN.
   */
  getTenantId(req: Request): string | null {
    if (!req.context) throw new AuthenticationError('Auth context not initialized');
    return req.context.tenantId;
  },

  /**
   * Get the verified user ID from the request context.
   */
  getUserId(req: Request): string {
    if (!req.context) throw new AuthenticationError('Auth context not initialized');
    return req.context.userId;
  },

  /**
   * Get the verified role from the request context.
   */
  getRole(req: Request): Role {
    if (!req.context) throw new AuthenticationError('Auth context not initialized');
    return req.context.role;
  },

  /**
   * Get the authorized branch IDs from the request context.
   */
  getBranchIds(req: Request): string[] {
    if (!req.context) throw new AuthenticationError('Auth context not initialized');
    return req.context.branchIds;
  },

  /**
   * Get the current device session ID.
   */
  getDeviceSessionId(req: Request): string | undefined {
    if (!req.context) throw new AuthenticationError('Auth context not initialized');
    return req.context.device_session_id;
  },

  /**
   * Check if the user has a specific permission.
   */
  hasPermission(req: Request, permission: Permission): boolean {
    if (!req.context) return false;
    return req.context.permissions.has(permission);
  },

  /**
   * Assert that tenant ID in context matches a given value.
   * Use in services to double-check tenant scope before DB operations.
   */
  assertTenantMatch(req: Request, tenantId: string): void {
    const ctxTenantId = TenantContext.getTenantId(req);
    // SUPER_ADMIN has no tenantId restriction
    if (ctxTenantId === null) return;
    if (ctxTenantId !== tenantId) {
      throw new AuthenticationError('Tenant context mismatch — possible tenant-hopping attempt');
    }
  },
};
