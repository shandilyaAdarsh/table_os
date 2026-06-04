// ============================================================
// Public QR token resolution — no auth required.
// GET /api/v1/qr/resolve/:token
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { resolveQrTokenPublic } from '../services/table.service';

const router = Router();

router.get('/resolve/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.params.token ?? '');
    const data = await resolveQrTokenPublic(token);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export { router as qrResolveRouter };
