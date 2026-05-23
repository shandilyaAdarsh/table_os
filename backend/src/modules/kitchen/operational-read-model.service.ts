// ============================================================
// src/modules/kitchen/operational-read-model.service.ts
// Operational Read Model Service creating optimized UI views.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { logger } from '../../shared/utils/logger';

export interface FloorTableProjection {
  tableId: string;
  tableNumber: string;
  capacity: number;
  status: 'vacant' | 'waiting_to_order' | 'waiting_for_food' | 'food_ready' | 'dining' | 'dirty';
  activeOrderId: string | null;
  activeOrderNumber: string | null;
  assignedWaiterId: string | null;
  waiterCallActive: boolean;
}

export interface WaiterDashboardProjection {
  activeCalls: Array<{
    id: string;
    tableNumber: string;
    type: string;
    notes: string | null;
    createdAt: string;
  }>;
  readyToRunTickets: Array<{
    ticketId: string;
    orderId: string;
    orderNumber: string;
    tableNumber: string;
    readyAt: string | null;
    itemCount: number;
  }>;
}

export interface CustomerTrackingProjection {
  orderId: string;
  orderNumber: string;
  status: 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivered';
  currentStageIndex: number; // 0: Received, 1: Kitchen, 2: Ready, 3: Completed
  stages: Array<{
    name: string;
    description: string;
    completed: boolean;
    active: boolean;
    timestamp: string | null;
  }>;
}

export class OperationalReadModelService {
  private static projectionCache = new Map<string, { data: any; timestamp: number }>();
  private static CACHE_TTL_MS = 2000; // 2 seconds high-rush cache TTL

  /**
   * Internal cache fetch helper
   */
  private static getCachedProjection<T>(cacheKey: string): T | null {
    const cached = this.projectionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data as T;
    }
    return null;
  }

  /**
   * Set cache helper
   */
  private static setCachedProjection(cacheKey: string, data: any): void {
    this.projectionCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Explicit cache invalidation trigger (called on KDS state change events)
   */
  public static invalidateCache(branchId: string): void {
    const keysToDelete = Array.from(this.projectionCache.keys()).filter((key) => key.includes(branchId));
    for (const key of keysToDelete) {
      this.projectionCache.delete(key);
    }
    logger.info({ branchId }, '[OperationalReadModel] Invalidated KDS cache for branch.');
  }

  /**
   * Generates a projection of all tables on the floor and their current operational state.
   */
  public static async getFloorStateProjection(
    tenantId: string,
    branchId: string
  ): Promise<FloorTableProjection[]> {
    const cacheKey = `floor:${branchId}`;
    const cached = this.getCachedProjection<FloorTableProjection[]>(cacheKey);
    if (cached) return cached;

    try {
      // 1. Fetch tables
      const { data: tables, error: tablesErr } = await supabaseAdmin
        .from('tables')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .is('deleted_at', null);

      if (tablesErr) throw tablesErr;

      // 2. Fetch active orders (not completed or cancelled)
      const { data: activeOrders, error: ordersErr } = await supabaseAdmin
        .from('orders')
        .select('id, table_id, order_number, status')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .not('status', 'in', '("completed","cancelled")');

      if (ordersErr) throw ordersErr;

      // 3. Fetch active kitchen orders
      const orderIds = activeOrders.map((o) => o.id);
      let kitchenTickets: any[] = [];
      if (orderIds.length > 0) {
        const { data: kTickets, error: kErr } = await supabaseAdmin
          .from('kitchen_orders')
          .select('order_id, status')
          .in('order_id', orderIds);
        if (kErr) throw kErr;
        kitchenTickets = kTickets || [];
      }

      // 4. Fetch active waiter calls
      const { data: activeCalls, error: callsErr } = await supabaseAdmin
        .from('waiter_calls')
        .select('table_id')
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('status', 'pending');

      if (callsErr) {
        logger.error({ callsErr }, '[OperationalReadModel] Error getting active waiter calls.');
      }

      const activeCallTableIds = new Set(activeCalls?.map((c) => c.table_id) || []);

      // 5. Build floor layout state
      const floorProjections: FloorTableProjection[] = [];

      for (const table of tables) {
        const activeOrder = activeOrders.find((o) => o.table_id === table.id);
        let tableStatus: FloorTableProjection['status'] = 'vacant';
        let activeOrderId: string | null = null;
        let activeOrderNumber: string | null = null;

        if (activeOrder) {
          activeOrderId = activeOrder.id;
          activeOrderNumber = activeOrder.order_number;

          const kt = kitchenTickets.find((k) => k.order_id === activeOrder.id);
          const kStatus = kt?.status || activeOrder.status;

          // Map KDS/Order status to active physical table state
          if (kStatus === 'pending' || kStatus === 'accepted' || kStatus === 'preparing') {
            tableStatus = 'waiting_for_food';
          } else if (kStatus === 'ready') {
            tableStatus = 'food_ready';
          } else {
            tableStatus = 'dining';
          }
        } else if (table.status === 'dirty') {
          tableStatus = 'dirty';
        }

        floorProjections.push({
          tableId: table.id,
          tableNumber: table.table_number,
          capacity: table.capacity,
          status: tableStatus,
          activeOrderId,
          activeOrderNumber,
          assignedWaiterId: table.assigned_waiter_id || null,
          waiterCallActive: activeCallTableIds.has(table.id),
        });
      }

      const sortedProjections = floorProjections.sort((a, b) => a.tableNumber.localeCompare(b.tableNumber));
      this.setCachedProjection(cacheKey, sortedProjections);
      return sortedProjections;
    } catch (err: any) {
      logger.error({ err: err.message, branchId }, '[OperationalReadModel] Floor projection failed.');
      throw err;
    }
  }

  /**
   * Generates waiter-facing dashboard view detailing calls and orders requiring food running.
   */
  public static async getWaiterDashboardProjection(
    tenantId: string,
    branchId: string
  ): Promise<WaiterDashboardProjection> {
    const cacheKey = `waiter:${branchId}`;
    const cached = this.getCachedProjection<WaiterDashboardProjection>(cacheKey);
    if (cached) return cached;

    try {
      // 1. Fetch pending waiter calls
      const { data: calls, error: callsErr } = await supabaseAdmin
        .from('waiter_calls')
        .select(`
          id,
          type,
          notes,
          created_at,
          tables (
            table_number
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (callsErr) throw callsErr;

      // 2. Fetch KDS tickets in 'ready' status (food sitting at Expo waiting to run)
      const { data: readyTickets, error: readyErr } = await supabaseAdmin
        .from('kitchen_orders')
        .select(`
          id,
          order_id,
          ready_at,
          orders (
            order_number,
            tables (
              table_number
            )
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('branch_id', branchId)
        .eq('status', 'ready');

      if (readyErr) throw readyErr;

      // 3. For each ready ticket, fetch quick item count
      const formattedReadyTickets = [];
      for (const t of readyTickets) {
        const { count, error: countErr } = await supabaseAdmin
          .from('kitchen_order_items')
          .select('*', { count: 'exact', head: true })
          .eq('kitchen_order_id', t.id);

        formattedReadyTickets.push({
          ticketId: t.id,
          orderId: t.order_id,
          orderNumber: (t.orders as any)?.order_number || 'UNKNOWN',
          tableNumber: (t.orders as any)?.tables?.table_number || 'T0',
          readyAt: t.ready_at,
          itemCount: countErr ? 0 : count || 0,
        });
      }

      const activeCalls = (calls ?? []).map((c) => ({
        id: c.id,
        tableNumber: (c.tables as any)?.table_number || 'T0',
        type: c.type,
        notes: c.notes,
        createdAt: c.created_at,
      }));

      const projection: WaiterDashboardProjection = {
        activeCalls,
        readyToRunTickets: formattedReadyTickets,
      };

      this.setCachedProjection(cacheKey, projection);
      return projection;
    } catch (err: any) {
      logger.error({ err: err.message, branchId }, '[OperationalReadModel] Waiter projection failed.');
      throw err;
    }
  }

  /**
   * Generates linear customer tracking stages for Guest Order Tracker interfaces.
   */
  public static async getCustomerTrackingProjection(
    tenantId: string,
    orderId: string
  ): Promise<CustomerTrackingProjection> {
    try {
      // 1. Fetch Order and joined KDS ticket
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          created_at,
          accepted_at,
          preparing_at,
          ready_at,
          delivered_at,
          kitchen_orders (
            status,
            accepted_at,
            preparing_at,
            ready_at
          )
        `)
        .eq('tenant_id', tenantId)
        .eq('id', orderId)
        .maybeSingle();

      if (orderErr || !order) {
        throw new Error('Order not found.');
      }

      const kt = order.kitchen_orders?.[0];
      const activeStatus = kt?.status || order.status;

      // Status mapping indexing
      const stagesMap = ['pending', 'accepted', 'preparing', 'ready', 'delivered'];
      let currentStageIndex = stagesMap.indexOf(activeStatus);
      if (currentStageIndex === -1) currentStageIndex = 0; // Default
      if (activeStatus === 'preparing' || activeStatus === 'accepted') currentStageIndex = 1;
      if (activeStatus === 'ready') currentStageIndex = 2;
      if (activeStatus === 'delivered' || order.status === 'completed') currentStageIndex = 3;

      const stages = [
        {
          name: 'Order Received',
          description: 'Your order is securely sent and awaiting kitchen acceptance.',
          completed: currentStageIndex >= 0,
          active: currentStageIndex === 0,
          timestamp: order.created_at || null,
        },
        {
          name: 'In Preparation',
          description: 'Our kitchen team has fired your items and is busy cooking.',
          completed: currentStageIndex >= 1,
          active: currentStageIndex === 1,
          timestamp: kt?.preparing_at || kt?.accepted_at || order.preparing_at || order.accepted_at || null,
        },
        {
          name: 'Ready for Pickup',
          description: 'Chef has plated your meal! Waitstaff is preparing delivery.',
          completed: currentStageIndex >= 2,
          active: currentStageIndex === 2,
          timestamp: kt?.ready_at || order.ready_at || null,
        },
        {
          name: 'Delivered & Served',
          description: 'Enjoy your hot meal! Order fulfilled.',
          completed: currentStageIndex >= 3,
          active: currentStageIndex === 3,
          timestamp: order.delivered_at || null,
        },
      ];

      return {
        orderId: order.id,
        orderNumber: order.order_number,
        status: activeStatus as CustomerTrackingProjection['status'],
        currentStageIndex,
        stages,
      };
    } catch (err: any) {
      logger.error({ err: err.message, orderId }, '[OperationalReadModel] Customer tracker projection failed.');
      throw err;
    }
  }
}
