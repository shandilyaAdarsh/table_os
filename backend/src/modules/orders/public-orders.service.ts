// ============================================================
// src/modules/orders/public-orders.service.ts
// Service layer for customer public checkout operations.
// ============================================================

import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../shared/errors/AppError';
import { ErrorCode } from '../../shared/errors/error-codes';
import * as cartRepo from '../cart/cart.repository';
import * as cartService from '../cart/cart.service';
import { createOrderFromCart } from './orders.service';
import type { Order } from './orders.repository';

export interface PublicCheckoutItem {
  menu_item_id: string;
  quantity: number;
  item_notes?: string;
  modifiers?: {
    modifier_group_id: string;
    modifier_option_id: string;
  }[];
}

export interface PublicCheckoutInput {
  items: PublicCheckoutItem[];
  order_notes?: string;
}

/**
 * Creates a public customer order directly from items, routing them through cart assembly
 * and the database-side transaction orchestrator.
 */
export async function createPublicOrder(params: {
  tenantId: string;
  tableId: string;
  sessionId: string;
  branchId: string;
  idempotencyKey?: string;
  input: PublicCheckoutInput;
}): Promise<Order> {
  const { tenantId, tableId, sessionId, branchId, idempotencyKey, input } = params;

  // 1. Check idempotency at order level to block duplicate execution
  if (idempotencyKey) {
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingOrder) {
      return existingOrder as Order;
    }
  }

  // 2. Get or create the cart for this QR session
  let cart = await cartRepo.findActiveCartBySession(tenantId, sessionId);
  if (!cart) {
    cart = await cartRepo.createCart({
      tenant_id: tenantId,
      branch_id: branchId,
      table_id: tableId,
      session_id: sessionId,
    });
  } else {
    // If the cart is already locked or submitted, reject modification
    if (cart.status !== 'open') {
      throw new AppError(`Cannot checkout a cart in '${cart.status}' status.`, 400, ErrorCode.VALIDATION_ERROR);
    }
    // Flush any previous cart items to represent the current checkout request exclusively
    await cartRepo.clearCart(cart.id);
  }

  // 3. Populate cart items using cart service (validates availability, pricing overrides, and modifier group constraints)
  for (const item of input.items) {
    await cartService.addCartItem(tenantId, sessionId, {
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      item_notes: item.item_notes,
      modifiers: item.modifiers,
    });
  }

  // 4. Retrieve refreshed cart details to obtain the correct version number
  const latestCart = await cartRepo.findCartById(tenantId, cart.id);
  if (!latestCart) {
    throw new AppError('Cart not found during checkout assembly.', 500, ErrorCode.INTERNAL_SERVER_ERROR);
  }

  if (input.order_notes) {
    await cartRepo.updateCartNotes(tenantId, latestCart.id, {
      order_notes: input.order_notes,
      version_num: latestCart.version_num,
    });
  }

  // 5. Delegate checkout execution to the transaction orchestrator
  return createOrderFromCart({
    tenantId,
    cartId: latestCart.id,
    tableId,
    sessionId,
    idempotencyKey,
    orderNotes: input.order_notes,
    source: 'qr_scan',
  });
}
