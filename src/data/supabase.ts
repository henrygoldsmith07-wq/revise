import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase is optional. With no URL configured the app runs entirely on
// IndexedDB as a single local profile — every feature works, only cross-device
// sync and multi-user accounts are unavailable. Nothing else in the codebase
// may assume a client exists.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  client ??= createBrowserClient(url as string, anonKey as string);
  return client;
}
