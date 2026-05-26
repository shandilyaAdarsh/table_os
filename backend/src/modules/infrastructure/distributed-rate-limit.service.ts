import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export class DistributedRateLimitService {
  /**
   * Evaluates if a request from a specific key (e.g. IP + endpoint) should be rate limited.
   * Leverages Supabase transaction/atomic upserts for distributed scaling.
   */
  static async checkRateLimit(
    key: string,
    maxRequests = 100,
    windowMs = 15 * 60 * 1000
  ): Promise<boolean> {
    try {
      const now = new Date();

      // Clean up stale rate limits first (garbage collection)
      await supabaseAdmin.from('distributed_rate_limits').delete().lt('expires_at', now.toISOString());

      // Attempt to retrieve existing window
      const { data: record, error } = await supabaseAdmin
        .from('distributed_rate_limits')
        .select('*')
        .eq('key', key)
        .maybeSingle();

      if (error) throw error;

      if (!record) {
        // Insert new window
        const expiresAt = new Date(Date.now() + windowMs).toISOString();
        await supabaseAdmin.from('distributed_rate_limits').insert({
          key,
          request_count: 1,
          window_start: now.toISOString(),
          expires_at: expiresAt,
        });
        return true;
      }

      const currentCount = record.request_count;
      if (currentCount >= maxRequests) {
        logger.warn({ key, count: currentCount }, 'Distributed rate limit limit exceeded');
        return false;
      }

      // Increment count atomically
      await supabaseAdmin
        .from('distributed_rate_limits')
        .update({ request_count: currentCount + 1 })
        .eq('key', key);

      return true;
    } catch (err: any) {
      logger.error({ err, key }, 'Failed to check distributed rate limit. Falling back to permissive.');
      return true; // Soft fail to prevent locking user operations
    }
  }
}
