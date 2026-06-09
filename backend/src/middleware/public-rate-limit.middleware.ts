import rateLimit from 'express-rate-limit';
import { logger } from '../shared/utils/logger';

export const publicOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each table to 5 orders per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    const key = req.qrSession?.table_id || req.qrSession?.tableId;
    if (!key) {
      throw new Error('Rate limiter failed: Missing table context in QR session');
    }
    return key;
  },
  handler: (req: any, res: any) => {
    logger.warn({
      msg: '[PublicOrderRateLimit]',
      tenant: req.qrSession?.tenant_id || req.qrSession?.tenantId,
      branch: req.qrSession?.branch_id || req.qrSession?.branchId,
      table: req.qrSession?.table_id || req.qrSession?.tableId,
      path: req.originalUrl || req.path,
      requestId: req.id || req.headers['x-request-id'],
    });

    res.status(429).json({
      success: false,
      code: 'ORDER_RATE_LIMIT_EXCEEDED',
      message: 'Too many orders from this table. Please wait before placing another order.',
    });
  },
});
