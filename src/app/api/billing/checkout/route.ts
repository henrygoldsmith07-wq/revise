import { NextResponse } from "next/server";
import { hasPlus, isPlusInterval } from "@/domain/plus";
import { readBoundedText } from "@/lib/bounded-body";
import { billingSession, crossSiteRefusal, ownSubscription } from "@/lib/billing/session";
import { billingConfig, createCheckoutSession, StripeRequestError } from "@/lib/billing/stripe";
import { errorClass } from "@/lib/observability";
import { absoluteUrl } from "@/lib/site";

// Starts a Stripe Checkout for Plus. Order: configuration (503), same-origin
// (403), body (400/413), a verified session (401), then Stripe. The user id
// comes from the session, never the body; the return URLs come from SITE_URL,
// never a Host header.

export const runtime = "nodejs";
const MAX_BODY_CHARS = 200;

export async function POST(request: Request) {
  const configured = billingConfig();
  if (!configured.ok) {
    console.error("[billing] checkout not configured", { missing: configured.missing });
    return NextResponse.json({ error: "Plus checkout is not set up on this server yet." }, { status: 503 });
  }
  const refused = crossSiteRefusal(request);
  if (refused) return refused;

  const read = await readBoundedText(request, MAX_BODY_CHARS);
  if (!read.ok) {
    return read.reason === "too-large"
      ? NextResponse.json({ error: "Request body is too large." }, { status: 413 })
      : NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  let interval: unknown;
  try {
    interval = (JSON.parse(read.text) as { interval?: unknown } | null)?.interval;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!isPlusInterval(interval)) return NextResponse.json({ error: 'interval must be "month" or "year".' }, { status: 400 });

  const session = await billingSession();
  if ("error" in session) return session.error;
  const existing = await ownSubscription(session.supabase, session.user.id);
  if (!existing.ok) return NextResponse.json({ error: "Your subscription could not be checked. Try again shortly." }, { status: 503 });
  if (hasPlus(existing.row, new Date())) {
    return NextResponse.json({ error: "You already have Plus. Manage it from Settings → Plus." }, { status: 409 });
  }

  try {
    const url = await createCheckoutSession(configured.config, {
      userId: session.user.id,
      email: session.user.email ?? null,
      customerId: existing.row?.customerId ?? null,
      interval,
      successUrl: absoluteUrl("/settings?plus=success"),
      cancelUrl: absoluteUrl("/pricing"),
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error("[billing] checkout failed", { errorClass: errorClass(error), status: error instanceof StripeRequestError ? error.status : null });
    return NextResponse.json({ error: "Checkout could not be started. Nothing has been charged; try again shortly." }, { status: 502 });
  }
}
