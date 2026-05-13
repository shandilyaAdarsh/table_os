// ============================================================
// src/middleware/auth.middleware.ts
// Request authentication and authorization middleware.
// NEVER trusts frontend auth state. Always verifies JWT server-side
// against both Supabase Auth AND our admin_profiles table.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validateAccessToken } from '../modules/auth/services/auth.service';
import { findActiveDeviceSession } from '../modules/auth/repositories/auth.repository';
import {
  AuthenticationError,
  ForbiddenError,
  SessionRevokedError,
  MustChangePasswordError,
} from '../shared/errors/AppError';
import type { AdminRole, AuthenticatedUser } from '../types/auth.types';
import { moduleLogger } from '../utils/logger';

const log = moduleLogger('auth-middleware');

// ─── Extend Express Request ───────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      auth: AuthenticatedUser;
      device_fingerprint: string;
      ip_address: string;
    }
  }
}

// ─── authenticate ─────────────────────────────────────────────

/**
 * Validates Bearer JWT and cross-checks with admin_profiles.
 * Populates req.auth with the authenticated user context.
 * Verifies device session integrity to prevent replay attacks.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);
    const deviceFingerprint = req.headers['x-device-fingerprint'] as string | undefined;
    const deviceSessionId = req.headers['x-device-session-id'] as string | undefined;

    if (!deviceFingerprint) {
      throw new AuthenticationError('Missing device fingerprint');
    }

    // 1. Validate JWT via Supabase + cross-check admin_profiles
    const validation = await validateAccessToken(token);

    if (!validation.valid || !validation.user_id) {
      throw new AuthenticationError(validation.error ?? 'Invalid or expired token');
    }

    // 2. Verify device session integrity (anti-replay)
    if (deviceSessionId) {
      const deviceSession = await findActiveDeviceSession(deviceSessionId, deviceFingerprint);

      if (!deviceSession) {
        log.warn(
          { userId: validation.user_id, deviceSessionId },
          'Device session not found or revoked'
        );
        throw new SessionRevokedError();
      }
    }

    // 3. Populate request context — must_change_password comes from DB, never JWT
    req.auth = {
      id: validation.user_id,
      email: validation.email!,
      role: validation.role!,
      tenant_id: validation.tenant_id ?? null,
      full_name: validation.full_name ?? '',
      must_change_password: validation.must_change_password ?? false,
      device_session_id: deviceSessionId,
    };

    req.device_fingerprint = deviceFingerprint;
    req.ip_address = (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '';

    next();
  } catch (err) {
    next(err);
  }
}

// ─── requireRole ─────────────────────────────────────────────

/**
 * Require one or more roles to access a route.
 * Usage: router.get('/admin', authenticate, requireRole('SUPER_ADMIN'), handler)
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new AuthenticationError());

    if (!allowedRoles.includes(req.auth.role)) {
      return next(
        new ForbiddenError(
          `Role '${req.auth.role}' not permitted. Required: ${allowedRoles.join(', ')}`
        )
      );
    }

    next();
  };
}

// ─── requireTenantAccess ──────────────────────────────────────

/**
 * Enforce tenant scoping. SUPER_ADMIN bypasses.
 * Usage: router.get('/:tenantId/data', authenticate, requireTenantAccess(), handler)
 */
export function requireTenantAccess(tenantIdParam = 'tenantId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new AuthenticationError());

    // SUPER_ADMIN can access any tenant
    if (req.auth.role === 'SUPER_ADMIN') return next();

    const requestedTenantId =
      (req.params[tenantIdParam] as string | undefined) ??
      (req.body as Record<string, unknown>)?.tenant_id;

    if (!requestedTenantId || req.auth.tenant_id !== requestedTenantId) {
      return next(new ForbiddenError('Access to this tenant is not permitted'));
    }

    next();
  };
}

// ─── requirePasswordChanged ───────────────────────────────────

/**
 * Block route access if must_change_password is set.
 * Apply after authenticate on all protected routes.
 */
export function requirePasswordChanged(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.auth?.must_change_password) {
    return next(new MustChangePasswordError());
  }
  next();
}

// ─── Convenience exports ──────────────────────────────────────

export const superAdminOnly = requireRole('SUPER_ADMIN');

export const adminPanelAccess = requireRole(
  'SUPER_ADMIN',
  'RESTAURANT_ADMIN',
  'MANAGER',
  'STAFF'
);
