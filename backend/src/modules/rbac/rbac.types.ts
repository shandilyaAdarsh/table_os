// ============================================================
// src/modules/rbac/rbac.types.ts
// RBAC-module-specific types for repository/service contracts.
// ============================================================

export interface TenantMembership {
  tenant_id: string;
  user_id: string;
  role: string;
  status: string;
  deleted_at: string | null;
}

export interface BranchAccess {
  tenant_id: string;
  user_id: string;
  branch_id: string;
}

export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
}

export interface RoleAssignmentRequest {
  targetUserId: string;
  tenantId: string;
  role: string;
  branchIds?: string[];
  grantedBy: string;
}
