import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The shared DevDAJ Supabase project: one account across every app.
 * App data stays in that app's own tables; only auth is shared.
 */
const options = { auth: { autoRefreshToken: false, persistSession: false } };
let anon: SupabaseClient | null = null;
let admin: SupabaseClient | null = null;

/** Publishable-key client: verifies user tokens. */
export function getSupabase(): SupabaseClient {
  if (anon) return anon;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  anon = createClient(url, key, options);
  return anon;
}

/** Service-role client: bypasses RLS. Server only. */
export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  admin = createClient(url, key, options);
  return admin;
}
