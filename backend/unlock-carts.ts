import { supabaseAdmin } from './src/config/supabase';

async function run() {
  console.log('Unlocking stuck carts...');
  
  // Calculate the time 30 minutes ago
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('carts')
    .update({ status: 'active', locked_at: null })
    .eq('status', 'locked')
    .lt('updated_at', thirtyMinsAgo)
    .select();

  if (error) {
    console.error('Error unlocking carts:', error);
  } else {
    console.log(`Successfully unlocked ${data?.length || 0} carts:`, data);
  }
}

run();
