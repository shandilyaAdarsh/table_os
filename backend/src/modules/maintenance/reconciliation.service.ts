// ============================================================
// src/modules/maintenance/reconciliation.service.ts
// Operational Reconciliation Service implementing:
// - Orphan Invoice & Stuck Paid Order Repair
// - Stuck Kitchen Ticket State Synchronizer
// - Abandoned Checkout Cart Reclaim (locked carts >15m)
// - Stale Idempotency Key Lock Recovery (started keys >15m)
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';

/**
 * Audit Logging Helper for Reconciliation Actions
 */
async function logReconciliationAudit(tenantId: string, actionName: string, targetId: string, details: string): Promise<void> {
  console.log(`[Reconciliation Audit] Tenant: ${tenantId} | Action: ${actionName} | Target: ${targetId} | Details: ${details}`);
  
  // We can also insert into a DB audit log if desired, or let structured standard logging capture it.
}

/**
 * 1. Stuck Paid Order Repair:
 * Finds orders that are linked to fully settled (paid) invoices but still stuck in pending/accepted/preparing states,
 * and advances them to completed.
 */
export async function reconcileStuckPaidOrders(tenantId: string): Promise<number> {
  // Query all unpaid/incomplete orders
  const { data: stuckOrders, error } = await supabaseAdmin
    .from('orders')
    .select('id, version_num, status, tenant_id')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("completed","cancelled")');

  if (error) {
    throw new AppError(`Failed to fetch incomplete orders: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (!stuckOrders || stuckOrders.length === 0) {
    return 0;
  }

  let repairCount = 0;

  for (const order of stuckOrders) {
    // Check if there is an invoice for this order that is fully settled (paid)
    const { data: invoice, error: invError } = await supabaseAdmin
      .from('invoices')
      .select('id, status')
      .eq('order_id', order.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!invError && invoice && invoice.status === 'paid') {
      // Transition order to completed under OCC protection
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'completed',
          version_num: order.version_num + 1,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('id', order.id)
        .eq('version_num', order.version_num);

      if (!updateError) {
        repairCount++;
        await logReconciliationAudit(tenantId, 'STUCK_PAID_ORDER_COMPLETED', order.id, `Advanced stuck incomplete order to completed since invoice was paid.`);
      }
    }
  }

  return repairCount;
}

/**
 * 2. Stuck Kitchen Ticket State Synchronizer:
 * Finds active kitchen tickets whose parent orders have been cancelled or completed,
 * and matches their state to prevent zombie kitchen prep.
 */
export async function reconcileStuckKitchenTickets(tenantId: string): Promise<number> {
  const { data: stuckTickets, error } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, order_id, version_num, status')
    .eq('tenant_id', tenantId)
    .not('status', 'in', '("completed","cancelled")');

  if (error) {
    throw new AppError(`Failed to fetch incomplete kitchen tickets: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (!stuckTickets || stuckTickets.length === 0) {
    return 0;
  }

  let repairCount = 0;

  for (const ticket of stuckTickets) {
    const { data: parentOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, status')
      .eq('id', ticket.order_id)
      .eq('tenant_id', tenantId)
      .single();

    if (!orderError && parentOrder) {
      let targetStatus: string | null = null;
      if (parentOrder.status === 'cancelled') {
        targetStatus = 'cancelled';
      } else if (parentOrder.status === 'completed') {
        targetStatus = 'completed';
      }

      if (targetStatus) {
        const { error: updateError } = await supabaseAdmin
          .from('kitchen_orders')
          .update({
            status: targetStatus,
            version_num: ticket.version_num + 1,
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenantId)
          .eq('id', ticket.id)
          .eq('version_num', ticket.version_num);

        if (!updateError) {
          repairCount++;
          await logReconciliationAudit(tenantId, 'STUCK_KITCHEN_TICKET_SYNC', ticket.id, `Synced kitchen ticket status to ${targetStatus} to match parent order.`);
        }
      }
    }
  }

  return repairCount;
}

/**
 * 3. Abandoned Checkout Cart Reclaim:
 * Reclaims carts stuck in 'locked' or 'submitted' state for > 15 minutes that never completed checkout.
 */
export async function reconcileAbandonedCheckouts(tenantId: string): Promise<number> {
  const threshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // Find locked/submitted carts with no updates in >15 minutes
  const { data: stuckCarts, error } = await supabaseAdmin
    .from('carts')
    .select('id, version_num, status')
    .eq('tenant_id', tenantId)
    .in('status', ['locked', 'submitted'])
    .lt('updated_at', threshold);

  if (error) {
    throw new AppError(`Failed to fetch stuck checkout carts: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (!stuckCarts || stuckCarts.length === 0) {
    return 0;
  }

  let repairCount = 0;

  for (const cart of stuckCarts) {
    // Double check if there is an active order linked to this cart
    const { data: linkedOrder, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('cart_id', cart.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // If no order exists, the checkout was aborted or crashed mid-flight. Release back to 'open'.
    if (!orderError && !linkedOrder) {
      const { error: updateError } = await supabaseAdmin
        .from('carts')
        .update({
          status: 'open',
          version_num: cart.version_num + 1,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('id', cart.id)
        .eq('version_num', cart.version_num);

      if (!updateError) {
        repairCount++;
        await logReconciliationAudit(tenantId, 'ABANDONED_CHECKOUT_RECLAIMED', cart.id, `Reopened stuck locked cart because no checkout order was successfully placed.`);
      }
    }
  }

  return repairCount;
}

/**
 * 4. Stale Idempotency Key Lock Recovery:
 * Finds idempotency keys stuck in status 'started' for > 15 minutes and transitions them to 'failed',
 * so client-side retries can recover instead of being blocked by 409 conflicts.
 */
export async function reconcileStaleIdempotencyLocks(tenantId: string): Promise<number> {
  const threshold = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data: staleKeys, error } = await supabaseAdmin
    .from('idempotency_keys')
    .select('id, idempotency_key, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'started')
    .lt('created_at', threshold);

  if (error) {
    throw new AppError(`Failed to fetch stale idempotency keys: ${error.message}`, 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (!staleKeys || staleKeys.length === 0) {
    return 0;
  }

  let repairCount = 0;

  for (const key of staleKeys) {
    const { error: updateError } = await supabaseAdmin
      .from('idempotency_keys')
      .update({
        status: 'failed'
      })
      .eq('tenant_id', tenantId)
      .eq('id', key.id)
      .eq('status', 'started');

    if (!updateError) {
      repairCount++;
      await logReconciliationAudit(tenantId, 'STALE_IDEMPOTENCY_LOCK_RECOVERED', key.id, `Transitioned stuck idempotency lock '${key.idempotency_key}' to failed.`);
    }
  }

  return repairCount;
}
