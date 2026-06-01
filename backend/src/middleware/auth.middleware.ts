// ============================================================
// src/middleware/auth.middleware.ts
// Request authentication and authorization middleware.
// Validates JWT server-side against Supabase Auth + admin_profiles.
// All tenant/permission context is extracted from verified server data.
// NEVER trusts frontend-provided values.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import {
  AuthenticationError,
  ForbiddenError,
  MustChangePasswordError,
} from '../shared/errors/AppError';
import type { AuthContext, Permission, Role } from '../types/rbac.types';
import { ROLES, ROLE_HIERARCHY } from '../types/rbac.types';

// ─── Augment Express Request ──────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /**
       * Verified, server-sourced auth context.
       * NEVER populate from req.body or req.query.
       */
      context: AuthContext & { full_name: string; must_change_password: boolean };
      accessToken: string;
      device_fingerprint: string;
      ip_address: string;
    }
  }
}

// ─── authenticate ─────────────────────────────────────────────

import { RuntimeAuthService } from '../modules/auth/services/runtime-auth.service';
import { validateAccessToken } from '../modules/auth/services/auth.service';
import { resolvePermissions } from '../utils/permission-checker';

/**
 * Core authentication middleware.
 *
 * Flow:
 * 1. Extract Bearer token.
 * 2. Try validating as a deterministic Runtime JWT (fast, no DB lookups).
 * 3. Fallback to validating as a Supabase JWT via validateAccessToken (Admin App).
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);
    const deviceFingerprint = req.headers['x-device-fingerprint'] as string | undefined;

    if (!deviceFingerprint) {
      throw new AuthenticationError('Missing X-Device-Fingerprint header');
    }

    // ── Step 1: Validate deterministic Runtime JWT
    let context: Request['context'];
    try {
      const payload = RuntimeAuthService.verifyRuntimeSession(token);
      context = {
        id:                   payload.sub,
        userId:               payload.sub,
        email:                '', // Payload no longer carries email to remain lightweight
        role:                 payload.role as Role,
        tenantId:             payload.tenant_id,
        tenant_id:            payload.tenant_id,
        branchIds:            [payload.branch_id], // The runtime context operates in ONE strict branch
        permissions:          new Set(payload.permissions) as unknown as Set<Permission>,
        device_session_id:    payload.session_id,
        full_name:            '', 
        must_change_password: false,
        accessToken:          token,
      };
    } catch (runtimeErr) {
      // Fallback for Admin App: Validate Supabase JWT
      const validation = await validateAccessToken(token);
      if (!validation.valid) {
        throw new AuthenticationError('Invalid authentication token');
      }
      context = {
        id:                   validation.user_id!,
        userId:               validation.user_id!,
        email:                validation.email ?? '',
        role:                 validation.role as Role,
        tenantId:             validation.tenant_id!,
        tenant_id:            validation.tenant_id!,
        branchIds:            validation.branch_ids ?? [],
        permissions:          await resolvePermissions(validation.user_id!, validation.tenant_id ?? null),
        device_session_id:    '', // Admin app doesn't rely on strict single device sessions here
        full_name:            validation.full_name ?? 'Admin',
        must_change_password: validation.must_change_password ?? false,
        accessToken:          token,
      };
    }

    req.context           = context;
    req.accessToken       = token;
    req.device_fingerprint = deviceFingerprint;
    // req.ip is set by Express using trust proxy
    req.ip_address = req.ip ?? '';

    next();
  } catch (err) {
    next(err);
  }
}

// ─── requireRole ─────────────────────────────────────────────

/**
 * Exact-role guard. Prefer requireMinRole for hierarchical checks.
 * Use requirePermission for fine-grained capability checks.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    if (req.context.role === ROLES.SUPER_ADMIN || allowedRoles.includes(req.context.role)) {
      return next();
    }

    return next(
      new ForbiddenError(
        `Role '${req.context.role}' is not permitted. Required: ${allowedRoles.join(', ')}`
      )
    );
  };
}

// ─── requireMinRole ───────────────────────────────────────────

/**
 * Hierarchy-aware role guard.
 * Passes if the user's role has a hierarchy score >= the required role.
 *
 * Example: requireMinRole(ROLES.MANAGER) allows MANAGER, RESTAURANT_ADMIN, SUPER_ADMIN.
 */
export function requireMinRole(minimumRole: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    const userLevel    = ROLE_HIERARCHY[req.context.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 0;

    if (userLevel >= requiredLevel) {
      return next();
    }

    return next(
      new ForbiddenError(
        `Minimum role '${minimumRole}' required. Your role: '${req.context.role}'`
      )
    );
  };
}

// ─── requirePermission ────────────────────────────────────────

/**
 * Single-permission guard. SUPER_ADMIN bypasses all permission checks.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    if (req.context.role === ROLES.SUPER_ADMIN) return next();

    if (req.context.permissions.has(permission)) return next();

    return next(new ForbiddenError(`Missing permission: ${permission}`));
  };
}

// ─── requireAllPermissions ────────────────────────────────────

/**
 * AND-combination permission guard — user must have ALL listed permissions.
 */
export function requireAllPermissions(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    if (req.context.role === ROLES.SUPER_ADMIN) return next();

    const missing = perms.filter((p) => !req.context.permissions.has(p));

    if (missing.length === 0) return next();

    return next(new ForbiddenError(`Missing permissions: ${missing.join(', ')}`));
  };
}

// ─── requireAnyPermission ─────────────────────────────────────

/**
 * OR-combination permission guard — user must have AT LEAST ONE listed permission.
 */
export function requireAnyPermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    if (req.context.role === ROLES.SUPER_ADMIN) return next();

    const hasAny = perms.some((p) => req.context.permissions.has(p));

    if (hasAny) return next();

    return next(
      new ForbiddenError(`Requires at least one of: ${perms.join(', ')}`)
    );
  };
}

// ─── requireTenantAccess ──────────────────────────────────────

/**
 * Guards a tenant-scoped route.
 * SECURITY: Only reads tenant ID from ROUTE PARAMS — never from body or query.
 * Prevents tenant-hopping.
 */
export function requireTenantAccess(tenantIdParam = 'tenantId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    if (req.context.role === ROLES.SUPER_ADMIN) return next();

    // Only trust route params — never body or query
    const requestedTenantId = req.params[tenantIdParam] as string | undefined;

    if (!requestedTenantId || req.context.tenantId !== requestedTenantId) {
      return next(new ForbiddenError('Access to this tenant is not permitted'));
    }

    next();
  };
}

// ─── requireBranchAccess ─────────────────────────────────────

/**
 * Guards a branch-scoped route.
 * Checks that the branch param is within the user's authorized branch IDs.
 * RESTAURANT_ADMIN and SUPER_ADMIN bypass this check.
 */
export function requireBranchAccess(branchIdParam = 'branchId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(new AuthenticationError());

    // Super admin and restaurant admin can access all branches
    if (
      req.context.role === ROLES.SUPER_ADMIN ||
      req.context.role === ROLES.RESTAURANT_ADMIN ||
      req.context.role === ROLES.MANAGER
    ) {
      return next();
    }

    const requestedBranchId = req.params[branchIdParam] as string | undefined;

    if (!requestedBranchId) {
      return next(new ForbiddenError('Branch ID is required'));
    }

    if (!req.context.branchIds.includes(requestedBranchId)) {
      return next(new ForbiddenError('Access to this branch is not permitted'));
    }

    next();
  };
}

// ─── requirePasswordChanged ───────────────────────────────────

export function requirePasswordChanged(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.context?.must_change_password) {
    return next(new MustChangePasswordError());
  }
  next();
}

// ─── Convenience role sets ────────────────────────────────────

export const superAdminOnly = requireRole(ROLES.SUPER_ADMIN);

export const internalEngineeringOrAbove = requireMinRole(ROLES.INTERNAL_ENGINEERING);

export const adminOrAbove = requireMinRole(ROLES.RESTAURANT_ADMIN);

export const managerOrAbove = requireMinRole(ROLES.MANAGER);

/** All operational roles that interact with the restaurant daily */
export const operationalStaff = requireRole(
  ROLES.SUPER_ADMIN,
  ROLES.RESTAURANT_ADMIN,
  ROLES.MANAGER,
  ROLES.CASHIER,
  ROLES.SERVER,
  ROLES.KITCHEN,
  ROLES.CUSTOMER_SUPPORT,
  ROLES.STAFF,
);
