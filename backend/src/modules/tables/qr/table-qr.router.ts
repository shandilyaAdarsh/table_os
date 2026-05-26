// ============================================================
// src/modules/tables/qr/table-qr.router.ts
// Public QR Runtime Router
// ============================================================

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { TableQRService } from './table-qr.service';
import { supabaseAdmin } from '../../../config/supabase';
// Assuming rate limit middleware is available
// import { rateLimit } from 'express-rate-limit'; 

const router: Router = Router({ mergeParams: true });

// Hardened Rate Limiting for Public Endpoints to prevent abuse/enumeration
/*
const publicQrRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
*/

// Simple Memory-based sliding window rate limiter for public endpoints
const ipRequestHistory: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 mins
const MAX_REQUESTS_PER_WINDOW = 100;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let timestamps = ipRequestHistory.get(ip) || [];
  
  // Filter out timestamps outside the current window
  timestamps = timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  timestamps.push(now);
  ipRequestHistory.set(ip, timestamps);
  return true;
}

/**
 * Public QR Resolution Flow
 * URL: GET /api/v1/public/qr/:token
 */
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const publicToken = String(req.params['token'] ?? '');
    const ipRaw: unknown = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const requestIp: string = Array.isArray(ipRaw) ? String((ipRaw as string[])[0]) : String(ipRaw);

    // 1. Rate Limit Enforcement
    if (!checkRateLimit(requestIp)) {
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many scanning attempts. Please wait before trying again.' },
      });
      return;
    }

    // 2. Entropy / length validation
    if (!publicToken || publicToken.length < 32) {
      res.status(400).json({ success: false, message: 'Invalid token format.' });
      return;
    }

    const deviceFingerprint = String(req.headers['x-device-fingerprint'] || '');

    // Instantiate service
    const qrService = new TableQRService((req as any).supabase || supabaseAdmin);

    const bootstrapPayload = await qrService.resolvePublicToken(publicToken, requestIp, deviceFingerprint);
    
    res.status(200).json({
      success: true,
      data: bootstrapPayload
    });
  } catch (err: any) { 
    // Do not leak internal errors to public clients
    if (err.message === 'Invalid or expired QR code.' || err.message === 'Table is currently unavailable.') {
       res.status(404).json({ success: false, message: err.message });
    } else {
       next(err);
    }
  }
});

export { router as publicQrRouter };
