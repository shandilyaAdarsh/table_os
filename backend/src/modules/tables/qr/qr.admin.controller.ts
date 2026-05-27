// ============================================================
// src/modules/qr/qr.admin.controller.ts
// Admin handlers for QR code management.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { CreateQrCodeSchema, InvalidateQrCodeSchema } from './qr.validators';
import { createQrCode } from './qr.service';
import { invalidateQrCode } from './qr.repository';
import { AppError } from '../../../shared/errors/AppError';
import { ErrorCode } from '../../../shared/errors/error-codes';

export async function createCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dto = CreateQrCodeSchema.parse(req.body);
    const tenantId = req.context.tenantId!;
    const result = await createQrCode(tenantId, dto, req.context.userId);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function invalidateCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    InvalidateQrCodeSchema.parse(req.body);
    const tenantId = req.context.tenantId!;
    const qrCodeId = req.params.qrCodeId as string;
    const updated = await invalidateQrCode(tenantId, qrCodeId, req.context.userId);
    if (!updated) throw new AppError('QR code not found', 404, ErrorCode.NOT_FOUND);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
