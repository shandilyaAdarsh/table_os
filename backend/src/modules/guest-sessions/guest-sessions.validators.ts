import type { Request, Response, NextFunction } from 'express';
import { CreateGuestSessionSchema } from './guest-sessions.dtos';

export function validateCreateGuestSession(req: Request, res: Response, next: NextFunction): void {
  const result = CreateGuestSessionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload elements.',
        details: result.error.errors,
      },
    });
    return;
  }
  next();
}
