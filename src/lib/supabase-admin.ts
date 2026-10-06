import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Service-role Supabase client — server only.
//
// `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security. It is read only
// here, this module is `server-only` (importing it from a client component is
// a build error), the variable is never prefixed NEXT_PUBLIC_, and no route
// ever serialises it. Callers must authenticate and authorise the request
// *before* asking for this client; it is used for exactly two privileged
// operations: deleting the caller's own account, and the scheduled retention
// purge.
// ---------------------------------------------------------------------------

export function serviceRoleConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
