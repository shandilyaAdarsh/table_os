// Script to check users table for null tenant_id values
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mdwryhxnruprtuqonbwy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kd3J5aHhucnVwcnR1cW9uYnd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzU1MTEsImV4cCI6MjA5MDU1MTUxMX0.5hGdHHSzRnfENndmbL1pdiT2LsqhJCHkz1Fq2-8ADAY'
)

console.log('=== Checking users table for null tenant_id ===\n')

// Query all users
const { data: allUsers, error: allError } = await supabase
  .from('users')
  .select('id, auth_id, email, role, tenant_id, created_at')
  .order('created_at', { ascending: false })

if (allError) {
  console.error('Error querying all users:', JSON.stringify(allError, null, 2))
} else {
  console.log(`Total users in database: ${allUsers.length}\n`)
  
  // Filter users with null tenant_id
  const usersWithNullTenant = allUsers.filter(u => u.tenant_id === null)
  
  console.log(`Users with null tenant_id: ${usersWithNullTenant.length}`)
  
  if (usersWithNullTenant.length > 0) {
    console.log('\nDetails of users with null tenant_id:')
    usersWithNullTenant.forEach(u => {
      console.log(`  ID: ${u.id}`)
      console.log(`  Auth ID: ${u.auth_id}`)
      console.log(`  Email: ${u.email}`)
      console.log(`  Role: ${u.role}`)
      console.log(`  Created: ${u.created_at}`)
      console.log('  ---')
    })
  }
  
  // Show users with valid tenant_id
  const usersWithValidTenant = allUsers.filter(u => u.tenant_id !== null)
  console.log(`\nUsers with valid tenant_id: ${usersWithValidTenant.length}`)
  
  if (usersWithValidTenant.length > 0) {
    console.log('\nSample of users with valid tenant_id:')
    usersWithValidTenant.slice(0, 5).forEach(u => {
      console.log(`  ${u.email} | role: ${u.role} | tenant: ${u.tenant_id?.slice(0, 8)}...`)
    })
  }
}

// Check tenants table to understand tenant structure
console.log('\n=== Checking tenants table ===\n')

const { data: tenants, error: tenantError } = await supabase
  .from('tenants')
  .select('*')
  .order('created_at', { ascending: false })

if (tenantError) {
  console.error('Error querying tenants:', JSON.stringify(tenantError, null, 2))
} else {
  console.log(`Total tenants in database: ${tenants.length}\n`)
  
  if (tenants.length > 0) {
    console.log('Tenants:')
    tenants.forEach(t => {
      console.log(`  Tenant:`, JSON.stringify(t, null, 2))
      console.log('  ---')
    })
  }
}
