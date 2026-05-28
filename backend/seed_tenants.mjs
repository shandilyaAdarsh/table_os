import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const tenants = [
  { name: 'Royal Tandoor', email: 'royaltandoor.owner@test.com', phone: '1111111111' },
  { name: 'Ocean Bite', email: 'oceanbite.owner@test.com', phone: '2222222222' },
  { name: 'Test Cafe', email: 'testcafe.owner@test.com', phone: '3333333333' }
];

async function seed() {
  for (const t of tenants) {
    console.log(`Creating user for ${t.name}...`);
    
    // 1. Get Existing User if any
    const { data: listData } = await supabase.auth.admin.listUsers();
    let authUser = listData?.users.find(u => u.email === t.email);
    
    if (!authUser) {
        // 2. Create Auth User
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: t.email,
            password: 'Test@123456',
            email_confirm: true,
        });
        
        if (authError) {
            console.error(`Error creating auth user for ${t.name}:`, authError.message);
            continue;
        }
        authUser = authData.user;
        console.log(`Created new auth user ${authUser.id}`);
    } else {
        console.log(`Reusing existing auth user ${authUser.id}`);
        // Reset password just in case
        await supabase.auth.admin.updateUserById(authUser.id, { password: 'Test@123456', email_confirm: true });
    }
    
    const userId = authUser.id;

    // 2. Create/Update Platform User
    const { error: platformError } = await supabase.from('platform_users').upsert({
      id: userId,
      email: t.email,
      full_name: `${t.name} Owner`,
      phone: t.phone,
      is_super_admin: false
    });
    if (platformError) console.error("Platform user err:", platformError.message);

    // 3. Create/Get Tenant
    const slug = t.name.toLowerCase().replace(/\s+/g, '-');
    let tenantId;
    const { data: existingTenant } = await supabase.from('tenants').select('id').eq('slug', slug).single();
    if (existingTenant) {
        tenantId = existingTenant.id;
    } else {
        const { data: tenantData, error: tenantError } = await supabase.from('tenants').insert({
          name: t.name,
          slug: slug,
          status: 'active'
        }).select('id').single();
        if (tenantError) {
          console.error("Tenant err:", tenantError.message);
          continue;
        }
        tenantId = tenantData.id;
    }

    // 4. Create/Get Branch
    let branchId;
    const { data: existingBranch } = await supabase.from('branches').select('id').eq('tenant_id', tenantId).eq('name', 'Main Branch').single();
    if (existingBranch) {
        branchId = existingBranch.id;
    } else {
        const { data: branchData, error: branchError } = await supabase.from('branches').insert({
          tenant_id: tenantId,
          name: 'Main Branch',
          status: 'active',
          timezone: 'UTC'
        }).select('id').single();
        if (branchError) console.error("Branch err:", branchError.message);
        branchId = branchData?.id;
    }

    // Update Auth User with app_metadata
    await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        tenant_id: tenantId,
        branch_ids: [branchId]
      }
    });

    // 5. Create Admin Profile
    const { error: adminError } = await supabase.from('admin_profiles').upsert({
      id: userId,
      tenant_id: tenantId,
      role: 'RESTAURANT_ADMIN',
      full_name: `${t.name} Owner`,
      phone: t.phone,
      is_active: true
    });
    if (adminError) console.error("Admin Profile err:", adminError.message);

    // 6. Create Tenant User (instead of tenant_memberships)
    const { error: memberError } = await supabase.from('tenant_users').upsert({
      user_id: userId,
      tenant_id: tenantId,
      role: 'RESTAURANT_ADMIN'
    }, { onConflict: 'tenant_id,user_id' });
    if (memberError) console.error("Tenant User err:", memberError.message);

    // 7. Create Staff Record
    const pin = '1234';
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex'); // simplified hash for seed

    // Just try inserting, if fails it's fine since there's no easy unique constraint besides ID, but we can delete old ones first
    await supabase.from('staff').delete().eq('user_id', userId).eq('tenant_id', tenantId);

    const { error: staffError } = await supabase.from('staff').insert({
      tenant_id: tenantId,
      user_id: userId,
      branch_id: branchId,
      first_name: t.name,
      last_name: 'Owner',
      role: 'MANAGER',
      pin_code_hash: pinHash,
      status: 'active'
    });
    if (staffError) console.error("Staff err:", staffError.message);

    console.log(`✅ Fully seeded ${t.name} (Tenant: ${tenantId}, Branch: ${branchId})`);
  }
}

seed().catch(console.error);
