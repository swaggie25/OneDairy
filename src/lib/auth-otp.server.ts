import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { APP_ROLES, normalizePhone, type AppRole } from "./roles";

const OTP_TTL_MINUTES = 10;

function syntheticEmail(phone: string) {
  return `p${phone}@phone.dairyone.app`;
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** Creates and stores a one-time code. Returns the code so dev mode can show it. */
export async function issueOtp(rawPhone: string, role: AppRole) {
  const phone = normalizePhone(rawPhone);
  const db = await admin();
  const code = randomCode();
  const expires = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  const { error } = await db
    .from("otp_codes")
    .insert({ phone, code, role, expires_at: expires });
  if (error) throw new Error(error.message);

  // TODO(MSG91): POST to MSG91 /api/v5/otp here with the template id once keys exist.
  return { phone, code, devMode: true as const, expiresAt: expires };
}

export async function verifyOtpAndSignIn(rawPhone: string, rawCode: string, fullName?: string) {
  const phone = normalizePhone(rawPhone);
  const code = (rawCode || "").trim();
  const db = await admin();

  const { data: rows, error } = await db
    .from("otp_codes")
    .select("*")
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const otp = rows?.[0];
  if (!otp) throw new Error("No login code was requested for this number.");
  if (new Date(otp.expires_at).getTime() < Date.now()) throw new Error("This code has expired.");
  if (otp.attempts >= 5) throw new Error("Too many attempts. Request a new code.");
  if (otp.code !== code) {
    await db.from("otp_codes").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
    throw new Error("Incorrect code.");
  }
  await db.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);

  const email = syntheticEmail(phone);
  const password = randomPassword();

  const { data: existing } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("phone", phone)
    .maybeSingle();

  let userId = existing?.id ?? null;

  if (userId) {
    const { error: updErr } = await db.auth.admin.updateUserById(userId, { password });
    if (updErr) throw new Error(updErr.message);
  } else {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { phone, full_name: fullName ?? null },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Could not create user.");
    userId = created.user.id;

    const { error: profErr } = await db
      .from("profiles")
      .insert({ id: userId, phone, full_name: fullName?.trim() || `User ${phone.slice(-4)}` });
    if (profErr) throw new Error(profErr.message);
  }

  // Assign the requested role only when the account has none yet.
  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", userId);
  let role = (roleRows?.[0]?.role as AppRole | undefined) ?? undefined;
  if (!role) {
    const requested = (otp.role as AppRole | null) ?? "farmer";
    role = APP_ROLES.includes(requested) ? requested : "farmer";
    const { error: roleErr } = await db.from("user_roles").insert({ user_id: userId, role });
    if (roleErr) throw new Error(roleErr.message);
  }

  const { data: signIn, error: signInErr } = await publicClient().auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr || !signIn.session) throw new Error(signInErr?.message ?? "Sign in failed.");

  return {
    role,
    accessToken: signIn.session.access_token,
    refreshToken: signIn.session.refresh_token,
  };
}
