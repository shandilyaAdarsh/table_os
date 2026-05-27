import { PaymentReconciliationService } from '../../../src/modules/projection/payment-reconciliation.service';
import { RuntimeAutomationService } from '../../../src/modules/projection/runtime-automation.service';
import { supabaseAdmin } from '../../../src/config/supabase';

async function runFinancialChaosSuite() {
  console.log('============================================================');
  console.log('STARTING PHASE 7 FINANCIAL CHAOS & PAYMENT INTEGRITY SUITE');
  console.log('============================================================\n');

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const branchId = '22222222-2222-2222-2222-222222222222';
  const orderId = '55555555-5555-5555-5555-555555555555';
  
  let passed = true;

  // ─── TEST 1: Strict Idempotent Payment execution ──────────────────
  try {
    console.log('Test 1: Idempotent Payment Registration...');
    const idempotencyKey = 'payment_idemp_key_999';

    const paymentInput = {
      tenant_id: tenantId,
      branch_id: branchId,
      order_id: orderId,
      payment_provider: 'STRIPE',
      payment_reference: 'ch_stripe_ref_123',
      payment_amount_minor: 4500, // $45.00
      currency_code: 'USD',
      idempotency_key: idempotencyKey,
      replay_generation: 2500,
    };

    // First attempt: should succeed and write to ledger
    const p1 = await PaymentReconciliationService.recordPayment(paymentInput);
    if (!p1 || p1.payment_reference !== 'ch_stripe_ref_123') {
      throw new Error('Initial payment entry failed to record');
    }
    console.log('  ✓ Initial payment entry registered in ledger successfully');

    // Second attempt: should be blocked by idempotency registry and return cached record
    const p2 = await PaymentReconciliationService.recordPayment(paymentInput);
    if (p2.id !== p1.id) {
      throw new Error('Duplicate payment executed instead of returning cached result');
    }
    console.log('  ✓ Duplicate transaction call intercepted, double-charging blocked');
  } catch (err: any) {
    console.error('  ✗ Test 1 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 2: Absolute Financial Ledger Immutability ────────────────
  try {
    console.log('\nTest 2: Ledger Immutability Verification...');

    // Attempt to update payment ledger row (should trigger PostgreSQL exception)
    const { error: updateErr } = await supabaseAdmin
      .from('payment_ledger')
      .update({ payment_amount_minor: 0 })
      .eq('payment_reference', 'ch_stripe_ref_123');

    if (!updateErr) {
      throw new Error('Ledger update succeeded! Database mutations are not blocked!');
    }
    console.log(`  ✓ Blocked UPDATE mutation successfully (Reason: "${updateErr.message}")`);

    // Attempt to delete payment ledger row
    const { error: deleteErr } = await supabaseAdmin
      .from('payment_ledger')
      .delete()
      .eq('payment_reference', 'ch_stripe_ref_123');

    if (!deleteErr) {
      throw new Error('Ledger row deletion succeeded! Database deletions are not blocked!');
    }
    console.log(`  ✓ Blocked DELETE mutation successfully (Reason: "${deleteErr.message}")`);
  } catch (err: any) {
    console.error('  ✗ Test 2 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 3: Capacity Metrics & Scaling signals ────────────────────
  try {
    console.log('\nTest 3: Capacity Metrics & Autoscaling Signals...');

    // Record high capacity loads
    await RuntimeAutomationService.recordCapacity({
      tenant_id: tenantId,
      branch_id: branchId,
      replay_throughput: 650, // exceeds safety threshold 500
      queue_pressure: 12,
      websocket_load: 400,
      worker_utilization: 62.50,
      replay_saturation: 45.00,
      rebuild_pressure: 1,
    });

    const signal = await RuntimeAutomationService.evaluateAutoscaleSignals(tenantId, branchId);
    console.log(`  ✓ Evaluated capacity scale recommendation: ShouldScaleUp = ${signal.should_scale_up}, Reason: "${signal.reason}"`);
    if (!signal.should_scale_up) {
      throw new Error('Autoscale recommendations failed to flag high throughput');
    }
  } catch (err: any) {
    console.error('  ✗ Test 3 Failed:', err.message);
    passed = false;
  }

  console.log('\n============================================================');
  if (passed) {
    console.log('ALL PHASE 7 FINANCIAL CHAOS TESTS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('PHASE 7 FINANCIAL SUITE FAILED!');
    process.exit(1);
  }
}

void runFinancialChaosSuite();
