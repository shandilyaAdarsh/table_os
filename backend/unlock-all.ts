import { supabaseAdmin } from './src/config/supabase';

async function run() {
  console.log('Unlocking all locked carts...');
  
  const { data, error } = await supabaseAdmin
    .from('carts')
    .update({ status: 'open', locked_at: null })
    .eq('status', 'locked')
    .select();

  if (error) {
    console.error('Error unlocking carts:', error);
  } else {
    console.log(`Successfully unlocked ${data?.length || 0} carts:`, data);
  }
}

run();
