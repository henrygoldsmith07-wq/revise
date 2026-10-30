import { NextResponse } from "next/server";
import { readBoundedText } from "@/lib/bounded-body";
import { subscriptionChange, verifyStripeSignature } from "@/lib/billing/stripe";
import { errorClass } from "@/lib/observability";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Stripe's subscription events, the only writer of public.subscriptions.
//
// The signature over the raw body is checked before anything is parsed; an
// unsigned or stale request is a 400 and touches nothing. Events that are not
// a Revise subscription are acknowledged and ignored. A database failure is a
// 500 so Stripe retries; apply_plus_subscription_event ignores an event older
// than the stored one, so retries and out-of-order delivery are safe.

export const runtime = "nodejs";
const MAX_BODY_CHARS = 256_000;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = getSupabaseAdmin();
  if (!secret || !admin) {
    console.error("[billing] webhook not configured", { secret: Boolean(secret), serviceRole: Boolean(admin) });
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }
  const read = await readBoundedText(request, MAX_BODY_CHARS);
  if (!read.ok) return NextResponse.json({ error: "Invalid body." }, { status: read.reason === "too-large" ? 413 : 400 });
  if (!verifyStripeSignature(read.text, request.headers.get("stripe-signature"), secret, Math.floor(Date.now() / 1000))) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  let event: unknown;
  try {
    event = JSON.parse(read.text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const change = subscriptionChange(event);
  if (!change) return NextResponse.json({ received: true, applied: false });

  const { data, error } = await admin.rpc("apply_plus_subscription_event", {
    p_user_id: change.userId,
    p_customer_id: change.customerId,
    p_subscription_id: change.subscriptionId,
    p_status: change.status,
    p_price_id: change.priceId,
    p_current_period_end: change.currentPeriodEnd,
    p_cancel_at_period_end: change.cancelAtPeriodEnd,
    p_event_created_at: change.eventCreatedAt,
  });
  if (error) {
    console.error("[billing] webhook write failed", { errorClass: errorClass(error) });
    return NextResponse.json({ error: "Could not record the event." }, { status: 500 });
  }
  return NextResponse.json({ received: true, applied: data === true });
}
