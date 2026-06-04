import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabaseAdmin.rpc('get_table_columns', { table_name: 'staff' });
  if (error) {
    // If RPC doesn't exist, we can use a direct SQL query or just check keys of a row
    const { data: rows } = await supabaseAdmin.from('staff').select('*').limit(1);
    if (rows && rows.length > 0) {
      console.log('Columns:', Object.keys(rows[0]));
    } else {
      console.log('No rows in staff table to extract columns from');
    }
  } else {
    console.log('Columns (RPC):', data);
  }
}

run();
