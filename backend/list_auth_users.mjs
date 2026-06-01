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
  console.log("Listing auth users in Supabase...");
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error listing users:", error.message);
  } else {
    console.log("Auth users:");
    users.forEach(u => {
      console.log(`- ID: ${u.id}, Email: ${u.email}, Metadata:`, JSON.stringify(u.app_metadata), JSON.stringify(u.user_metadata));
    });
  }
}

run().catch(console.error);
