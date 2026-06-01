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
  console.log("Creating or replacing public.users view pointing to admin_profiles...");
  const createViewSql = `
    CREATE OR REPLACE VIEW public.users AS 
    SELECT 
      id AS auth_id, 
      tenant_id, 
      role, 
      full_name, 
      is_active,
      must_change_password
    FROM public.admin_profiles;
  `;

  // We don't have execute_sql_raw in RPC directly because of schema cache,
  // but let's try if we can run it using execute_sql_raw if we refresh schema cache, or let's use another method if available.
  // Wait! Let's check if there is an execute_sql RPC or similar in the database.
  // Let's call execute_sql_raw again, maybe it exists now or under a different signature.
  const { data, error } = await supabase.rpc('execute_sql_raw', {
    sql_query: createViewSql,
    params: []
  });

  if (error) {
    console.error("Error running execute_sql_raw:", error.message);
  } else {
    console.log("Successfully created users view!");
  }
}

run().catch(console.error);
