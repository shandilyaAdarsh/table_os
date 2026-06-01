// ============================================================
// src/modules/context/context.controller.ts
//
// Bootstrap controller — single source of truth for admin app initialization.
//
// CONTRACT:
//   GET /api/v1/context/bootstrap
//   GET /api/v1/tenants/current   (alias)
//
// This is the ONLY endpoint the Flutter admin app should call during startup.
// All routing decisions (onboarding, dashboard, suspension, etc.) derive from
// this single deterministic payload. Do NOT split across multiple endpoints.
//
// SECURITY:
//   • Requires valid Supabase JWT via authenticate middleware.
//   • All tenant/branch data derived from server-side DB — never from JWT claims.
//   • No demo/fallback tenants ever returned. New users get hasTenant=false.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { findAdminProfileById } from '../auth/repositories/auth.repository';
import { logger as log } from '../../shared/utils/logger';
import { skippedTenantsFallback } from '../admin/onboarding/onboarding.admin.service';

// ─── Response shape (mirrors AppContextDto in Flutter) ───────

interface BootstrapResponse {
  success: true;
  data: {
    authenticated: true;
    has_tenant: boolean;
    requires_onboarding: boolean;
    bootstrap_version: number;
    user: {
      id: string;
      full_name: string;
      role: string;
      must_change_password: boolean;
    };
    tenant: {
      id: string;
      name: string;
      slug: string;
      plan: string;
      status: string;
      is_active: boolean;
    } | null;
    branches: Array<{
      id: string;
      name: string;
      timezone: string;
      status: string;
    }>;
    onboarding: {
      is_complete: boolean;
      is_skipped: boolean;
      steps_completed: string[];
    };
    flags: {
      must_change_password: boolean;
      subscription_expired: boolean;
      account_suspended: boolean;
      onboarding_required: boolean;
    };
  };
}

// Current bootstrap schema version.
// Increment when the payload shape changes to invalidate stale client caches.
const BOOTSTRAP_VERSION = 1;

// ─── Controller ───────────────────────────────────────────────

export async function bootstrap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.context.userId;

  log.info({ userId }, '[Bootstrap] Request received');

  try {
    // ── 1. Load admin profile (already validated by authenticate) ──────────
    const profile = await findAdminProfileById(userId);

    if (!profile) {
      log.warn({ userId }, '[Bootstrap] No admin profile found — rejecting');
      res.status(403).json({
        success: false,
        error: { code: 'NO_ADMIN_PROFILE', message: 'No admin profile found for this user.' },
      });
      return;
    }

    log.info({ userId, tenantId: profile.tenant_id, role: profile.role }, '[Bootstrap] Profile loaded');

    // ── 2. Resolve tenant ──────────────────────────────────────────────────
    const tenantId = profile.tenant_id;
    const hasTenant = Boolean(tenantId);

    let tenant: BootstrapResponse['data']['tenant'] = null;
    let branches: BootstrapResponse['data']['branches'] = [];
    let onboarding: BootstrapResponse['data']['onboarding'] = {
      is_complete: false,
      is_skipped: false,
      steps_completed: [],
    };

    if (hasTenant) {
      // 2a. Load tenant
      const { data: tenantData, error: tenantError } = await supabaseAdmin
        .from('tenants')
        .select('id, name, slug, status, created_at')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenantError) {
        log.error({ userId, tenantId, error: tenantError }, '[Bootstrap] Tenant lookup failed');
        throw new Error(`Tenant lookup failed: ${tenantError.message}`);
      }

      if (tenantData) {
        tenant = {
          id: tenantData.id,
          name: tenantData.name,
          slug: tenantData.slug,
          plan: 'standard', // Reserved for future billing integration
          status: tenantData.status,
          is_active: tenantData.status !== 'suspended' && tenantData.status !== 'deleted',
        };
        log.info({ userId, tenantId, name: tenantData.name }, '[Bootstrap] Tenant resolved');
      } else {
        // Tenant record missing — treat as no-tenant (may have been deleted)
        log.warn({ userId, tenantId }, '[Bootstrap] Tenant record not found — treating as hasTenant=false');
      }

      // 2b. Load branches
      const { data: branchData, error: branchError } = await supabaseAdmin
        .from('branches')
        .select('id, name, timezone, status')
        .eq('tenant_id', tenantId)
        .neq('status', 'deleted');

      if (branchError) {
        log.error({ userId, tenantId, error: branchError }, '[Bootstrap] Branch lookup failed');
        throw new Error(`Branch lookup failed: ${branchError.message}`);
      }

      branches = (branchData ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        timezone: b.timezone,
        status: b.status,
      }));
      log.info({ userId, tenantId, branchCount: branches.length }, '[Bootstrap] Branches resolved');

      // 2c. Load onboarding state
      const { data: onboardingData, error: onboardingError } = await supabaseAdmin
        .from('onboarding_state')
        .select('is_complete, steps_completed, is_skipped')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (onboardingError || !onboardingData) {
        log.warn({ userId, tenantId, error: onboardingError }, '[Bootstrap] Onboarding lookup failed — defaulting to incomplete');
        const isSkipped = tenantId ? skippedTenantsFallback.has(tenantId) : false;
        onboarding = {
          is_complete: false,
          is_skipped: isSkipped,
          steps_completed: [],
        };
      } else {
        onboarding = {
          is_complete: onboardingData.is_complete ?? false,
          is_skipped: onboardingData.is_skipped ?? false,
          steps_completed: (onboardingData.steps_completed as string[]) ?? [],
        };
      }
      log.info({ userId, tenantId, onboardingComplete: onboarding.is_complete, onboardingSkipped: onboarding.is_skipped }, '[Bootstrap] Onboarding state resolved');
    }

    // ── 3. Compute flags ───────────────────────────────────────────────────
    const requiresOnboarding = hasTenant ? (!onboarding.is_complete && !onboarding.is_skipped) : false;
    const subscriptionExpired = Boolean(tenant && tenant.status === 'suspended');
    const accountSuspended = !profile.is_active || profile.is_locked;

    const flags = {
      must_change_password: profile.must_change_password ?? false,
      subscription_expired: subscriptionExpired,
      account_suspended: accountSuspended,
      onboarding_required: requiresOnboarding,
    };

    // ── 4. Build response ──────────────────────────────────────────────────
    const response: BootstrapResponse = {
      success: true,
      data: {
        authenticated: true,
        has_tenant: Boolean(tenant),
        requires_onboarding: requiresOnboarding,
        bootstrap_version: BOOTSTRAP_VERSION,
        user: {
          id: profile.id,
          full_name: profile.full_name,
          role: profile.role,
          must_change_password: profile.must_change_password ?? false,
        },
        tenant,
        branches,
        onboarding,
        flags,
      },
    };

    log.info(
      { userId, hasTenant: response.data.has_tenant, requiresOnboarding, flags },
      '[Bootstrap] Response sent'
    );

    res.status(200).json(response);
  } catch (err) {
    log.error({ userId, err }, '[Bootstrap] Unhandled error in bootstrap controller');
    next(err);
  }
}
