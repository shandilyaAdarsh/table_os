/**
 * Bug Condition Exploration Test: Missing Database Tables
 * 
 * Property 1: Bug Condition - Missing Tables Cause PGRST205 Errors
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * GOAL: Surface counterexamples that demonstrate the bug exists
 * 
 * Validates: Requirements 1.1, 1.2, 1.3
 */

import { supabaseAdmin } from '../../src/config/supabase';

interface TestResult {
  tableName: string;
  exists: boolean;
  error: string | null;
  errorCode: string | null;
}

async function testMissingTables() {
  console.log('============================================================');
  console.log('BUG CONDITION EXPLORATION: Missing Database Tables');
  console.log('============================================================\n');
  console.log('EXPECTED OUTCOME: This test SHOULD FAIL on unfixed code');
  console.log('Failure confirms the bug exists (missing tables cause PGRST205 errors)\n');

  const missingTables = ['tax_profiles', 'dynamic_pricing_rules', 'promo_codes'];
  const existingTables = ['orders', 'menu_items', 'tenants', 'branches', 'users'];
  
  const results: TestResult[] = [];
  let allTestsPassed = true;

  console.log('--- Testing Missing Tables (Expected to fail with PGRST205) ---\n');

  // Test 1: Query tax_profiles table
  console.log('Test 1: Querying tax_profiles table...');
  try {
    const { data, error } = await supabaseAdmin
      .from('tax_profiles')
      .select('*')
      .limit(1);

    if (error) {
      console.log(`  ✗ EXPECTED FAILURE: ${error.message}`);
      console.log(`  Error Code: ${error.code}`);
      console.log(`  Error Details: ${JSON.stringify(error.details)}`);
      
      results.push({
        tableName: 'tax_profiles',
        exists: false,
        error: error.message,
        errorCode: error.code || null,
      });

      // Verify it's a PGRST205 error
      if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
        console.log('  ✓ Confirmed: PGRST205 error detected (bug exists)\n');
      } else {
        console.log('  ⚠ Warning: Different error than expected PGRST205\n');
        allTestsPassed = false;
      }
    } else {
      console.log('  ✗ UNEXPECTED: Table exists! Bug may already be fixed.\n');
      results.push({
        tableName: 'tax_profiles',
        exists: true,
        error: null,
        errorCode: null,
      });
      allTestsPassed = false;
    }
  } catch (err: any) {
    console.log(`  ✗ Exception: ${err.message}\n`);
    results.push({
      tableName: 'tax_profiles',
      exists: false,
      error: err.message,
      errorCode: null,
    });
  }

  // Test 2: Query dynamic_pricing_rules table
  console.log('Test 2: Querying dynamic_pricing_rules table...');
  try {
    const { data, error } = await supabaseAdmin
      .from('dynamic_pricing_rules')
      .select('*')
      .limit(1);

    if (error) {
      console.log(`  ✗ EXPECTED FAILURE: ${error.message}`);
      console.log(`  Error Code: ${error.code}`);
      
      results.push({
        tableName: 'dynamic_pricing_rules',
        exists: false,
        error: error.message,
        errorCode: error.code || null,
      });

      // Verify it's a PGRST205 error
      if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
        console.log('  ✓ Confirmed: PGRST205 error detected (bug exists)\n');
      } else {
        console.log('  ⚠ Warning: Different error than expected PGRST205\n');
        allTestsPassed = false;
      }
    } else {
      console.log('  ✗ UNEXPECTED: Table exists! Bug may already be fixed.\n');
      results.push({
        tableName: 'dynamic_pricing_rules',
        exists: true,
        error: null,
        errorCode: null,
      });
      allTestsPassed = false;
    }
  } catch (err: any) {
    console.log(`  ✗ Exception: ${err.message}\n`);
    results.push({
      tableName: 'dynamic_pricing_rules',
      exists: false,
      error: err.message,
      errorCode: null,
    });
  }

  // Test 3: Query promo_codes table
  console.log('Test 3: Querying promo_codes table...');
  try {
    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .limit(1);

    if (error) {
      console.log(`  ✗ EXPECTED FAILURE: ${error.message}`);
      console.log(`  Error Code: ${error.code}`);
      
      results.push({
        tableName: 'promo_codes',
        exists: false,
        error: error.message,
        errorCode: error.code || null,
      });

      // Verify it's a PGRST205 error
      if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
        console.log('  ✓ Confirmed: PGRST205 error detected (bug exists)\n');
      } else {
        console.log('  ⚠ Warning: Different error than expected PGRST205\n');
        allTestsPassed = false;
      }
    } else {
      console.log('  ✗ UNEXPECTED: Table exists! Bug may already be fixed.\n');
      results.push({
        tableName: 'promo_codes',
        exists: true,
        error: null,
        errorCode: null,
      });
      allTestsPassed = false;
    }
  } catch (err: any) {
    console.log(`  ✗ Exception: ${err.message}\n`);
    results.push({
      tableName: 'promo_codes',
      exists: false,
      error: err.message,
      errorCode: null,
    });
  }

  console.log('--- Testing Existing Tables (Control - Should succeed) ---\n');

  // Test 4: Query existing orders table (control test)
  console.log('Test 4: Querying orders table (control test)...');
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id')
      .limit(1);

    if (error) {
      console.log(`  ✗ UNEXPECTED FAILURE: ${error.message}`);
      console.log('  Control test failed - existing table should work!\n');
      allTestsPassed = false;
    } else {
      console.log('  ✓ SUCCESS: Existing table works correctly (control test passed)\n');
    }
  } catch (err: any) {
    console.log(`  ✗ Exception: ${err.message}\n`);
    allTestsPassed = false;
  }

  // Test 5: Query existing tenants table (control test)
  console.log('Test 5: Querying tenants table (control test)...');
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .limit(1);

    if (error) {
      console.log(`  ✗ UNEXPECTED FAILURE: ${error.message}`);
      console.log('  Control test failed - existing table should work!\n');
      allTestsPassed = false;
    } else {
      console.log('  ✓ SUCCESS: Existing table works correctly (control test passed)\n');
    }
  } catch (err: any) {
    console.log(`  ✗ Exception: ${err.message}\n`);
    allTestsPassed = false;
  }

  // Summary
  console.log('============================================================');
  console.log('COUNTEREXAMPLES FOUND (Bug Condition Evidence):');
  console.log('============================================================\n');

  const missingTableResults = results.filter(r => !r.exists);
  if (missingTableResults.length > 0) {
    console.log('Missing tables that cause PGRST205 errors:');
    missingTableResults.forEach(r => {
      console.log(`  - ${r.tableName}`);
      console.log(`    Error: ${r.error}`);
      console.log(`    Code: ${r.errorCode || 'N/A'}`);
    });
    console.log('');
  }

  console.log('============================================================');
  console.log('TEST RESULT INTERPRETATION:');
  console.log('============================================================\n');

  if (missingTableResults.length === 3 && allTestsPassed) {
    console.log('✓ BUG CONFIRMED: All three tables are missing (PGRST205 errors detected)');
    console.log('  This is the EXPECTED outcome for unfixed code.');
    console.log('  The bug exists and needs to be fixed by creating the missing tables.');
    console.log('');
    console.log('Root Cause: Tables tax_profiles, dynamic_pricing_rules, and promo_codes');
    console.log('            do not exist in the Supabase schema.');
    console.log('');
    console.log('Next Steps: Implement fix by creating SQL migration to add missing tables.');
    console.log('');
    process.exit(1); // Exit with failure code (expected for exploration test on unfixed code)
  } else if (missingTableResults.length === 0) {
    console.log('✓ BUG FIXED: All tables exist! The bug has been resolved.');
    console.log('  This test now validates the expected behavior.');
    console.log('');
    process.exit(0); // Exit with success code (expected after fix is implemented)
  } else {
    console.log('⚠ PARTIAL STATE: Some tables exist, some are missing.');
    console.log('  This may indicate the fix is partially applied or there are other issues.');
    console.log('');
    console.log('Missing tables:', missingTableResults.map(r => r.tableName).join(', '));
    console.log('');
    process.exit(1); // Exit with failure code
  }
}

// Run the test
void testMissingTables();
