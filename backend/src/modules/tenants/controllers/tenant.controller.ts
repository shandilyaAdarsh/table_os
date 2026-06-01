import type { Request, Response, NextFunction } from 'express';
import * as service from '../services/tenant.service';

export async function getTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const tenant = await service.getTenantById(tenantId);
    res.json({ data: tenant });
  } catch (err) {
    next(err);
  }
}

export async function getCurrentContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.context.tenantId;
    
    // Use console.log for quick debugging of the failing tenant ID
    console.log(`[getCurrentContext] Resolving context for tenantId: ${tenantId}, user: ${req.context.id}`);

    if (!tenantId) {
      res.status(403).json({ success: false, error: { message: "No tenant context" } });
      return;
    }
    const tenant = await service.getTenantById(tenantId);

    // Format for AppContextDto expected by Flutter frontend
    const contextDto = {
      user: {
        id: req.context.id,
        full_name: req.context.full_name || 'Admin',
        role: req.context.role,
        must_change_password: req.context.must_change_password || false,
        is_first_login: req.context.is_first_login || false
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: (tenant as any).subscription_tier || 'standard',
        status: tenant.status || 'active',
        is_active: tenant.status === 'active',
        dismissed_qr_banner: (tenant as any).dismissed_qr_banner ?? false
      },
      onboarding: {
        is_complete: tenant.onboarding_completed ?? false,
        is_skipped: false,
        step: tenant.onboarding_step ?? 1,
        steps_completed: []
      },
      flags: {
        must_change_password: req.context.must_change_password || false,
        is_first_login: req.context.is_first_login || false,
        subscription_expired: false,
        account_suspended: tenant.status === 'suspended',
        onboarding_required: tenant.onboarding_completed === false
      }
    };

    res.json({ success: true, data: contextDto });
  } catch (err) {
    next(err);
  }
}

export async function listBranches(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const branches = await service.getTenantBranches(tenantId);
    res.json({ data: branches });
  } catch (err) {
    next(err);
  }
}

export async function createTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenant = await service.provisionTenant(req.body);
    res.status(201).json({ data: tenant });
  } catch (err) {
    next(err);
  }
}

export async function createBranch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = String(req.params.tenantId);
    const branch = await service.addBranchToTenant({ ...req.body, tenant_id: tenantId });
    res.status(201).json({ data: branch });
  } catch (err) {
    next(err);
  }
}
