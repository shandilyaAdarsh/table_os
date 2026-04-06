import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'ey...'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data } = await supabase.from('restaurant_tables').select('*').limit(1)
  console.log(JSON.stringify(data[0], null, 2))
}
test()
