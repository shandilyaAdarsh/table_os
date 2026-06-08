import { supabaseAdmin } from './src/config/supabase';

async function run() {
  console.log('Querying cart statuses...');
  
  const { data, error } = await supabaseAdmin
    .from('carts')
    .select('id, status, locked_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error querying carts:', error);
  } else {
    console.log(`Found carts:`, data);
  }
}

run();
