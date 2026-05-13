import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3NTUxMSwiZXhwIjoyMDkwNTUxNTExfQ.QLZjL2rNRkFquD8NLH_2wjy0NI06QkE10FLOQRduFx8'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkRLS() {
  const { data, error } = await supabase.rpc('get_policies', { table_name: 'profiles' })
  console.log('Policies:', data)
  console.log('Error:', error)
  
  // If RPC is not available, try to query pg_policies directly
  const { data: policies, error: polError } = await supabase.from('pg_policies').select('*').eq('tablename', 'profiles')
  console.log('pg_policies:', policies)
  console.log('pg_policies error:', polError)
}

checkRLS()
