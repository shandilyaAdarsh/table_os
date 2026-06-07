// migrate_settings.mjs
// Adds missing columns to the restaurant_settings table in Supabase.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, 'backend', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migrations = [
  // Add branch_id column (nullable UUID)
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;`,
  // Add other potentially missing columns
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS notify_new_order BOOLEAN NOT NULL DEFAULT TRUE;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS notify_order_ready BOOLEAN NOT NULL DEFAULT TRUE;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS notify_low_stock BOOLEAN NOT NULL DEFAULT FALSE;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS notify_revenue BOOLEAN NOT NULL DEFAULT FALSE;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS print_receipt BOOLEAN NOT NULL DEFAULT TRUE;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS auto_accept BOOLEAN NOT NULL DEFAULT FALSE;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS confirmation_sound TEXT NOT NULL DEFAULT 'BEEP_01';`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS qr_auto_assign BOOLEAN NOT NULL DEFAULT TRUE;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS gst_number TEXT NOT NULL DEFAULT '';`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS default_tax_basis_points INTEGER NOT NULL DEFAULT 500;`,
  `ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS version_num INTEGER NOT NULL DEFAULT 1;`,
];

async function run() {
  console.log('🔧 Running restaurant_settings migrations...\n');

  for (const sql of migrations) {
    const preview = sql.replace(/\s+/g, ' ').trim().slice(0, 80);
    process.stdout.write(`  ▶ ${preview}... `);
    
    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }));
    
    // Try direct query via postgrest if rpc not available
    const { error: e2 } = await supabase
      .from('_dummy_nonexistent_') // Just to test connectivity
      .select('*')
      .limit(0)
      .throwOnError()
      .catch(() => ({ error: null }));
    
    // Use raw SQL via the REST admin API
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });
    
    if (resp.ok) {
      console.log('✅');
    } else {
      const body = await resp.text();
      // If column already exists, that's fine
      if (body.includes('already exists') || body.includes('42701')) {
        console.log('⏭  (already exists)');
      } else {
        console.log(`⚠️  ${resp.status}: ${body.slice(0, 100)}`);
      }
    }
  }

  // Verify the table now has branch_id
  console.log('\n🔍 Verifying table schema...');
  const { data, error } = await supabase
    .from('restaurant_settings')
    .select('branch_id')
    .limit(1);

  if (error) {
    console.error('❌ Verification failed:', error.message);
    console.log('\n💡 The exec_sql RPC may not be available. Run this SQL directly in Supabase SQL Editor:');
    migrations.forEach(m => console.log('  ' + m));
  } else {
    console.log('✅ branch_id column confirmed present!');
  }
}

run().catch(console.error);
