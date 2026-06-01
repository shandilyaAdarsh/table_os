// Script to check table schemas
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

console.log('=== Checking users table ===\n')

// Try to query users with minimal fields
const { data: users, error: usersError } = await supabase
  .from('users')
  .select('*')
  .limit(1)

if (usersError) {
  console.error('Error querying users:', JSON.stringify(usersError, null, 2))
} else {
  console.log('Users table query successful')
  console.log('Sample user (if any):', JSON.stringify(users, null, 2))
}

console.log('\n=== Checking tenants table ===\n')

// Try to query tenants with minimal fields
const { data: tenants, error: tenantsError } = await supabase
  .from('tenants')
  .select('*')
  .limit(1)

if (tenantsError) {
  console.error('Error querying tenants:', JSON.stringify(tenantsError, null, 2))
} else {
  console.log('Tenants table query successful')
  console.log('Sample tenant (if any):', JSON.stringify(tenants, null, 2))
}
