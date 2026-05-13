// ============================================================
// src/modules/auth/controllers/auth.controller.ts
// HTTP handlers. Thin layer: validate → service → respond.
// No business logic here — delegate everything to auth.service.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import {
  loginWithEmail,
  logout,
  refreshAccessToken,
  requestPasswordReset,
  completePasswordReset,
} from '../services/auth.service';
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

function getIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '';
}

function getUa(req: Request): string {
  return req.headers['user-agent'] ?? '';
}

// ─── POST /auth/login ─────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = validate(LoginSchema, req.body);
    const result = await loginWithEmail(body, getIp(req), getUa(req));
    res.status(200).json({ success: true, data: result });
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
      req.auth.id,
      req.auth.tenant_id,
      body.device_session_id ?? req.auth.device_session_id,
      body.revoke_all_sessions ?? false,
      getIp(req),
      getUa(req)
    );
    res.status(200).json({ success: true, message: 'Logged out successfully' });
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
    const body = validate(RefreshTokenSchema, req.body);
    const deviceSessionId = req.headers['x-device-session-id'] as string | undefined;

    if (!deviceSessionId) throw new AuthenticationError('Missing x-device-session-id header');

    const result = await refreshAccessToken(body, getIp(req), getUa(req), deviceSessionId);
    res.status(200).json({ success: true, data: result });
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
    const body = validate(ForgotPasswordSchema, req.body);
    const redirectTo = `${env.ADMIN_FRONTEND_URL}/auth/reset-password`;
    await requestPasswordReset(body.email, redirectTo, getIp(req), getUa(req));
    // Always 200 — anti-enumeration
    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a reset link has been sent.',
    });
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
    // req.auth is set by authenticate middleware (user has temp JWT from reset email link)
    const body = validate(ResetPasswordSchema, req.body);
    await completePasswordReset(req.auth.id, body.new_password, getIp(req), getUa(req));
    res.status(200).json({
      success: true,
      message: 'Password updated. Please log in with your new password.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /auth/session ────────────────────────────────────────

export async function getSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // req.auth already validated by authenticate middleware
    res.status(200).json({ success: true, data: { user: req.auth } });
  } catch (err) {
    next(err);
  }
}
