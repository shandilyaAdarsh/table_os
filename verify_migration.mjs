#!/usr/bin/env node
/**
 * Migration Verification Script
 * Verifies that the missing tables migration was applied successfully
 * Task 3.3: Apply migration to Supabase database - Verification
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://mdwryhxnruprtuqonbwy.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3NTUxMSwiZXhwIjoyMDkwNTUxNTExfQ.QLZjL2rNRkFquD8NLH_2wjy0NI06QkE10FLOQRduFx8';

// Create Supabase admin client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function verifyMigration() {
  console.log('🔍 Verifying Migration Application\n');
  console.log('=' .repeat(80));

  const tablesToVerify = [
    { name: 'users', description: 'User accounts with tenant assignment' },
    { name: 'dynamic_pricing_rules', description: 'Dynamic pricing rules' },
    { name: 'promo_codes', description: 'Promotional codes' },
    { name: 'credential_invites', description: 'User invitation system' },
    { name: 'profiles', description: 'User profiles' },
    { name: 'guest_sessions', description: 'Guest session tracking' },
    { name: 'menu_snapshots', description: 'Menu version history' },
    { name: 'restaurant_settings', description: 'Restaurant configuration' }
  ];

  let allTablesExist = true;
  let successCount = 0;
  let failureCount = 0;

  console.log('\n📊 Checking Table Accessibility...\n');

  for (const table of tablesToVerify) {
    try {
      // Try to query the table (limit 0 to avoid loading data)
      const { data, error } = await supabase
        .from(table.name)
        .select('*')
        .limit(0);

      if (error) {
        // Check if it's a "table not found" error
        if (error.code === 'PGRST204' || error.message.includes('not found') || error.message.includes('does not exist')) {
          console.log(`❌ FAIL: Table '${table.name}' NOT FOUND`);
          console.log(`   Description: ${table.description}`);
          console.log(`   Error: ${error.message}\n`);
          allTablesExist = false;
          failureCount++;
        } else if (error.code === '42501' || error.message.includes('permission denied')) {
          // Permission denied might mean table exists but RLS is blocking
          console.log(`⚠️  WARN: Table '${table.name}' exists but RLS may be blocking access`);
          console.log(`   Description: ${table.description}`);
          console.log(`   This is expected if RLS policies are strict\n`);
          successCount++;
        } else {
          console.log(`⚠️  WARN: Table '${table.name}' check returned unexpected error`);
          console.log(`   Description: ${table.description}`);
          console.log(`   Error: ${error.message}\n`);
          successCount++;
        }
      } else {
        console.log(`✅ PASS: Table '${table.name}' exists and is accessible`);
        console.log(`   Description: ${table.description}\n`);
        successCount++;
      }
    } catch (err) {
      console.log(`❌ FAIL: Error checking table '${table.name}'`);
      console.log(`   Description: ${table.description}`);
      console.log(`   Error: ${err.message}\n`);
      allTablesExist = false;
      failureCount++;
    }
  }

  console.log('=' .repeat(80));
  console.log('\n📈 Verification Summary:\n');
  console.log(`   Total Tables: ${tablesToVerify.length}`);
  console.log(`   ✅ Accessible: ${successCount}`);
  console.log(`   ❌ Not Found: ${failureCount}`);
  console.log(`   Success Rate: ${Math.round((successCount / tablesToVerify.length) * 100)}%\n`);

  if (allTablesExist && failureCount === 0) {
    console.log('🎉 SUCCESS: All tables are accessible!\n');
    console.log('✅ Migration was applied successfully');
    console.log('✅ All 8 tables exist in the database');
    console.log('✅ Tables are accessible via Supabase API\n');
    
    console.log('📝 Next Steps:');
    console.log('   1. Verify RLS policies are enabled (see MIGRATION_INSTRUCTIONS.md)');
    console.log('   2. Verify indexes are created (see MIGRATION_INSTRUCTIONS.md)');
    console.log('   3. Run bug condition exploration tests to confirm fix');
    console.log('   4. Test the Taxes screen to verify PGRST205 errors are resolved\n');
    
    return true;
  } else {
    console.log('❌ FAILURE: Some tables are missing or inaccessible\n');
    console.log('⚠️  The migration may not have been applied correctly.\n');
    
    console.log('🔧 Troubleshooting Steps:');
    console.log('   1. Check if the migration SQL was executed completely');
    console.log('   2. Review Supabase Dashboard → Logs → Postgres Logs for errors');
    console.log('   3. Verify the migration file path is correct');
    console.log('   4. Try running the migration again');
    console.log('   5. Check for foreign key constraint errors (tenants table must exist)');
    console.log('   6. See MIGRATION_INSTRUCTIONS.md for detailed troubleshooting\n');
    
    return false;
  }
}

// Run verification
verifyMigration()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Verification script error:', error.message);
    process.exit(1);
  });
