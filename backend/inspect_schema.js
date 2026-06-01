import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  const tables = ['tenants', 'branches', 'admin_profiles', 'users', 'restaurant_settings', 'orders', 'onboarding_state', 'tenant_tax_profile'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table}: error: ${error.message} (code: ${error.code})`);
    } else {
      console.log(`Table ${table}: exists, row count checked (has data: ${data && data.length > 0})`);
      if (data && data.length > 0) {
        console.log(`Sample columns: ${Object.keys(data[0]).join(', ')}`);
      }
    }
  }
}

run();
