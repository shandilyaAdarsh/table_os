import * as repo from '../repositories/tenant.repository';
import type { Tenant, Branch, CreateTenantRequest, CreateBranchRequest } from '../types';
import { NotFoundError } from '../../../shared/errors/AppError';

export async function getTenantById(id: string): Promise<Tenant> {
  const tenant = await repo.findTenantById(id);
  if (!tenant) throw new NotFoundError('Tenant');
  return tenant;
}

export async function getTenantBranches(tenantId: string): Promise<Branch[]> {
  // Authorization is handled by middleware (requireTenantAccess)
  // so we can trust tenantId here.
  return repo.findBranchesByTenantId(tenantId);
}

export async function provisionTenant(req: CreateTenantRequest): Promise<Tenant> {
  // Business logic for provisioning a new tenant (e.g. creating default branches, settings)
  const tenant = await repo.createTenant(req);
  return tenant;
}

export async function addBranchToTenant(req: CreateBranchRequest): Promise<Branch> {
  // Ensure tenant exists
  await getTenantById(req.tenant_id);
  return repo.createBranch(req);
}

export async function updateBranch(tenantId: string, branchId: string, updates: Partial<Branch>): Promise<Branch> {
  // Tenant access is enforced by authenticate + tenantContext middleware.
  const branch = await repo.updateBranch(tenantId, branchId, updates);
  if (!branch) throw new NotFoundError('Branch');
  return branch;
}

export async function deleteBranch(tenantId: string, branchId: string): Promise<void> {
  await repo.deleteBranch(tenantId, branchId);
}
