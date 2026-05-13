import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mdwryhxnruprtuqonbwy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testLoginFlow() {
  const email = 'admin@tableos.in'
  const password = 'Admin@123456'
  
  console.log(`Attempting login for ${email}...`)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  
  if (error) {
    console.error('Login failed:', error.message)
    return
  }
  
  console.log('Login successful. User ID:', data.user.id)
  
  console.log('Attempting to read profile...')
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()
    
  if (profileError) {
    console.error('Profile read FAILED:', profileError)
  } else {
    console.log('Profile read SUCCESS:', profile)
  }
}

testLoginFlow()
