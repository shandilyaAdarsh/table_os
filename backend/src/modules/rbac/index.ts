// ============================================================
// src/modules/rbac/index.ts
// Public API for the RBAC module.
// Business modules import from here — not from sub-paths.
// ============================================================

// Services
export { assertTenantMember, isTenantMember, getUserTenants } from './services/tenant-membership.service';
export { assertBranchAccess, getAuthorizedBranchIds, grantBranchAccess, revokeAllBranchAccess } from './services/branch-access.service';
export { assignTenantRole, revokeTenantMembership } from './services/rbac.service';
export { listUserSessions, touchSession, checkAndFlagSuspiciousActivity, SUSPICIOUS_FLAGS } from './services/session.service';

// Router
export { rbacRouter } from './rbac.router';
