import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  const { data, error } = await supabase.from('pg_proc').select('proname').ilike('proname', '%sql%').limit(20);
  if (error) {
    console.error("Error fetching pg_proc:", error);
  } else {
    console.log("Functions matching %sql%:");
    console.log(data);
  }
}

run();
