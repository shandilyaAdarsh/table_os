import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val) env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log('--- menu_items ---');
  const { data: menu, error: menuErr } = await supabase.from('menu_items').select('tenant_id, name').limit(1);
  console.log(menu, menuErr);

  console.log('--- orders ---');
  const { data: orders, error: ordersErr } = await supabase.from('orders').select('id, tenant_id').limit(1);
  console.log(orders, ordersErr);
}
run();
