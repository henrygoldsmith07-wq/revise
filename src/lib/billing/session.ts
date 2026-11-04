import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sameOriginRequest } from "@/domain/account-deletion";
import type { PlusSubscription } from "@/domain/plus";

// The signed-in caller for the billing routes: the anon-key client with the
// request cookies, so the user id always comes from a verified session and
// every read is scoped by RLS to that user. Never the service role.

export type BillingSession = { supabase: SupabaseClient; user: User } | { error: NextResponse };

export async function billingSession(): Promise<BillingSession> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { error: NextResponse.json({ error: "Accounts are not configured on this server, so Plus is unavailable." }, { status: 503 }) };
  }
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options);
        } catch {
          // A read-only cookie store is still sufficient to authenticate.
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: NextResponse.json({ error: "Sign in to manage Plus." }, { status: 401 }) };
  return { supabase: supabase as unknown as SupabaseClient, user: data.user };
}

/** Billing POSTs change what someone pays for: only from this site's own pages. */
export function crossSiteRefusal(request: Request): NextResponse | null {
  return sameOriginRequest(request.url, request.headers.get("origin"), request.headers.get("sec-fetch-site"))
    ? null
    : NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
}

export interface OwnSubscription extends PlusSubscription {
  customerId: string;
}

/** The caller's own row, through RLS. Null when they have never subscribed. */
export async function ownSubscription(supabase: SupabaseClient, userId: string): Promise<{ ok: true; row: OwnSubscription | null } | { ok: false }> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false };
  if (!data) return { ok: true, row: null };
  const row = data as { stripe_customer_id: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean };
  return {
    ok: true,
    row: { customerId: row.stripe_customer_id, status: row.status, currentPeriodEnd: row.current_period_end, cancelAtPeriodEnd: row.cancel_at_period_end },
  };
}
