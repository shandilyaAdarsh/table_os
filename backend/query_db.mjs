import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  const { data: adminProfiles, error: apErr } = await supabase
    .from('admin_profiles')
    .select('*');
  
  if (apErr) {
    console.error("Error:", apErr.message);
  } else {
    console.log("Admin Profiles:", JSON.stringify(adminProfiles, null, 2));
  }

  // Let's also check if there are other tables like tenant_members, staff, user_roles etc.
  const { data: tenants, error: tenantsErr } = await supabase
    .from('tenants')
    .select('id, name');
  console.log("Tenants:", tenants);
}

run().catch(console.error);
