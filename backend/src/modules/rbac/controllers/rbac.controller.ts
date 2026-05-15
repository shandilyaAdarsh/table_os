// ============================================================
// src/modules/rbac/controllers/rbac.controller.ts
// HTTP handlers for RBAC management operations.
// Only accessible by RESTAURANT_ADMIN and SUPER_ADMIN.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { assignTenantRole, revokeTenantMembership } from '../services/rbac.service';
import { listUserSessions } from '../services/session.service';
import { getUserBranchAccess } from '../repositories/rbac.repository';
import { ResponseFormatter } from '../../../shared/utils/response-formatter';
import { ValidationError } from '../../../shared/errors/AppError';
import type { Role } from '../../../types/rbac.types';
import { ROLE_HIERARCHY, ROLES } from '../../../types/rbac.types';

// ─── Schemas ──────────────────────────────────────────────────

const AssignRoleSchema = z.object({
  userId:    z.string().uuid('Invalid user ID'),
  role:      z.string().refine((r) => r in ROLE_HIERARCHY, { message: 'Invalid role' }),
  branchIds: z.array(z.string().uuid()).optional().default([]),
});

const RevokeSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    result.error.errors.forEach((e) => {
      const key = e.path.join('.');
      if (key && !fields[key]) fields[key] = e.message;
    });
    throw new ValidationError(fields);
  }
  return result.data;
}

// ─── POST /rbac/:tenantId/roles ───────────────────────────────
// Assign a role to a user within the tenant.

export async function assignRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.params['tenantId']!;
    const body     = parseBody(AssignRoleSchema, req.body);

    await assignTenantRole(
      {
        targetUserId: body.userId,
        tenantId,
        role: body.role,
        branchIds: body.branchIds,
        grantedBy: req.context.id,
      },
      req.context.role as Role
    );

    res.status(200).json(ResponseFormatter.success(null, 'Role assigned successfully'));
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /rbac/:tenantId/roles ────────────────────────────
// Revoke a user's membership from the tenant.

export async function revokeMembership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantId = req.params['tenantId']!;
    const body     = parseBody(RevokeSchema, req.body);

    await revokeTenantMembership(body.userId, tenantId, req.context.id);

    res.status(200).json(ResponseFormatter.success(null, 'Membership revoked'));
  } catch (err) {
    next(err);
  }
}

// ─── GET /rbac/:tenantId/branch-access/:userId ────────────────
// Get branch access for a specific user.

export async function getUserBranchAccesses(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenantId, userId } = req.params as { tenantId: string; userId: string };
    const access = await getUserBranchAccess(userId, tenantId);
    res.status(200).json(ResponseFormatter.success(access));
  } catch (err) {
    next(err);
  }
}

// ─── GET /rbac/sessions ───────────────────────────────────────
// List active sessions for the authenticated user.

export async function getActiveSessions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessions = await listUserSessions(req.context.id, req.context.device_session_id);
    res.status(200).json(ResponseFormatter.success(sessions));
  } catch (err) {
    next(err);
  }
}
