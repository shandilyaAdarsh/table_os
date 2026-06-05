import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';

export class CustomerRepository {
  static async getGuestOrder(orderId: string, tenantId: string, tableId: string) {
    const supabase = supabaseAdmin;
    const startTime = Date.now();

    const timeThreshold = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const allowedStatuses = ['pending', 'accepted', 'preparing', 'ready'];

    logger.info({ orderId, tenantId, tableId }, '[CustomerRepository] Fetching guest order');

    // Step 1: Fetch the order itself (no joins — guaranteed to work)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .eq('table_id', tableId)
      .in('status', allowedStatuses)
      .gte('created_at', timeThreshold)
      .single();

    if (orderError) {
      // PGRST116 = "no rows returned" — this is a normal "not found"
      if (orderError.code === 'PGRST116') {
        logger.warn({ orderId, tenantId, tableId, latencyMs: Date.now() - startTime }, '[CustomerRepository] Order not found (no matching rows)');
        return null;
      }
      logger.error({ orderId, tenantId, tableId, error: orderError }, '[CustomerRepository] Supabase error fetching order');
      throw new AppError('Database error while fetching order', 500, 'DATABASE_ERROR');
    }

    if (!order) {
      logger.warn({ orderId, latencyMs: Date.now() - startTime }, '[CustomerRepository] Order query returned null');
      return null;
    }

    // Step 2: Try to fetch order_items separately (may not exist yet)
    let orderItems: any[] = [];
    try {
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      if (itemsError) {
        logger.warn({ orderId, error: itemsError.message }, '[CustomerRepository] order_items fetch failed (table may not exist)');
      } else {
        orderItems = items || [];
      }
    } catch (err: any) {
      logger.warn({ orderId, error: err.message }, '[CustomerRepository] order_items table not available');
    }

    const result = { ...order, order_items: orderItems };
    logger.info({ orderId, itemCount: orderItems.length, latencyMs: Date.now() - startTime }, '[CustomerRepository] Order fetched successfully');

    return result;
  }
}
