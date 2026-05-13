import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3NTUxMSwiZXhwIjoyMDkwNTUxNTExfQ.QLZjL2rNRkFquD8NLH_2wjy0NI06QkE10FLOQRduFx8'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugAll() {
  const email = 'admin@tableos.in'
  
  console.log('--- AUTH USERS ---')
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  users.forEach(u => {
    if (u.email === email) console.log(`MATCH: ${u.email} -> ${u.id}`)
  })

  console.log('--- PROFILES ---')
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
  
  profiles.forEach(p => {
    if (p.email === email || p.role === 'superadmin') {
      console.log(`MATCH PROFILE: ${p.email} | ID: ${p.id} | ROLE: ${p.role}`)
    }
  })
}

debugAll()
