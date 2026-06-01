import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3NTUxMSwiZXhwIjoyMDkwNTUxNTExfQ.QLZjL2rNRkFquD8NLH_2wjy0NI06QkE10FLOQRduFx8'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkRLS() {
  const { data, error } = await supabase.from('tables').select('*').limit(1);
  console.log('Tables query data:', data);
  console.log('Tables query error:', error);
}

checkRLS()
