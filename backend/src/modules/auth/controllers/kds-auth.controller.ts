// ============================================================
// src/modules/auth/controllers/kds-auth.controller.ts
// Handles strictly scoped branch-level authentication for the KDS
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validate } from '../validators/auth.validators';
import { KdsLoginSchema } from '../validators/kds-auth.validators';
import { loginWithEmail } from '../services/auth.service';
import { RuntimeAuthService } from '../services/runtime-auth.service';
import { AuthenticationError } from '../../../shared/errors/AppError';
import { ResponseFormatter } from '../../../shared/utils/response-formatter';
import { logger as log } from '../../../shared/utils/logger';

function getIp(req: Request): string {
  return req.ip ?? '';
}

function getUa(req: Request): string {
  return req.headers['user-agent'] ?? '';
}

export async function loginKds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = validate(KdsLoginSchema, req.body);
    const ip = getIp(req);
    const ua = getUa(req);

    // 1. Validate credentials via the core auth service (verifies password, rate limits, audit logs)
    const loginResult = await loginWithEmail(
      {
        email: body.email,
        password: body.password,
        device_fingerprint: body.device_fingerprint,
        remember_me: body.remember_me
      },
      ip,
      ua
    );

    const user = loginResult.user;

    // 2. Role constraints: Only specific operational roles can access KDS
    const allowedRoles = ['kds', 'manager', 'admin', 'TENANT_ADMIN', 'RESTAURANT_MANAGER'];
    if (!allowedRoles.includes(user.role)) {
      log.warn({ userId: user.id, role: user.role }, 'KDS Login rejected: Unauthorized role');
      throw new AuthenticationError('User role is not authorized for KDS access');
    }

    // 3. Tenant matching (if provided, though typically we trust the user's bound tenant)
    if (body.tenantId && user.tenant_id !== body.tenantId) {
      log.warn({ userId: user.id, expectedTenant: user.tenant_id, providedTenant: body.tenantId }, 'KDS Login rejected: Tenant mismatch');
      throw new AuthenticationError('User does not belong to the specified restaurant');
    }

    // 4. Branch Ownership validation (Crucial for isolation)
    if (!user.branchIds || !user.branchIds.includes(body.branchId)) {
      log.warn({ userId: user.id, branchId: body.branchId, userBranchIds: user.branchIds }, 'KDS Login rejected: Branch isolation violation');
      throw new AuthenticationError('User does not have access to the selected branch');
    }

    // 5. Generate strict Runtime JWT scoped to the branch
    const runtimeJwt = await RuntimeAuthService.exchangeForRuntimeSession(
      loginResult.access_token,
      body.branchId,
      loginResult.device_session_id
    );

    log.info({ userId: user.id, branchId: body.branchId, tenantId: user.tenant_id }, 'KDS Login successful, issued branch-scoped runtime session');

    res.status(200).json(ResponseFormatter.success({
      access_token: loginResult.access_token,
      refresh_token: loginResult.refresh_token,
      runtime_token: runtimeJwt,
      user: {
        id: user.id,
        tenantId: user.tenant_id,
        branchId: body.branchId,
        role: user.role,
        full_name: user.full_name
      }
    }, 'KDS Login successful'));
  } catch (err) {
    next(err);
  }
}
