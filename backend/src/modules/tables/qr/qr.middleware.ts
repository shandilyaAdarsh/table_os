// ============================================================
// src/modules/qr/qr.middleware.ts
// Middleware for validating QR session tokens.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { validateSessionToken, touchSession } from './qr.service';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { GuestSessionRepository } from '../../guest-sessions/repositories/guest-session.repository';

declare global {
  namespace Express {
    interface Request {
      qrSession?: any; // Allow both legacy QrSession and GuestSession
    }
  }
}

// Basic UUID check
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export async function requireQrSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.headers['x-qr-session-token'] as string | undefined) ??
      (req.query.session_token as string | undefined);

    if (!token) {
      throw new AppError('Missing QR session token', 401, ErrorCode.UNAUTHORIZED);
    }

    if (isUUID(token)) {
      // It's a modern GuestSession ID
      const session = await GuestSessionRepository.findSessionByPk(token);
      if (!session) {
        throw new AppError('Guest session not found', 404, ErrorCode.NOT_FOUND);
      }
      if (!session.is_active) {
        throw new AppError('Guest session is not active', 403, ErrorCode.FORBIDDEN);
      }
      
      const expiresAt = session.session_data?.expires_at;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        throw new AppError('Guest session expired', 401, ErrorCode.UNAUTHORIZED);
      }

      req.qrSession = {
        id: session.id,
        tenantId: session.tenant_id,
        branchId: session.branch_id,
        tableId: session.table_id,
        tenant_id: session.tenant_id,
        branch_id: session.branch_id,
        table_id: session.table_id,
      };

      // Update activity asynchronously
      void GuestSessionRepository.addFingerprintToSession(
        session.tenant_id,
        session.id,
        (req.headers['x-device-fingerprint'] as string) || `anonymous-${req.ip}`,
        session.session_data || {}
      ).catch(() => {});
    } else {
      // Legacy QR session token
      const session = await validateSessionToken(token);
      req.qrSession = session;
      void touchSession(session.id).catch(() => {});
    }

    next();
  } catch (err) {
    next(err);
  }
}
