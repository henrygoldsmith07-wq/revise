import { NextResponse } from "next/server";
import { hasPlus } from "@/domain/plus";
import { billingSession, ownSubscription } from "@/lib/billing/session";
import { billingEnabled } from "@/lib/billing/stripe";

// What the Settings card needs: whether this server sells Plus at all, and the
// caller's own subscription. Never another account's, never Stripe ids.

export const runtime = "nodejs";
const PRIVATE = { "cache-control": "private, no-store" };

export async function GET() {
  if (!billingEnabled()) return NextResponse.json({ enabled: false, signedIn: null, plus: false, subscription: null }, { headers: PRIVATE });
  const session = await billingSession();
  if ("error" in session) {
    if (session.error.status === 401) return NextResponse.json({ enabled: true, signedIn: false, plus: false, subscription: null }, { headers: PRIVATE });
    return session.error;
  }
  const existing = await ownSubscription(session.supabase, session.user.id);
  if (!existing.ok) return NextResponse.json({ error: "Your subscription could not be checked. Try again shortly." }, { status: 503, headers: PRIVATE });
  const row = existing.row;
  return NextResponse.json(
    {
      enabled: true,
      signedIn: true,
      plus: hasPlus(row, new Date()),
      subscription: row ? { status: row.status, currentPeriodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: row.cancelAtPeriodEnd } : null,
    },
    { headers: PRIVATE },
  );
}
