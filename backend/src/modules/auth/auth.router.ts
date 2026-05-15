// ============================================================
// src/modules/auth/auth.router.ts
// Auth route definitions. Clean separation from controllers.
// ============================================================

import { Router } from 'express';
import {
  login,
  logoutHandler,
  refreshToken,
  forgotPassword,
  resetPassword,
  getSession,
  listSessions,
} from './controllers/auth.controller';
import {
  authenticate,
  requirePasswordChanged,
} from '../../middleware/auth.middleware';

const router = Router();

// ─── Public routes ────────────────────────────────────────────
router.post('/login',           login);
router.post('/forgot-password', forgotPassword);

// ─── Reset password — requires JWT from email link ────────────
// authenticate validates the short-lived reset JWT.
// requirePasswordChanged is intentionally omitted here.
router.post('/reset-password', authenticate, resetPassword);

// ─── Token refresh — validated via device session, not Bearer ─
// No authenticate middleware — uses refresh_token + device session.
router.post('/refresh', refreshToken);

// ─── Authenticated routes ─────────────────────────────────────
router.post('/logout',    authenticate,                              logoutHandler);
router.get( '/session',   authenticate, requirePasswordChanged,      getSession);
router.get( '/sessions',  authenticate, requirePasswordChanged,      listSessions);

export { router as authRouter };
