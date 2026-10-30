import { NextResponse } from "next/server";
import { billingSession, crossSiteRefusal, ownSubscription } from "@/lib/billing/session";
import { billingConfig, createPortalSession, StripeRequestError } from "@/lib/billing/stripe";
import { errorClass } from "@/lib/observability";
import { absoluteUrl } from "@/lib/site";

// Opens Stripe's customer portal, where a subscriber changes card, switches
// between monthly and yearly, or cancels. Only for the caller's own customer,
// read through RLS.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configured = billingConfig();
  if (!configured.ok) return NextResponse.json({ error: "Plus is not set up on this server yet." }, { status: 503 });
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const session = await billingSession();
  if ("error" in session) return session.error;
  const existing = await ownSubscription(session.supabase, session.user.id);
  if (!existing.ok) return NextResponse.json({ error: "Your subscription could not be checked. Try again shortly." }, { status: 503 });
  if (!existing.row) return NextResponse.json({ error: "This account has never subscribed to Plus." }, { status: 404 });
  try {
    const url = await createPortalSession(configured.config, existing.row.customerId, absoluteUrl("/settings"));
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[billing] portal failed", { errorClass: errorClass(error), status: error instanceof StripeRequestError ? error.status : null });
    return NextResponse.json({ error: "The billing portal could not be opened. Try again shortly." }, { status: 502 });
  }
}
