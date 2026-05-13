import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk3NTUxMSwiZXhwIjoyMDkwNTUxNTExfQ.QLZjL2rNRkFquD8NLH_2wjy0NI06QkE10FLOQRduFx8'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkAndFixAdmin() {
  const email = 'admin@tableos.in'
  
  console.log(`Checking user: ${email}...`)
  
  // 1. Find user in auth
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError) {
    console.error('Error listing users:', usersError)
    return
  }

  const user = users.find(u => u.email === email)
  if (!user) {
    console.error(`User ${email} not found in auth.`)
    return
  }

  console.log(`Found auth user ID: ${user.id}`)

  // 2. Check profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError) {
    if (profileError.code === 'PGRST116') {
      console.log('Profile not found. Creating one...')
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: email,
          role: 'superadmin',
          full_name: 'System Admin'
        })
      if (insertError) console.error('Error creating profile:', insertError)
      else console.log('Profile created as superadmin.')
    } else {
      console.error('Error fetching profile:', profileError)
    }
  } else {
    console.log(`Profile found. Current role: ${profile.role}`)
    if (profile.role !== 'superadmin') {
      console.log('Updating role to superadmin...')
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'superadmin' })
        .eq('id', user.id)
      
      if (updateError) console.error('Error updating profile:', updateError)
      else console.log('Profile updated to superadmin.')
    } else {
      console.log('Profile is already superadmin. Login should work.')
    }
  }
}

checkAndFixAdmin()
