import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envRaw = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envRaw.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v) env[k.trim()] = v.join('=').trim().replace(/"/g, '');
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data } = await supabase.from('restaurant_tables').select('*').limit(2)
  console.log(JSON.stringify(data, null, 2))
}
test()
