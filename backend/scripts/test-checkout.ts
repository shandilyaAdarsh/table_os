import { supabaseAdmin } from '../src/config/supabase';
import { createOrderSnapshot } from '../src/modules/snapshot/order-snapshot.service';
import crypto from 'node:crypto';
import * as cartRepo from '../src/modules/cart/cart.repository';

// To be run with `npx tsx scripts/test-checkout.ts`

async function runTest() {
  console.log('--- INTEGRATION TEST: Checkout Flow ---');
  
  // 1. Fetch an existing branch and tenant from DB for testing
  const { data: tenant } = await supabaseAdmin.from('tenants').select('id').limit(1).single();
  const { data: branch } = await supabaseAdmin.from('branches').select('id').limit(1).single();
  const { data: table } = await supabaseAdmin.from('tables').select('id').limit(1).single();
  
  if (!tenant || !branch || !table) {
    console.error('Failed to find tenant, branch or table for test.');
    return;
  }
  const tenantId = tenant.id;
  
  // 2. Fetch a test session
  const { data: session } = await supabaseAdmin.from('guest_sessions').select('id').limit(1).single();
  
  if (!session) throw new Error('Failed to find an existing session.');

  // 3. Create a test cart
  const cart = await cartRepo.createCart({
    tenant_id: tenantId,
    branch_id: branch.id,
    table_id: table.id,
    session_id: session.id,
  });
  console.log('✅ Created Cart:', cart.id, 'Status:', cart.status);

  // 4. Add an item to the cart
  const { data: menuItem } = await supabaseAdmin.from('menu_items').select('id, name, price_minor, is_visible').eq('is_visible', true).limit(1).single();
  if (!menuItem) throw new Error('No menu item found for test.');

  await cartRepo.insertCartItem(tenantId, cart.id, {
    menu_item_id: menuItem.id,
    item_name_snapshot: menuItem.name,
    item_sku_snapshot: 'TEST_SKU',
    unit_price_minor_snapshot: menuItem.price_minor,
    quantity: 1,
    display_order: 1
  });
  console.log('✅ Added item to cart');

  // 5. Run Snapshot Creation (Locks the cart)
  console.log('⏳ Running createOrderSnapshot...');
  const snapshotId = await createOrderSnapshot(tenantId, cart.id, cart.version_num);
  
  const lockedCart = await cartRepo.findCartById(tenantId, cart.id);
  console.log('✅ Snapshot created:', snapshotId, '| Cart Status:', lockedCart?.status);

  if (lockedCart?.status !== 'locked') {
    throw new Error('Test Failed: Cart is not locked after snapshot.');
  }

  // 6. Run Checkout RPC
  console.log('⏳ Running orchestrate_checkout_v1 RPC...');
  const orderId = crypto.randomUUID();
  const invoiceId = crypto.randomUUID();
  const orderNumber = 'TEST-' + Math.floor(Math.random() * 10000);
  const invoiceNumber = 'INV-' + Math.floor(Math.random() * 10000);

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('orchestrate_checkout_v1', {
    p_tenant_id: tenantId,
    p_cart_id: cart.id,
    p_snapshot_id: snapshotId,
    p_order_id: orderId,
    p_order_number: orderNumber,
    p_invoice_id: invoiceId,
    p_invoice_number: invoiceNumber,
    p_table_id: table.id,
    p_session_id: session.id,
    p_source: 'qr_web',
    p_order_notes: 'Integration test',
    p_user_id: session.id,
    p_idempotency_key: crypto.randomUUID()
  });

  if (rpcError) {
    console.error('❌ RPC Failed:', rpcError);
    throw new Error(rpcError.message);
  }

  console.log('✅ RPC Succeeded:', rpcData);

  // 7. Verify Results
  const finalCart = await cartRepo.findCartById(tenantId, cart.id);
  console.log('✅ Final Cart Status:', finalCart?.status);
  
  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  console.log('✅ Order Created:', !!order);
  
  const { data: kitchenOrder } = await supabaseAdmin.from('kitchen_orders').select('*').eq('order_id', orderId).single();
  console.log('✅ Kitchen Order Created:', !!kitchenOrder);

  const { data: invoice } = await supabaseAdmin.from('invoices').select('*').eq('order_id', orderId).single();
  console.log('✅ Invoice Created:', !!invoice);

  if (finalCart?.status === 'submitted' && order && kitchenOrder && invoice) {
    console.log('🎉 INTEGRATION TEST PASSED');
  } else {
    console.error('❌ INTEGRATION TEST FAILED: Verification step failed.');
  }
}

runTest().catch(err => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});
