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
  const { data: staff, error } = await supabase
    .from('staff')
    .select('*')
    .limit(1);
  
  if (error) {
    console.error("Error:", error.message, error.details, error.hint);
  } else {
    console.log("Staff columns:", Object.keys(staff[0] || {}));
  }
}

run().catch(console.error);
