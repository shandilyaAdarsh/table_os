# Database Migration Instructions

## Task 3.3: Apply Migration to Supabase Database

This document provides step-by-step instructions to apply the database migration that creates 8 missing tables.

---

## 📋 Overview

**Migration File**: `supabase/migrations/20260531000000_add_missing_tables.sql`

**Tables to Create**:
1. `users` - Critical for tenant resolution (Bug 2)
2. `dynamic_pricing_rules` - Fixes PGRST205 error
3. `promo_codes` - Fixes PGRST205 error
4. `credential_invites` - Onboarding support
5. `profiles` - User management
6. `guest_sessions` - Diagnostics support
7. `menu_snapshots` - Historical tracking
8. `restaurant_settings` - Configuration

---

## 🚀 Step-by-Step Instructions

### Step 1: Open Supabase Dashboard

1. Navigate to: https://supabase.com/dashboard/project/mdwryhxnruprtuqonbwy
2. Log in with your Supabase credentials

### Step 2: Access SQL Editor

1. Click on **"SQL Editor"** in the left sidebar
2. Click **"New Query"** button (top right)

### Step 3: Copy Migration SQL

1. Open the migration file:
   ```
   V:\All Projects\g8g ROS Main\Orderlli\tableos\supabase\migrations\20260531000000_add_missing_tables.sql
   ```

2. Select ALL content (Ctrl+A) and copy (Ctrl+C)

### Step 4: Paste and Execute

1. Paste the entire SQL content into the SQL Editor
2. Click **"Run"** button (or press Ctrl+Enter)
3. Wait for execution to complete (should take 5-10 seconds)

### Step 5: Verify Success

You should see a success message. If there are any errors, check:
- The `update_updated_at_column()` function exists (it should be in a previous migration)
- The `tenants` table exists (referenced by foreign keys)
- The `auth.users` table exists (referenced by foreign keys)

---

## ✅ Verification Steps

After applying the migration, verify the tables were created:

### Method 1: Using Table Editor

1. Go to **"Table Editor"** in the left sidebar
2. You should see all 8 new tables listed:
   - ✓ users
   - ✓ dynamic_pricing_rules
   - ✓ promo_codes
   - ✓ credential_invites
   - ✓ profiles
   - ✓ guest_sessions
   - ✓ menu_snapshots
   - ✓ restaurant_settings

### Method 2: Using SQL Query

Run this verification query in the SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'users',
    'dynamic_pricing_rules',
    'promo_codes',
    'credential_invites',
    'profiles',
    'guest_sessions',
    'menu_snapshots',
    'restaurant_settings'
  )
ORDER BY table_name;
```

You should see all 8 tables listed.

### Method 3: Verify RLS Policies

Run this query to verify RLS is enabled:

```sql
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'dynamic_pricing_rules',
    'promo_codes',
    'credential_invites',
    'profiles',
    'guest_sessions',
    'menu_snapshots',
    'restaurant_settings'
  )
ORDER BY tablename;
```

All tables should show `rls_enabled = true`.

### Method 4: Verify Indexes

Run this query to verify indexes were created:

```sql
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'dynamic_pricing_rules',
    'promo_codes',
    'credential_invites',
    'profiles',
    'guest_sessions',
    'menu_snapshots',
    'restaurant_settings'
  )
ORDER BY tablename, indexname;
```

You should see multiple indexes for each table (especially `idx_*_tenant_id` indexes).

---

## 🔧 Automated Verification Script

After applying the migration manually, run the verification script:

```bash
cd "V:\All Projects\g8g ROS Main\Orderlli\tableos"
node verify_migration.mjs
```

This script will:
- Check if all 8 tables are accessible via the Supabase API
- Verify RLS policies are working
- Confirm the migration was successful

---

## ⚠️ Troubleshooting

### Error: "function update_updated_at_column() does not exist"

**Solution**: Create the function first:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Then re-run the migration.

### Error: "relation 'tenants' does not exist"

**Solution**: The `tenants` table must exist before running this migration. Check if it exists:

```sql
SELECT * FROM information_schema.tables WHERE table_name = 'tenants';
```

If it doesn't exist, you need to create it first or modify the migration to remove the foreign key constraints temporarily.

### Error: "relation 'auth.users' does not exist"

**Solution**: This should not happen in Supabase as `auth.users` is a built-in table. If you see this error, contact Supabase support.

---

## 📝 Next Steps

After successfully applying the migration:

1. ✅ Mark task 3.3 as complete
2. ✅ Run the verification script: `node verify_migration.mjs`
3. ✅ Proceed to task 3.4: Verify bug condition exploration test now passes
4. ✅ Test the Taxes screen to confirm PGRST205 errors are resolved

---

## 🔗 Quick Links

- **Supabase Dashboard**: https://supabase.com/dashboard/project/mdwryhxnruprtuqonbwy
- **SQL Editor**: https://supabase.com/dashboard/project/mdwryhxnruprtuqonbwy/sql/new
- **Table Editor**: https://supabase.com/dashboard/project/mdwryhxnruprtuqonbwy/editor
- **Migration File**: `V:\All Projects\g8g ROS Main\Orderlli\tableos\supabase\migrations\20260531000000_add_missing_tables.sql`

---

## 📞 Support

If you encounter any issues:
1. Check the troubleshooting section above
2. Review the migration SQL file for comments and explanations
3. Check Supabase logs in the Dashboard under "Logs" → "Postgres Logs"
4. Ask for assistance with specific error messages
