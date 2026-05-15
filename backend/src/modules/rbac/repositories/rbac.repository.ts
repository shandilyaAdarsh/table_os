// ============================================================
// src/modules/rbac/repositories/rbac.repository.ts
// All database access for RBAC: membership, branch access.
// Uses supabaseAdmin (service_role) — bypasses RLS.
// ============================================================

import { supabaseAdmin } from '../../../config/supabase';
import { logger } from '../../../shared/utils/logger';
import type { TenantMembership, BranchAccess } from '../rbac.types';

// ─── Tenant Membership ────────────────────────────────────────

/**
 * Check if a user is an active member of a tenant.
 * Uses tenant_users table — NOT admin_profiles.
 */
export async function getTenantMembership(
  userId: string,
  tenantId: string
): Promise<TenantMembership | null> {
  const { data, error } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id, user_id, role, status, deleted_at')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, userId, tenantId }, 'getTenantMembership failed');
    throw new Error(`[RbacRepo] getTenantMembership: ${error.message}`);
  }

  return data;
}

/**
 * Get all tenants a user is a member of.
 */
export async function getUserTenantMemberships(userId: string): Promise<TenantMembership[]> {
  const { data, error } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id, user_id, role, status, deleted_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('deleted_at', null);

  if (error) {
    logger.error({ err: error, userId }, 'getUserTenantMemberships failed');
    throw new Error(`[RbacRepo] getUserTenantMemberships: ${error.message}`);
  }

  return data ?? [];
}

// ─── Branch Access ────────────────────────────────────────────

/**
 * Get all branch IDs a user is authorized for within a tenant.
 */
export async function getUserBranchAccess(
  userId: string,
  tenantId: string
): Promise<BranchAccess[]> {
  const { data, error } = await supabaseAdmin
    .from('tenant_user_branches')
    .select('tenant_id, user_id, branch_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error({ err: error, userId, tenantId }, 'getUserBranchAccess failed');
    throw new Error(`[RbacRepo] getUserBranchAccess: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Check if user has access to a specific branch.
 */
export async function hasBranchAccess(
  userId: string,
  tenantId: string,
  branchId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('tenant_user_branches')
    .select('branch_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, userId, tenantId, branchId }, 'hasBranchAccess failed');
    throw new Error(`[RbacRepo] hasBranchAccess: ${error.message}`);
  }

  return data !== null;
}

/**
 * Assign branch access to a user within a tenant.
 */
export async function assignBranchAccess(
  userId: string,
  tenantId: string,
  branchIds: string[]
): Promise<void> {
  if (branchIds.length === 0) return;

  const rows = branchIds.map((branchId) => ({ tenant_id: tenantId, user_id: userId, branch_id: branchId }));

  const { error } = await supabaseAdmin
    .from('tenant_user_branches')
    .upsert(rows, { onConflict: 'tenant_id,user_id,branch_id' });

  if (error) {
    logger.error({ err: error, userId, tenantId, branchIds }, 'assignBranchAccess failed');
    throw new Error(`[RbacRepo] assignBranchAccess: ${error.message}`);
  }
}

/**
 * Revoke all branch access for a user within a tenant.
 */
export async function revokeBranchAccess(userId: string, tenantId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tenant_user_branches')
    .delete()
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error({ err: error, userId, tenantId }, 'revokeBranchAccess failed');
    throw new Error(`[RbacRepo] revokeBranchAccess: ${error.message}`);
  }
}

// ─── Role Assignment ──────────────────────────────────────────

/**
 * Upsert a user's role in a tenant.
 * Creates or updates the tenant_users record.
 */
export async function setTenantRole(
  userId: string,
  tenantId: string,
  role: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tenant_users')
    .upsert(
      { user_id: userId, tenant_id: tenantId, role, status: 'active', deleted_at: null },
      { onConflict: 'tenant_id,user_id' }
    );

  if (error) {
    logger.error({ err: error, userId, tenantId, role }, 'setTenantRole failed');
    throw new Error(`[RbacRepo] setTenantRole: ${error.message}`);
  }
}

/**
 * Soft-remove user from a tenant.
 */
export async function removeTenantMembership(userId: string, tenantId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tenant_users')
    .update({ status: 'suspended', deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error({ err: error, userId, tenantId }, 'removeTenantMembership failed');
    throw new Error(`[RbacRepo] removeTenantMembership: ${error.message}`);
  }
}
