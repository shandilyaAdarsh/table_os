// ============================================================
// src/modules/auth/services/runtime-auth.service.ts
// Service for generating and validating strict Runtime JWTs.
// ============================================================

import jwt from 'jsonwebtoken';
import { env } from '../../../config/env';
import { validateAccessToken } from './auth.service';
import { resolvePermissions } from '../../../utils/permission-checker';
import { AuthenticationError, ForbiddenError } from '../../../shared/errors/AppError';
import { ROLES, type Role } from '../../../types/rbac.types';
import { logger } from '../../../shared/utils/logger';
import { supabaseAdmin } from '../../../config/supabase';

export interface RuntimeJwtPayload {
  sub: string;
  tenant_id: string;
  branch_id: string;
  role: string;
  permissions: string[];
  session_id: string;
  iat?: number;
  exp?: number;
}

export class RuntimeAuthService {
  /**
   * Exchanges a valid Supabase Access Token for a strict Runtime JWT.
   * This is the bridge between Platform Identity and Runtime Governance.
   */
  static async exchangeForRuntimeSession(
    supabaseToken: string,
    branchId: string,
    deviceSessionId: string
  ): Promise<string> {
    // 1. Verify Platform Identity via Supabase + DB profiles
    const validation = await validateAccessToken(supabaseToken);

    if (!validation.valid || !validation.user_id) {
      throw new AuthenticationError('Invalid platform credentials');
    }

    let effectiveTenantId = validation.tenant_id;
    const role = validation.role as Role;

    if (!effectiveTenantId) {
      if (role === ROLES.SUPER_ADMIN) {
        // Look up the branch's tenant dynamically
        const { data: branchData } = await supabaseAdmin
          .from('branches')
          .select('tenant_id')
          .eq('id', branchId)
          .single();
          
        if (branchData) {
          effectiveTenantId = branchData.tenant_id;
        } else {
          effectiveTenantId = '00000000-0000-0000-0000-000000000000';
        }
      } else {
        throw new ForbiddenError('User has no assigned tenant context');
      }
    }

    // 2. Resolve granular permissions
    const permissionsSet = await resolvePermissions(validation.user_id, effectiveTenantId);
    const permissions = Array.from(permissionsSet);

    // 3. Branch access governance
    if (
      role !== ROLES.SUPER_ADMIN &&
      role !== ROLES.RESTAURANT_ADMIN &&
      role !== ROLES.MANAGER
    ) {
      // Must explicitly have branch access
      const branchIds = validation.branch_ids ?? [];
      if (!branchIds.includes(branchId)) {
        logger.warn({ userId: validation.user_id, branchId }, 'Denied runtime exchange: Branch access forbidden');
        throw new ForbiddenError('You do not have access to this branch runtime');
      }
    }

    // Handle SUPERADMIN cross-branch access semantics
    if (branchId === '00000000-0000-0000-0000-000000000000' && role !== ROLES.SUPER_ADMIN) {
        throw new ForbiddenError('Cross-branch administrative context restricted to SUPERADMIN');
    }

    // 4. Construct strict envelope
    const payload: Omit<RuntimeJwtPayload, 'iat' | 'exp'> = {
      sub: validation.user_id,
      tenant_id: effectiveTenantId,
      branch_id: branchId,
      role,
      permissions,
      session_id: deviceSessionId,
    };

    // 5. Sign the custom JWT with a strict short expiry
    return jwt.sign(payload, env.RUNTIME_JWT_SECRET, { expiresIn: '1h' });
  }

  /**
   * Verifies a Runtime JWT synchronously without DB hits.
   * Fails fast if any required claim is missing or tampered.
   */
  static verifyRuntimeSession(token: string): RuntimeJwtPayload {
    try {
      const decoded = jwt.verify(token, env.RUNTIME_JWT_SECRET) as RuntimeJwtPayload;

      // Ensure deterministic contract
      if (
        !decoded.sub ||
        !decoded.tenant_id ||
        !decoded.branch_id ||
        !decoded.role ||
        !Array.isArray(decoded.permissions) ||
        !decoded.session_id
      ) {
        throw new AuthenticationError('Malformed Runtime Session envelope');
      }

      return decoded;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthenticationError('Runtime session expired');
      }
      throw new AuthenticationError('Invalid runtime session');
    }
  }
}
