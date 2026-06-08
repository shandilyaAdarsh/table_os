import { supabaseAdmin } from './src/config/supabase';

async function run() {
  console.log('Querying sessions...');
  
  const { data: sessions } = await supabaseAdmin
    .from('qr_sessions')
    .select('id, guest_name')
    .ilike('guest_name', '%aaas%');
    
  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map(s => s.id);
    console.log('Found sessions:', sessionIds);
    
    const { data: carts } = await supabaseAdmin
      .from('carts')
      .select('id, status, locked_at, updated_at, session_id')
      .in('session_id', sessionIds);
      
    console.log('Carts:', carts);
    
    // Unlock them
    for (const cart of carts || []) {
      if (cart.status === 'locked' || cart.status === 'submitted') {
        await supabaseAdmin.from('carts').update({ status: 'open', locked_at: null }).eq('id', cart.id);
        console.log(`Unlocked cart ${cart.id}`);
      }
    }
  } else {
    console.log('No sessions found via guest_name');
  }
}

run();
