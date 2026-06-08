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
import {
  skippedTenantsFallback,
  resolveOnboardingStep,
} from '../admin/onboarding/onboarding.admin.service';

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
      dismissed_qr_banner: boolean;
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
      step: number;
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
const BOOTSTRAP_VERSION = 2;

// ─── Controller ───────────────────────────────────────────────

export async function bootstrap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.context.userId;

  log.info({ userId }, '[Bootstrap] Request received');

  try {
    const startMs = Date.now();
    log.info({ userId }, `[Bootstrap] Started at ${startMs}`);

    // ── 1. Load admin profile (already validated by authenticate) ──────────
    const profile = await findAdminProfileById(userId);
    const profileMs = Date.now() - startMs;
    log.info({ userId, elapsed: profileMs }, `[Bootstrap] Admin profile resolved: ${profileMs}ms`);

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
      step: 1,
      steps_completed: [],
    };

    if (hasTenant) {
      const rpcStart = Date.now();
      
      const timeoutPromise = new Promise<{data: any, error: any}>((_, reject) => 
        setTimeout(() => reject(new Error('Bootstrap context lookup timed out after 5000ms')), 5000)
      );

      // 2a-c. Load tenant, branches, and onboarding state via single optimized RPC
      const rpcPromise = supabaseAdmin
        .rpc('get_bootstrap_context', { p_tenant_id: tenantId });
        
      try {
        const { data: rpcData, error: rpcError } = await Promise.race([rpcPromise, timeoutPromise]);

        if (rpcError) {
          log.error({ userId, tenantId, error: rpcError }, '[Bootstrap] RPC lookup failed');
          throw new Error(`Bootstrap context lookup failed: ${rpcError.message}`);
        }

        const ctx = rpcData as any;

        if (ctx.tenant) {
          tenant = {
            id: ctx.tenant.id,
            name: ctx.tenant.name,
            slug: ctx.tenant.slug,
            plan: 'standard', // Reserved for future billing integration
            status: ctx.tenant.status,
            is_active: ctx.tenant.status !== 'suspended' && ctx.tenant.status !== 'deleted',
            dismissed_qr_banner: ctx.tenant.dismissed_qr_banner ?? false,
          };
          log.info({ userId, tenantId, name: ctx.tenant.name }, '[Bootstrap] Tenant resolved');
        } else {
          log.warn({ userId, tenantId }, '[Bootstrap] Tenant record not found — treating as hasTenant=false');
        }

        branches = (ctx.branches ?? []).map((b: any) => ({
          id: b.id,
          name: b.name,
          timezone: b.timezone,
          status: b.status,
        }));
        log.info({ userId, tenantId, branchCount: branches.length }, '[Bootstrap] Branches resolved');

        const onboardingData = ctx.onboarding_state;
        if (!onboardingData) {
          log.warn({ userId, tenantId }, '[Bootstrap] Onboarding lookup failed — defaulting to incomplete');
          const isSkipped = tenantId ? skippedTenantsFallback.has(tenantId) : false;
          onboarding = {
            is_complete: false,
            is_skipped: isSkipped,
            step: resolveOnboardingStep([], false, isSkipped),
            steps_completed: [],
          };
        } else {
          const stepsCompleted = (onboardingData.steps_completed as string[]) ?? [];
          const isComplete = onboardingData.is_complete ?? false;
          const isSkipped = skippedTenantsFallback.has(tenantId as string);
          onboarding = {
            is_complete: isComplete,
            is_skipped: isSkipped,
            steps_completed: stepsCompleted,
            step: resolveOnboardingStep(stepsCompleted, isComplete, isSkipped),
          };
        }
      } catch (err: any) {
        log.error({ userId, tenantId, err }, '[Bootstrap] RPC or timeout error');
        throw err;
      }
      
      const rpcMs = Date.now() - rpcStart;
      log.info({ userId, elapsed: rpcMs }, `[Bootstrap] RPC resolved: ${rpcMs}ms`);
    }

    // ── 3. Compute flags ───────────────────────────────────────────────────
    // If the tenant is already active, we shouldn't force onboarding on them repeatedly
    // This allows existing/legacy admins to bypass the setup wizard automatically
    const requiresOnboarding = hasTenant ? 
      (!onboarding.is_complete && !onboarding.is_skipped && tenant?.status !== 'active') : false;
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

    const totalMs = Date.now() - startMs;
    log.info({ userId, elapsed: totalMs }, `[Bootstrap] Response sent: ${totalMs}ms`);

    res.status(200).json(response);
  } catch (err) {
    log.error({ userId, err }, '[Bootstrap] Unhandled error in bootstrap controller');
    next(err);
  }
}
