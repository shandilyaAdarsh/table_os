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
