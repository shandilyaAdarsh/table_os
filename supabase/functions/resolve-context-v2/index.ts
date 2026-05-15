import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;

  if (userError || !user || !token) {
    return json({ error: "NO_SESSION", message: "No valid session. Please log in." }, 401);
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: profile, error: profileError } = await adminClient
    .from("admin_profiles")
    .select(
      "id, role, full_name, is_active, must_change_password, tenant_id, tenants(id, name, slug, plan, status, is_active, next_billing_date)",
    )
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return json({ error: "PROFILE_NOT_FOUND", message: "Profile not found. Contact support." }, 404);
  }

  if (!profile.is_active) {
    return json({ error: "ACCOUNT_SUSPENDED", message: "Your account has been suspended." }, 403);
  }

  const tenant = profile.tenants as Record<string, unknown> | null;
  if (!tenant) {
    return json({ error: "TENANT_NOT_FOUND", message: "No restaurant linked to this account." }, 404);
  }

  if (tenant.is_active === false) {
    return json({ error: "TENANT_SUSPENDED", message: "This restaurant account has been suspended." }, 403);
  }

  const { data: onboarding } = await adminClient
    .from("onboarding_state")
    .select("is_complete, steps_completed")
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  const onboardingComplete = onboarding?.is_complete ?? false;

  return json({
    user: {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role,
      must_change_password: profile.must_change_password,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      status: tenant.status,
      next_billing_date: tenant.next_billing_date,
    },
    onboarding: {
      is_complete: onboardingComplete,
      steps_completed: onboarding?.steps_completed ?? [],
    },
    flags: {
      must_change_password: profile.must_change_password === true,
      subscription_expired: tenant.status === "expired",
      account_suspended: tenant.status === "suspended",
      onboarding_required: !onboardingComplete,
    },
  });
});
