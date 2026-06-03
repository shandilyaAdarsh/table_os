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
  exchangeRuntimeSession,
} from './controllers/auth.controller';
import {
  authenticate,
  requirePasswordChanged,
} from '../../middleware/auth.middleware';

const router: Router = Router();

// ─── Public routes ────────────────────────────────────────────
router.post('/login',           login);
router.post('/forgot-password', forgotPassword);

// ─── Reset password — requires JWT from email link ────────────
// authenticate validates the short-lived reset JWT.
// requirePasswordChanged is intentionally omitted here.
router.post('/reset-password', authenticate, resetPassword);
router.post('/change-password', authenticate, resetPassword);

// ─── Token refresh — validated via device session, not Bearer ─
// No authenticate middleware — uses refresh_token + device session.
router.post('/refresh', refreshToken);

// ─── Authenticated routes ─────────────────────────────────────
router.post('/logout',    authenticate,                              logoutHandler);
router.get( '/session',   authenticate, requirePasswordChanged,      getSession);
router.get( '/sessions',  authenticate, requirePasswordChanged,      listSessions);

// ─── Runtime Exchange (no authenticate middleware, accepts Supabase token directly) ─
router.post('/runtime/exchange', exchangeRuntimeSession);

// ─── Staff Waiter / POS Login ─────────────────────────────────
import { staffLogin } from './controllers/staff-auth.controller';
router.post('/staff/login', staffLogin);

export { router as authRouter };
