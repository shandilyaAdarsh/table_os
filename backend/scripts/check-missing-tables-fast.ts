/**
 * Fast script to check which tables are missing by querying information_schema
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' }
});

// All tables referenced in the codebase
const referencedTables = [
  'admin_profiles', 'audit_logs', 'auth_audit_logs', 'auth_rate_limits',
  'availability_schedules', 'bill_items', 'bill_orders', 'bills',
  'branch_category_overrides', 'branch_item_availability', 'branch_menu_item_overrides',
  'branch_modifier_group_overrides', 'branch_modifier_option_overrides',
  'branch_operational_events', 'branch_price_overrides', 'branches',
  'cart_item_modifiers', 'cart_items', 'carts', 'credential_invites',
  'customer_identities', 'dead_letter_events', 'device_sessions',
  'distributed_rate_limits', 'dlq_metrics', 'domain_events',
  'failed_dispatch_attempts', 'guest_sessions', 'idempotency_keys',
  'idempotency_registry', 'invoices', 'item_availability_exceptions',
  'item_availability_schedules', 'item_temporary_disablements',
  'kitchen_item_preparations', 'kitchen_order_items', 'kitchen_orders',
  'kitchen_stations', 'menu_categories', 'menu_category_branch_visibility',
  'menu_item_modifier_groups', 'menu_item_prices', 'menu_item_station_routes',
  'menu_item_tax_profiles', 'menu_items', 'menu_snapshots',
  'modifier_groups', 'modifier_options', 'mutation_audit_logs',
  'onboarding_state', 'order_item_snapshots', 'order_modifier_snapshots',
  'order_snapshots', 'order_state_history', 'order_tax_snapshots', 'orders',
  'payment_intents', 'payment_ledger', 'payment_transactions',
  'platform_users', 'profiles', 'projection_audit_logs',
  'projection_schema_registry', 'qr_codes', 'qr_scan_nonces', 'qr_sessions',
  'queue_metrics', 'receipt_snapshots', 'reconciliation_metrics',
  'recovery_jobs', 'refunds', 'replay_metrics', 'restaurant_settings',
  'runtime_capacity_metrics', 'runtime_convergence_metrics',
  'runtime_cost_metrics', 'runtime_event_ledger', 'runtime_incidents',
  'runtime_projection_ownership', 'runtime_replay_checkpoints',
  'runtime_replay_fences', 'runtime_surface_identities',
  'runtime_worker_registry', 'settlement_attempts', 'settlements',
  'split_allocations', 'table_floors', 'table_qr_tokens',
  'table_reservations', 'table_runtime_projections', 'table_sections',
  'table_state_history', 'tables', 'tax_profiles', 'tax_rates',
  'tenant_user_branches', 'tenant_users', 'tenants',
  'transport_audit_logs', 'users', 'waiter_calls',
  'worker_heartbeats', 'worker_leases', 'worker_metrics',
  'dynamic_pricing_rules', 'promo_codes'
];

async function checkMissingTables() {
  console.log('Querying Supabase information_schema for existing tables...\n');
  
  // Use RPC to query information_schema (more reliable than REST API)
  const { data, error } = await supabase.rpc('get_public_tables', {});
  
  if (error) {
    console.log('RPC not available, trying direct query...');
    
    // Fallback: try a few key tables directly
    const testTables = ['tax_profiles', 'dynamic_pricing_rules', 'promo_codes', 'orders', 'tenants', 'menu_items'];
    
    console.log('\n=== Testing Key Tables ===');
    for (const table of testTables) {
      const { error: testError } = await supabase.from(table).select('*').limit(0);
      
      if (testError) {
        if (testError.message.includes('Could not find the table') || testError.message.includes('PGRST205')) {
          console.log(`❌ MISSING: ${table}`);
          console.log(`   Error: ${testError.message}`);
        } else {
          console.log(`✓ EXISTS: ${table}`);
        }
      } else {
        console.log(`✓ EXISTS: ${table}`);
      }
    }
    
    console.log('\n=== Expected Missing Tables (from bug report) ===');
    const expectedMissing = ['tax_profiles', 'dynamic_pricing_rules', 'promo_codes'];
    for (const table of expectedMissing) {
      const { error: testError } = await supabase.from(table).select('*').limit(0);
      const isMissing = testError && (testError.message.includes('Could not find the table') || testError.message.includes('PGRST205'));
      console.log(`  ${isMissing ? '✓ CONFIRMED MISSING' : '✗ EXISTS'}: ${table}`);
    }
    
    return;
  }
  
  console.log('Successfully retrieved table list from database');
}

checkMissingTables().catch(console.error);
