import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const err = (code: string, message: string, status: number) =>
  json({ error: code, message }, status)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // ── Verify caller ───────────────────────────────────────────────────
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  )

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return err('NO_SESSION', 'No valid session. Please log in.', 401)

  // ── Validate new password ──────────────────────────────────────────────
  let newPassword: string
  try {
    const body = await req.json()
    newPassword = body.new_password
  } catch {
    return err('VALIDATION_ERROR', 'Invalid request body', 400)
  }

  if (!newPassword || typeof newPassword !== 'string') {
    return err('VALIDATION_ERROR', 'new_password is required', 400)
  }

  // Min 8 chars, at least one uppercase, one digit
  const strong = /^(?=.*[A-Z])(?=.*\d).{8,}$/
  if (!strong.test(newPassword)) {
    return err(
      'WEAK_PASSWORD',
      'Password must be at least 8 characters with one uppercase letter and one number.',
      422,
    )
  }

  // ── Service client for privileged writes ───────────────────────────────
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify account state before allowing password mutation.
  const { data: profile, error: profileLookupError } = await adminClient
    .from('profiles')
    .select('tenant_id, is_active')
    .eq('id', user.id)
    .single()

  if (profileLookupError || !profile) {
    return err('PROFILE_NOT_FOUND', 'Profile not found. Contact support.', 404)
  }

  if (!profile.is_active) {
    return err('ACCOUNT_SUSPENDED', 'Your account has been suspended.', 403)
  }

  // ── Guard: only allow if must_change_password is true OR user just wants to change ──
  // We allow the call in both cases; the flag just controls UI redirect forcing.

  // 1. Update auth password
  const { error: pwError } = await adminClient.auth.admin.updateUserById(user.id, {
    password: newPassword
  })

  if (pwError) {
    console.error('change-password: auth update failed', pwError)
    return err('INTERNAL_ERROR', 'Failed to update password. Try again.', 500)
  }

  // 2. Clear must_change_password flag
  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)

  if (profileError) {
    console.error('change-password: profile update failed', profileError)
    // Password was changed successfully — non-fatal, log it
  }

  // 3. Mark credential_invite as used (most recent pending invite for this user)
  await adminClient
    .from('credential_invites')
    .update({ used_at: new Date().toISOString(), delivery_status: 'used' })
    .eq('user_id', user.id)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)

  // 4. Clear plaintext dev password from tenants (security hygiene)
  // Get user's tenant_id first
  if (profile?.tenant_id) {
    await adminClient
      .from('tenants')
      .update({
        dev_temp_password: null,
        dev_temp_password_set_at: null,
      })
      .eq('id', profile.tenant_id)
  }

  console.log('change-password: success for user', user.id)

  return json({ success: true, message: 'Password updated. must_change_password cleared.' })
})
