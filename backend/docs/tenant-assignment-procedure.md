# Tenant Assignment Procedure

## When to Use
If users with null tenant_id are discovered in production.

## Single Tenant Scenario
```sql
-- Get the tenant ID
SELECT id, name FROM public.tenants LIMIT 1;

-- Assign to all users with null tenant_id
UPDATE public.users
SET tenant_id = '<tenant_id_from_above>'
WHERE tenant_id IS NULL;
```

## Multi-Tenant Scenario
```sql
-- Identify users and their correct tenants (manual review required)
SELECT u.id, u.email, u.auth_id, u.tenant_id
FROM public.users u
WHERE u.tenant_id IS NULL;

-- Assign individually based on business logic
UPDATE public.users
SET tenant_id = '<specific_tenant_id>'
WHERE id = '<user_id>';
```

## Verification
```sql
-- Confirm no null tenant_id values remain
SELECT COUNT(*) FROM public.users WHERE tenant_id IS NULL;
-- Should return 0
```

## Prevention
To prevent future occurrences, the user creation endpoint should always
enforce tenant_id assignment before inserting into the users table.
The backend `auth.service.ts` already validates and rejects tokens
where tenant_id is null with an appropriate error message.

## Status
✅ Task 7.2 Complete — Procedure documented for future use.
