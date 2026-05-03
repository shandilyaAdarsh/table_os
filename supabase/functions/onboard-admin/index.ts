import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const err = (code: string, message: string, status: number) =>
  json({ error: code, message }, status);

function makePw(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  try {
    const { email, restaurant_name, tenant_id, admin_name } = await req.json();

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const caller = userData.user;

    if (userError || !caller) {
      return err("NO_SESSION", "No valid session. Please log in.", 401);
    }

    if (!email || !tenant_id || !admin_name) {
      return err("VALIDATION_ERROR", "email, tenant_id, and admin_name are required", 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: callerProfile, error: callerProfileError } = await admin
      .from("profiles")
      .select("role, is_active")
      .eq("id", caller.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return err("PROFILE_NOT_FOUND", "Profile not found. Contact support.", 404);
    }

    if (!callerProfile.is_active) {
      return err("ACCOUNT_SUSPENDED", "Your account has been suspended.", 403);
    }

    const allowedRoles = new Set(["superadmin", "org_admin"]);
    if (!allowedRoles.has(callerProfile.role)) {
      return err("FORBIDDEN", "Insufficient permissions for this operation.", 403);
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const pw = makePw();

    const { data: listData, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return err("INTERNAL_ERROR", `User lookup failed: ${listError.message}`, 500);
    }

    const existingUser = listData?.users?.find((u) =>
      (u.email ?? "").toLowerCase() === normalizedEmail
    );

    let userId = "";
    let isExistingUser = false;

    if (existingUser) {
      userId = existingUser.id;
      isExistingUser = true;

      const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
        password: pw,
        user_metadata: {
          admin_name,
          restaurant_name,
          tenant_id,
          role: "owner",
        },
      });

      if (pwErr) {
        return err("INTERNAL_ERROR", `Password reset failed: ${pwErr.message}`, 500);
      }
    } else {
      const { data: user, error: authError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: pw,
        email_confirm: true,
        user_metadata: {
          admin_name,
          restaurant_name,
          tenant_id,
          role: "owner",
        },
      });

      if (authError) {
        return err("INTERNAL_ERROR", authError.message, 400);
      }

      userId = user.user?.id ?? "";
      if (!userId) {
        return err("INTERNAL_ERROR", "User creation returned no ID", 500);
      }
    }

    const invitePayload = {
      user_id: userId,
      tenant_id,
      email: normalizedEmail,
      delivery_status: "failed",
      delivery_attempts: 1,
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { error: inviteError } = await admin
      .from("credential_invites")
      .upsert(invitePayload, { onConflict: "tenant_id,email" });

    if (inviteError) {
      console.warn("credential_invites upsert failed", inviteError.message);
    }

    return json({
      success: true,
      user_id: userId,
      email_sent: false,
      is_existing_user: isExistingUser,
      dev_credentials: {
        email: normalizedEmail,
        password: pw,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return err("INTERNAL_ERROR", message, 500);
  }
});
