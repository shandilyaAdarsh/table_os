import { supabaseAdmin } from '../src/config/supabase';

async function test() {
  const { data, error } = await supabaseAdmin.from('staff').select('*').limit(1);
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
