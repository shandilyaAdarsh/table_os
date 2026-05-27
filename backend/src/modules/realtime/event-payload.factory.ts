// ============================================================
// src/modules/realtime/event-payload.factory.ts
// Canonical realtime DTO generator and event payload shaping.
// ============================================================

import type { Order } from '../orders/orders.repository';
import type { Table } from '../tables/tables.types';
import type { WaiterCall } from '../waiter-call/waiter-call.types';

export type RealtimeEventType =
  | 'ORDER_CREATED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'ORDER_DELIVERED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED'
  | 'TABLE_UPDATED'
  | 'WAITER_CALL_CREATED'
  | 'WAITER_CALL_ACKNOWLEDGED'
  | 'WAITER_CALL_RESOLVED';

export interface CanonicalRealtimeEvent<T = any> {
  eventId: string;
  eventType: RealtimeEventType;
  version: string; // Payload format version, e.g., "1.0.0"
  tenantId: string;
  branchId: string;
  timestamp: string;
  aggregateId: string;
  aggregateType: 'Order' | 'Table' | 'WaiterCall';
  sequenceNumber: number; // Client sequencing/deduplication sequence number
  payload: T;
}

/**
 * EventPayloadFactory generates client-safe canonical DTO representations
 * of domain events. It ensures compatibility and strips sensitive fields.
 */
export class EventPayloadFactory {
  private static sequenceCounter = 0;

  private static getNextSequence(): number {
    this.sequenceCounter += 1;
    return this.sequenceCounter;
  }

  public static createOrderEvent(
    eventType: RealtimeEventType,
    order: Order,
    meta: { eventId?: string; reason?: string; actorId?: string } = {}
  ): CanonicalRealtimeEvent<{
    id: string;
    orderNumber: string;
    status: string;
    source: string;
    tableId: string;
    sessionId: string | null;
    orderNotes: string | null;
    cancellationReason: string | null;
    versionNum: number;
    actorId: string | null;
    reason: string | null;
    createdAt: string;
    updatedAt: string;
  }> {
    return {
      eventId: meta.eventId || crypto.randomUUID(),
      eventType,
      version: '1.0.0',
      tenantId: order.tenant_id,
      branchId: order.branch_id,
      timestamp: new Date().toISOString(),
      aggregateId: order.id,
      aggregateType: 'Order',
      sequenceNumber: this.getNextSequence(),
      payload: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        source: order.source,
        tableId: order.table_id,
        sessionId: order.session_id,
        orderNotes: order.order_notes,
        cancellationReason: order.cancellation_reason,
        versionNum: order.version_num,
        actorId: meta.actorId || order.updated_by || null,
        reason: meta.reason || null,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
      },
    };
  }

  public static createTableEvent(
    table: Table,
    meta: { eventId?: string; reason?: string; actorId?: string; runtimeState?: string } = {}
  ): CanonicalRealtimeEvent<{
    id: string;
    tableNumber: string;
    displayName: string | null;
    capacity: number;
    runtimeState: string | null;
    assignedWaiterId: string | null;
    versionNum: number;
    actorId: string | null;
    reason: string | null;
    updatedAt: string;
  }> {
    return {
      eventId: meta.eventId || crypto.randomUUID(),
      eventType: 'TABLE_UPDATED',
      version: '1.0.0',
      tenantId: table.tenant_id,
      branchId: table.branch_id,
      timestamp: new Date().toISOString(),
      aggregateId: table.id,
      aggregateType: 'Table',
      sequenceNumber: this.getNextSequence(),
      payload: {
        id: table.id,
        tableNumber: table.table_number,
        displayName: table.display_name,
        capacity: table.capacity,
        runtimeState: meta.runtimeState || null,  // Derived from projection, passed in by caller
        assignedWaiterId: table.assigned_waiter_id,
        versionNum: table.version_num,
        actorId: meta.actorId || table.updated_by || null,
        reason: meta.reason || null,
        updatedAt: table.updated_at,
      },
    };
  }

  public static createWaiterCallEvent(
    eventType: RealtimeEventType,
    call: WaiterCall,
    meta: { eventId?: string; reason?: string; actorId?: string } = {}
  ): CanonicalRealtimeEvent<{
    id: string;
    tableId: string;
    sessionId: string | null;
    type: string;
    notes: string | null;
    status: string;
    versionNum: number;
    actorId: string | null;
    reason: string | null;
    createdAt: string;
    updatedAt: string;
  }> {
    return {
      eventId: meta.eventId || crypto.randomUUID(),
      eventType,
      version: '1.0.0',
      tenantId: call.tenant_id,
      branchId: call.branch_id,
      timestamp: new Date().toISOString(),
      aggregateId: call.id,
      aggregateType: 'WaiterCall',
      sequenceNumber: this.getNextSequence(),
      payload: {
        id: call.id,
        tableId: call.table_id,
        sessionId: call.session_id,
        type: call.type,
        notes: call.notes,
        status: call.status,
        versionNum: call.version_num,
        actorId: meta.actorId || call.acknowledged_by || call.resolved_by || null,
        reason: meta.reason || null,
        createdAt: call.created_at,
        updatedAt: call.updated_at,
      },
    };
  }
}
