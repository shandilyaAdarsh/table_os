// ============================================================
// src/modules/tables/projections/table-runtime.projection.ts
// Table Runtime Projection Engine
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import { TelemetryBroadcaster } from '../../observability/telemetry.broadcaster';

export interface TableRuntimeState {
  table_id: string;
  tenant_id: string;
  active_guest_count: number;
  active_order_count: number;
  assistance_request_count: number;
  runtime_state: 'FREE' | 'ACTIVE_GUESTS' | 'ORDERING' | 'PAYMENT_PENDING' | 'ASSISTANCE_REQUESTED';
  updated_at: string;
}

/**
 * Deterministically rebuilds the runtime state of a table from its dependent operational entities.
 */
export async function rebuildTableProjection(
  supabase: SupabaseClient,
  tenantId: string,
  tableId: string
): Promise<TableRuntimeState> {
  const startTime = Date.now();

  TelemetryBroadcaster.enqueue({
    tenant_id: tenantId,
    runtime_surface: 'BACKEND_ENGINE',
    domain: 'tables',
    aggregate_id: tableId,
    severity: 'INFO',
          event_type: 'PROJECTION_REBUILD_STARTED',
    metadata: { reason: 'DOMAIN_REBUILD' }
  });

  // 1. Fetch active guest sessions (formerly qr_sessions)
  const { data: guests, error: guestsErr } = await supabase
    .from('guest_sessions')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('table_id', tableId)
    .eq('status', 'active');
  
  if (guestsErr) throw new Error(`Failed to fetch guest sessions: ${guestsErr.message}`);
  const activeGuestCount = guests?.length || 0;

  // 2. Fetch active orders for this table
  // Assuming orders have a status field where 'open', 'preparing', 'served' are active, and 'paid', 'cancelled' are inactive
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('table_id', tableId)
    .in('status', ['open', 'preparing', 'served', 'payment_pending']);
    
  if (ordersErr) throw new Error(`Failed to fetch orders: ${ordersErr.message}`);
  const activeOrderCount = orders?.length || 0;
  const paymentPendingCount = orders?.filter(o => o.status === 'payment_pending').length || 0;

  // 3. Fetch active assistance requests (waiter calls)
  const { data: waiterCalls, error: callsErr } = await supabase
    .from('waiter_calls')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('table_id', tableId)
    .eq('status', 'pending');
    
  if (callsErr) throw new Error(`Failed to fetch waiter calls: ${callsErr.message}`);
  const assistanceRequestCount = waiterCalls?.length || 0;

  // 4. Derive deterministic runtime state
  let runtimeState: TableRuntimeState['runtime_state'] = 'FREE';

  if (assistanceRequestCount > 0) {
    runtimeState = 'ASSISTANCE_REQUESTED';
  } else if (paymentPendingCount > 0) {
    runtimeState = 'PAYMENT_PENDING';
  } else if (activeOrderCount > 0) {
    runtimeState = 'ORDERING';
  } else if (activeGuestCount > 0) {
    runtimeState = 'ACTIVE_GUESTS';
  }

  const newState: Omit<TableRuntimeState, 'updated_at'> = {
    table_id: tableId,
    tenant_id: tenantId,
    active_guest_count: activeGuestCount,
    active_order_count: activeOrderCount,
    assistance_request_count: assistanceRequestCount,
    runtime_state: runtimeState
  };

  // 5. Upsert projection
  const { data, error } = await supabase
    .from('table_runtime_projections')
    .upsert(newState, { onConflict: 'table_id' })
    .select()
    .single();

  if (error) {
    TelemetryBroadcaster.enqueue({
      tenant_id: tenantId,
      runtime_surface: 'BACKEND_ENGINE',
      domain: 'tables',
      aggregate_id: tableId,
      severity: 'INFO',
          event_type: 'PROJECTION_REBUILD_FAILED',
      metadata: { duration_ms: Date.now() - startTime, error: error.message }
    });
    throw new Error(`Failed to upsert table projection: ${error.message}`);
  }

  TelemetryBroadcaster.enqueue({
    tenant_id: tenantId,
    runtime_surface: 'BACKEND_ENGINE',
    domain: 'tables',
    aggregate_id: tableId,
    severity: 'INFO',
          event_type: 'PROJECTION_REBUILD_COMPLETED',
    metadata: { duration_ms: Date.now() - startTime, state: runtimeState }
  });

  return data as TableRuntimeState;
}
