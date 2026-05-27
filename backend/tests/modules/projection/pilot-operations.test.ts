import { PaymentProviderService } from '../../../src/modules/projection/payment-provider.service';
import { RuntimeAutomationService } from '../../../src/modules/projection/runtime-automation.service';
import { EventLedgerService } from '../../../src/modules/projection/event-ledger.service';
import { supabaseAdmin } from '../../../src/config/supabase';

async function runPilotOperationsSuite() {
  console.log('============================================================');
  console.log('STARTING PHASE 8 PILOT RESTAURANT OPERATIONS VALIDATION');
  console.log('============================================================\n');

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const branchId = '22222222-2222-2222-2222-222222222222';
  const orderId = '55555555-5555-5555-5555-555555555555';
  
  let passed = true;

  // ─── TEST 1: Payment-Provider Webhook Verification ────────────────
  try {
    console.log('Test 1: Webhook Cryptographic Signatures...');
    
    // Simulate raw Stripe payload
    const bodyStr = JSON.stringify({
      tenant_id: tenantId,
      branch_id: branchId,
      order_id: orderId,
      provider: 'STRIPE',
      reference: 'ch_stripe_webhook_99',
      amount_minor: 5500,
      currency_code: 'USD',
      idempotency_key: 'stripe_callback_idemp_key_1',
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${timestamp}.${bodyStr}`;
    const signingSecret = 'webhook_test_secret_key';
    
    const signature = require('crypto')
      .createHmac('sha256', signingSecret)
      .update(signedPayload)
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${signature}`;

    // Verify
    const verified = PaymentProviderService.verifyWebhookSignature({
      rawBody: bodyStr,
      signatureHeader,
      signingSecret,
      provider: 'STRIPE',
    });

    if (!verified) throw new Error('Stripe cryptographic signature verification failed');
    console.log('  ✓ Stripe webhook cryptographic signature verified successfully');

    // Run callback execution (replay-safe)
    const result = await PaymentProviderService.processProviderCallback({
      tenantId,
      branchId,
      orderId,
      provider: 'STRIPE',
      reference: 'ch_stripe_webhook_99',
      amountMinor: 5500,
      currencyCode: 'USD',
      idempotencyKey: 'stripe_callback_idemp_key_1',
    });

    if (!result || result.status !== 'SUCCESS') throw new Error('Failed to commit webhook transaction');
    console.log('  ✓ Webhook transaction processed and committed to payment ledger successfully');
  } catch (err: any) {
    console.error('  ✗ Test 1 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 2: POS Hardware Trust Scoring ───────────────────────────
  try {
    console.log('\nTest 2: POS Hardware Trust score registration...');
    
    // Register unique thermal printer
    const { data: device, error } = await supabaseAdmin
      .from('device_validation_registry')
      .upsert({
        tenant_id: tenantId,
        device_type: 'PRINTER',
        device_identifier: 'thermal_printer_kitchen_1',
        trust_score: 95.50,
        is_authorized: true,
      }, { onConflict: 'device_identifier' })
      .select()
      .single();

    if (error) throw error;
    if (Number(device.trust_score) !== 95.50) throw new Error('Device trust score mismatched');
    console.log('  ✓ Registered thermal printer trust registry profile correctly');
  } catch (err: any) {
    console.error('  ✗ Test 2 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 3: Capacity Cost Accumulator ────────────────────────────
  try {
    console.log('\nTest 3: Operational Cost Metric Telemetries...');
    
    const { error } = await supabaseAdmin
      .from('runtime_cost_metrics')
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        websocket_usage_count: 1450,
        replay_bandwidth_bytes: 45000,
        rebuild_cost_microcents: 50,
        db_query_cost_microcents: 120, // 120 micro-cents
        telemetry_growth_bytes: 800,
        ledger_growth_bytes: 350,
      });

    if (error) throw error;
    console.log('  ✓ Cost telemetries saved successfully');
  } catch (err: any) {
    console.error('  ✗ Test 3 Failed:', err.message);
    passed = false;
  }

  // ─── TEST 4: Replay Horizon Pruning Compaction ───────────────────
  try {
    console.log('\nTest 4: Replay Horizon Policy Compactions...');
    
    const count = await EventLedgerService.pruneHistoricalEvents(tenantId, branchId, 90);
    console.log(`  ✓ Checked Replay Horizon Policy: Pruned count = ${count}`);
  } catch (err: any) {
    console.error('  ✗ Test 4 Failed:', err.message);
    passed = false;
  }

  console.log('\n============================================================');
  if (passed) {
    console.log('ALL PHASE 8 PILOT OPERATIONS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('PHASE 8 PILOT VALIDATION FAILED!');
    process.exit(1);
  }
}

void runPilotOperationsSuite();
