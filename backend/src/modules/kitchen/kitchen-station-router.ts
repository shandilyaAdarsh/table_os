// ============================================================
// src/modules/kitchen/kitchen-station-router.ts
// Station Routing Engine resolving menu items to kitchen stations.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import { logger } from '../../shared/utils/logger';

export interface StationRoute {
  id: string;
  tenantId: string;
  branchId: string;
  menuItemId: string;
  stationId: string;
}

export class KitchenStationRouter {
  /**
   * Resolves the target kitchen station ID for a given menu item in a branch.
   * Falls back to default station, then first active station, then null (Expo).
   */
  public static async resolveStationForItem(
    tenantId: string,
    branchId: string,
    menuItemId: string
  ): Promise<string | null> {
    try {
      // 1. Check explicit branch-scoped item-to-station route
      const { data: route, error: routeError } = await supabaseAdmin
        .from('menu_item_station_routes')
        .select('station_id')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('menu_item_id', menuItemId)
        .maybeSingle();

      if (routeError) {
        logger.error({ routeError, menuItemId, branchId }, '[KitchenStationRouter] Error fetching explicit route.');
      }

      if (route?.station_id) {
        return route.station_id;
      }

      // 2. Fallback: Get default active station for this branch
      const { data: defaultStation, error: defaultError } = await supabaseAdmin
        .from('kitchen_stations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('is_default', true)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();

      if (defaultError) {
        logger.error({ defaultError, branchId }, '[KitchenStationRouter] Error fetching default station.');
      }

      if (defaultStation?.id) {
        return defaultStation.id;
      }

      // 3. Fallback: Get first active station sorted by display_order
      const { data: activeStation, error: activeError } = await supabaseAdmin
        .from('kitchen_stations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('display_order', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (activeError) {
        logger.error({ activeError, branchId }, '[KitchenStationRouter] Error fetching first active station.');
      }

      return activeStation?.id || null;
    } catch (err: any) {
      logger.error({ err: err.message, menuItemId, branchId }, '[KitchenStationRouter] Unexpected error resolving station.');
      return null;
    }
  }

  /**
   * Routes a collection of KDS items by creating their individual kitchen_item_preparations records.
   */
  public static async routeOrderItems(
    tenantId: string,
    branchId: string,
    kitchenOrderId: string,
    items: Array<{
      id: string;                  // kitchen_order_item_id
      orderItemSnapshotId: string; // from order_item_snapshots
      menuItemId: string;          // underlying menu_item_id
      quantity: number;
    }>
  ): Promise<void> {
    try {
      const preparationsToInsert = [];

      for (const item of items) {
        const stationId = await this.resolveStationForItem(tenantId, branchId, item.menuItemId);
        
        preparationsToInsert.push({
          tenant_id: tenantId,
          branch_id: branchId,
          kitchen_order_id: kitchenOrderId,
          kitchen_order_item_id: item.id,
          station_id: stationId,
          status: 'pending',
          quantity: item.quantity,
          completed_quantity: 0,
          version_num: 1,
        });
      }

      if (preparationsToInsert.length > 0) {
        const { error } = await supabaseAdmin
          .from('kitchen_item_preparations')
          .insert(preparationsToInsert);

        if (error) {
          throw new AppError(`Failed to insert kitchen item preparations: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
        }

        logger.info(
          { kitchenOrderId, count: preparationsToInsert.length },
          '[KitchenStationRouter] Order items successfully routed to kitchen stations.'
        );
      }
    } catch (err: any) {
      logger.error({ err: err.message, kitchenOrderId }, '[KitchenStationRouter] Critical failure in routing order items.');
      throw err;
    }
  }
}
