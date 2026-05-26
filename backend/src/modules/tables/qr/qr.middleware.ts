// ============================================================
// src/modules/qr/qr.middleware.ts
// Middleware for validating QR session tokens.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validateSessionToken, touchSession } from './qr.service';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import type { QrSession } from './qr.types';

declare global {
  namespace Express {
    interface Request {
      qrSession?: QrSession;
    }
  }
}

export async function requireQrSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.headers['x-qr-session-token'] as string | undefined) ??
      (req.query.session_token as string | undefined);

    if (!token) {
      throw new AppError('Missing QR session token', 401, ErrorCode.UNAUTHORIZED);
    }

    const session = await validateSessionToken(token);
    req.qrSession = session;

    // Non-blocking activity update
    void touchSession(session.id);

    next();
  } catch (err) {
    next(err);
  }
}
