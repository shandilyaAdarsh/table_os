import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../shared/errors/AppError';
import { ErrorCode } from '../shared/errors/error-codes';

const WINDOW_MINUTES = 10;
const MAX_ORDERS = 5;

export const orderRateLimiter = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const tableId = req.body.tableId;
    
    // Only apply table-level rate limit if tableId is present. 
    // Staff/POS might omit tableId or use a different flow, but for QR, this limits abuse.
    if (!tableId) {
      return next();
    }

    // Attempt to upsert the rate limit using an RPC or pure SQL, but since we are using Supabase Admin,
    // we can do a read/write or a direct SQL invocation if there's an RPC.
    // However, to keep it simple and deterministic, we will just read, check, and update.
    // For a more robust atomic operation without a custom RPC, we can just do:
    const { data: record } = await supabaseAdmin
      .from('order_rate_limits')
      .select('*')
      .eq('table_id', tableId)
      .single();

    const now = new Date();
    
    if (!record) {
      // First time for this table
      const { error: insertError } = await supabaseAdmin
        .from('order_rate_limits')
        .insert({
          table_id: tableId,
          window_start: now.toISOString(),
          request_count: 1,
        });
        
      if (insertError && insertError.code !== '23505') { // ignore duplicate key if race condition
        throw insertError;
      }
      return next();
    }

    const windowStart = new Date(record.window_start);
    const diffMinutes = (now.getTime() - windowStart.getTime()) / (1000 * 60);

    if (diffMinutes > WINDOW_MINUTES) {
      // Window expired, reset
      const { error: updateError } = await supabaseAdmin
        .from('order_rate_limits')
        .update({
          window_start: now.toISOString(),
          request_count: 1,
          updated_at: now.toISOString(),
        })
        .eq('table_id', tableId);
        
      if (updateError) throw updateError;
      return next();
    }

    if (record.request_count >= MAX_ORDERS) {
      return next(
        new AppError(
          `Rate limit exceeded. Maximum ${MAX_ORDERS} orders per ${WINDOW_MINUTES} minutes.`,
          429,
          ErrorCode.TOO_MANY_REQUESTS
        )
      );
    }

    // Increment count
    const { error: incrementError } = await supabaseAdmin
      .from('order_rate_limits')
      .update({
        request_count: record.request_count + 1,
        updated_at: now.toISOString(),
      })
      .eq('table_id', tableId);

    if (incrementError) throw incrementError;

    next();
  } catch (error) {
    next(error);
  }
};
