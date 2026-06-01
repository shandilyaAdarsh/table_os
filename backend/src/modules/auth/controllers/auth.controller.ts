// ============================================================
// src/modules/auth/controllers/auth.controller.ts
// HTTP handlers — thin layer: validate → service → respond.
// No business logic. All auth decisions in service/middleware.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import {
  loginWithEmail,
  logout,
  refreshAccessToken,
  requestPasswordReset,
  completePasswordReset,
  completeFirstLoginPasswordSetup,
} from '../services/auth.service';
import { RuntimeAuthService } from '../services/runtime-auth.service';
import {
  validate,
  LoginSchema,
  RefreshTokenSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  LogoutSchema,
} from '../validators/auth.validators';
import { AuthenticationError } from '../../../shared/errors/AppError';
import { env } from '../../../config/env';
import { ResponseFormatter } from '../../../shared/utils/response-formatter';
import { listUserSessions } from '../../rbac/services/session.service';

/** Use req.ip — trust proxy is set in app.ts */
function getIp(req: Request): string {
  return req.ip ?? '';
}

function getUa(req: Request): string {
  return req.headers['user-agent'] ?? '';
}

// ─── POST /auth/login ─────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body   = validate(LoginSchema, req.body);
    const result = await loginWithEmail(body, getIp(req), getUa(req));
    res.status(200).json(ResponseFormatter.success(result, 'Login successful'));
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/logout ────────────────────────────────────────

export async function logoutHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = validate(LogoutSchema, req.body);
    await logout(
      req.context.id,
      req.context.tenantId,
      body.device_session_id ?? req.context.device_session_id,
      body.revoke_all_sessions ?? false,
      getIp(req),
      getUa(req)
    );
    res.status(200).json(ResponseFormatter.success(null, 'Logged out successfully'));
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/refresh ───────────────────────────────────────

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body            = validate(RefreshTokenSchema, req.body);
    const deviceSessionId = req.headers['x-device-session-id'] as string | undefined;

    if (!deviceSessionId) throw new AuthenticationError('Missing X-Device-Session-Id header');

    const result = await refreshAccessToken(body, getIp(req), getUa(req), deviceSessionId);
    res.status(200).json(ResponseFormatter.success(result));
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/forgot-password ───────────────────────────────

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body       = validate(ForgotPasswordSchema, req.body);
    const redirectTo = `${env.ADMIN_FRONTEND_URL}/auth/reset-password`;
    await requestPasswordReset(body.email, redirectTo, getIp(req), getUa(req));
    // Always 200 — anti-enumeration
    res.status(200).json(
      ResponseFormatter.success(
        null,
        'If an account exists with that email, a reset link has been sent.'
      )
    );
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/reset-password ────────────────────────────────

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = validate(ResetPasswordSchema, req.body);
    await completePasswordReset(req.context.id, body.new_password, getIp(req), getUa(req));
    res.status(200).json(
      ResponseFormatter.success(null, 'Password updated. Please log in with your new password.')
    );
  } catch (err) {
    next(err);
  }
}

// ─── POST /auth/set-password ─────────────────────────────────

export async function setPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = validate(ResetPasswordSchema, req.body);
    await completeFirstLoginPasswordSetup(req.context.id, body.new_password, getIp(req), getUa(req));
    res.status(200).json(
      ResponseFormatter.success(null, 'Password configured successfully. Onboarding completed.')
    );
  } catch (err) {
    next(err);
  }
}

// ─── GET /auth/session ────────────────────────────────────────

export async function getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(200).json(ResponseFormatter.success({ user: req.context }));
  } catch (err) {
    next(err);
  }
}

// ─── GET /auth/sessions ───────────────────────────────────────
// Lists all active sessions for the authenticated user.

export async function listSessions(
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

// ─── POST /auth/runtime/exchange ──────────────────────────────
// Exchanges a valid Supabase token for a strict, short-lived Runtime JWT

export async function exchangeRuntimeSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or malformed Authorization header');
    }
    const supabaseToken = authHeader.slice(7);
    
    const branchId = req.body.branch_id;
    if (!branchId || typeof branchId !== 'string') {
      throw new AuthenticationError('branch_id is required for runtime exchange');
    }

    const deviceSessionId = req.headers['x-device-session-id'] as string;
    if (!deviceSessionId) {
      throw new AuthenticationError('X-Device-Session-Id header is required');
    }

    const runtimeJwt = await RuntimeAuthService.exchangeForRuntimeSession(
      supabaseToken,
      branchId,
      deviceSessionId
    );

    res.status(200).json(
      ResponseFormatter.success(
        { runtime_token: runtimeJwt, type: 'Bearer' },
        'Runtime session exchanged successfully'
      )
    );
  } catch (err) {
    next(err);
  }
}

