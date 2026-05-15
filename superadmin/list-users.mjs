import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3NTUxMSwiZXhwIjoyMDkwNTUxNTExfQ.QLZjL2rNRkFquD8NLH_2wjy0NI06QkE10FLOQRduFx8'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function listUsers() {
  console.log('--- AUTH USERS ---')
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError) console.error(usersError)
  else {
    users.forEach(u => console.log(`${u.email} (${u.id})`))
  }

  console.log('\n--- PROFILES ---')
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*')
  if (profilesError) console.error(profilesError)
  else {
    profiles.forEach(p => console.log(`${p.email} - Role: ${p.role}`))
  }
}

listUsers()
