"use client";

import { useEffect } from "react";
import { getSupabase } from "@/data/supabase";

/**
 * Keeps a signed-in teacher's session cookie fresh while the portal is open.
 *
 * Portal pages are Server Components, which can read the session cookie but
 * cannot write a refreshed one. Until the eighteenth pass the student
 * AccountBoundary happened to run a Supabase browser client on every route,
 * and that client refreshed the token in the background. The portal no
 * longer renders inside the student shell, so it starts the same browser
 * client itself (createBrowserClient refreshes before expiry and writes the
 * cookie). It reads and changes nothing else.
 */
export function ReviewerSessionKeeper() {
  useEffect(() => {
    getSupabase();
  }, []);
  return null;
}
