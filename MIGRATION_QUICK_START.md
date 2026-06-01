# Migration Quick Start Guide

## 🎯 Goal
Apply database migration to create 8 missing tables in Supabase.

---

## ⚡ Quick Steps

### 1. Open Migration File
```
V:\All Projects\g8g ROS Main\Orderlli\tableos\supabase\migrations\20260531000000_add_missing_tables_FIXED.sql
```

**IMPORTANT**: Use the `_FIXED.sql` version - it has corrected RLS policies that avoid the `tenant_users.auth_id` error.

### 2. Copy All Content
- Open the file in your editor
- Select all (Ctrl+A)
- Copy (Ctrl+C)

### 3. Open Supabase SQL Editor
- Go to: https://supabase.com/dashboard/project/mdwryhxnruprtuqonbwy/sql/new
- Or navigate: Dashboard → SQL Editor → New Query

### 4. Paste and Run
- Paste the SQL (Ctrl+V)
- Click "Run" button
- Wait for completion (~5-10 seconds)

### 5. Verify
Run the verification script:
```bash
cd "V:\All Projects\g8g ROS Main\Orderlli\tableos"
node verify_migration.mjs
```

---

## 📋 Tables Being Created

1. ✅ `users` - User accounts with tenant assignment
2. ✅ `dynamic_pricing_rules` - Dynamic pricing rules
3. ✅ `promo_codes` - Promotional codes
4. ✅ `credential_invites` - User invitation system
5. ✅ `profiles` - User profiles
6. ✅ `guest_sessions` - Guest session tracking
7. ✅ `menu_snapshots` - Menu version history
8. ✅ `restaurant_settings` - Restaurant configuration

---

## 🔗 Quick Links

- **SQL Editor**: https://supabase.com/dashboard/project/mdwryhxnruprtuqonbwy/sql/new
- **Table Editor**: https://supabase.com/dashboard/project/mdwryhxnruprtuqonbwy/editor
- **Migration File**: `supabase/migrations/20260531000000_add_missing_tables_FIXED.sql` ⚠️ **USE THIS ONE**
- **Detailed Instructions**: `MIGRATION_INSTRUCTIONS.md`

---

## ✅ Success Criteria

After running the migration, you should:
- ✅ See all 8 tables in the Table Editor
- ✅ See "Success" message in SQL Editor
- ✅ Get 100% success rate from `verify_migration.mjs`
- ✅ Have RLS enabled on all tables
- ✅ Have indexes created on all tables

---

## ⚠️ If Something Goes Wrong

See `MIGRATION_INSTRUCTIONS.md` for detailed troubleshooting steps.

Common issues:
- Missing `update_updated_at_column()` function
- Missing `tenants` table
- Foreign key constraint errors

---

## 📞 Need Help?

1. Check `MIGRATION_INSTRUCTIONS.md` for detailed steps
2. Review Supabase logs: Dashboard → Logs → Postgres Logs
3. Run verification script to see specific errors
