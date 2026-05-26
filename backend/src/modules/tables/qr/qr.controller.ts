// ============================================================
// src/modules/qr/qr.controller.ts
// HTTP handlers for QR session endpoints.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { ResolveQrSessionSchema } from './qr.validators';
import { resolveQrSession, validateSessionToken } from './qr.service';

export async function resolveSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = ResolveQrSessionSchema.parse(req.body);
    const session = await resolveQrSession(dto, req.ip ?? null, req.headers['user-agent'] ?? null);
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function validateSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.headers['x-qr-session-token'] as string | undefined;
    const session = await validateSessionToken(token ?? '');
    res.status(200).json({
      success: true,
      data: {
        session_id: session.id,
        branch_id: session.branch_id,
        table_id: session.table_id,
        status: session.status,
        expires_at: session.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
}
