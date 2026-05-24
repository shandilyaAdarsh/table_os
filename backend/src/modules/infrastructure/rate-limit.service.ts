// ============================================================
// src/modules/infrastructure/rate-limit.service.ts
// Tenant-aware, branch-scoped Token Bucket rate limiting service.
// Protects public ordering, waiter calls, checkouts, and QR endpoints.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { ObservabilityService } from './observability.service';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { RateLimitQuota } from './infrastructure.types';

// Standard production-safe quotas for core routes
const QUOTAS: Record<string, RateLimitQuota> = {
  PUBLIC_ORDERING:  { limit: 10, refillRate: 0.5,   windowSec: 3600 }, // Refills 1 token every 2 seconds
  WAITER_CALLS:     { limit: 5,  refillRate: 0.1,   windowSec: 3600 }, // Refills 1 token every 10 seconds
  PAYMENT_INTENTS:  { limit: 3,  refillRate: 0.033, windowSec: 3600 }, // Refills 1 token every 30 seconds
  QR_SESSIONS:      { limit: 10, refillRate: 0.2,   windowSec: 3600 }, // Refills 1 token every 5 seconds
  RECONCILIATION:   { limit: 20, refillRate: 1.0,   windowSec: 3600 }  // Refills 1 token every second (admin API)
};

export const RateLimitService = {
  /**
   * Evaluates rate limiting quota on a specific target key using DB-level atomic updates.
   */
  async checkRateLimit(key: string, quota: RateLimitQuota): Promise<{ allowed: boolean; remaining: number }> {
    const capacity = quota.limit;
    const refillRate = quota.refillRate;
    const windowSec = quota.windowSec;

    try {
      // Execute atomic token bucket evaluation using raw query through supabaseAdmin
      // Evaluates time delta, refuels the bucket up to capacity, and deducts 1 token if available.
      const query = `
        WITH current_state AS (
          SELECT tokens, last_refilled_at 
          FROM public.rate_limit_buckets 
          WHERE key = $1
        ),
        refilled_state AS (
          SELECT 
            LEAST(
              $2::numeric, 
              COALESCE(
                (SELECT tokens FROM current_state) + (EXTRACT(EPOCH FROM (NOW() - (SELECT last_refilled_at FROM current_state))) * $3::numeric), 
                $2::numeric
              )
            ) as tokens
        ),
        deducted_state AS (
          INSERT INTO public.rate_limit_buckets (key, tokens, last_refilled_at, expires_at)
          VALUES ($1, GREATEST(0, (SELECT tokens FROM refilled_state) - 1), NOW(), NOW() + ($4 || ' seconds')::interval)
          ON CONFLICT (key) DO UPDATE SET
            tokens = GREATEST(0, CASE WHEN (SELECT tokens FROM refilled_state) >= 1 THEN (SELECT tokens FROM refilled_state) - 1 ELSE rate_limit_buckets.tokens END),
            last_refilled_at = NOW(),
            expires_at = NOW() + ($4 || ' seconds')::interval
          RETURNING tokens
        )
        SELECT 
          COALESCE((SELECT tokens FROM refilled_state) >= 1, false) as allowed,
          (SELECT tokens FROM deducted_state) as remaining;
      `;

      const { data, error } = await supabaseAdmin.rpc('check_rate_limit_raw', {
        p_key: key,
        p_capacity: capacity,
        p_refill_rate: refillRate,
        p_window_sec: windowSec
      });

      // If RPC is missing or fails, use raw SQL fallback or simplified update logic
      if (error || !data || data.length === 0) {
        // Simple client-side fallback query executing same CTE sequence
        const { data: dbData, error: dbError } = await supabaseAdmin.rpc('execute_sql_raw', {
          sql_query: query,
          params: [key, capacity, refillRate, windowSec]
        });

        if (dbError || !dbData || dbData.length === 0) {
          // If all database queries fail, default to allowing request but log the failure
          ObservabilityService.error('Rate limit query execution failure, falling back to bypass mode', dbError);
          return { allowed: true, remaining: capacity };
        }

        return {
          allowed: dbData[0].allowed,
          remaining: Number(dbData[0].remaining)
        };
      }

      return {
        allowed: data[0].allowed,
        remaining: Number(data[0].remaining)
      };
    } catch (err) {
      ObservabilityService.error('Unexpected error checking rate limits', err);
      return { allowed: true, remaining: capacity }; // Default open on failure
    }
  },

  /**
   * Helper to generate unique tenant & branch scoped rate limit keys.
   */
  generateKey(category: string, ip: string, tenantId: string | null, branchId: string | null): string {
    const scopeTenant = tenantId || 'global';
    const scopeBranch = branchId || 'global';
    return `ratelimit:${category}:${scopeTenant}:${scopeBranch}:${ip}`;
  },

  /**
   * Express middleware factory protecting endpoints with specific quotas.
   */
  rateLimitMiddleware(category: keyof typeof QUOTAS) {
    const quota = QUOTAS[category];

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
      const tenantId = req.context?.tenantId || null;
      const branchId = (req.headers['x-branch-id'] as string) || null;

      const key = RateLimitService.generateKey(category, ip, tenantId, branchId);
      const result = await RateLimitService.checkRateLimit(key, quota);

      res.setHeader('X-RateLimit-Limit', quota.limit);
      res.setHeader('X-RateLimit-Remaining', Math.ceil(result.remaining));

      if (!result.allowed) {
        ObservabilityService.warn(`Rate limit exceeded for route category ${category}`, {
          category,
          ip,
          tenantId,
          branchId,
          key
        });
        return next(new AppError('Too many requests. Quota limit exceeded.', 429, ErrorCode.TOO_MANY_REQUESTS));
      }

      next();
    };
  }
};
export default RateLimitService;
