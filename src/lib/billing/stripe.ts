import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { STRIPE_SUBSCRIPTION_STATUSES, type PlusInterval, type StripeSubscriptionStatus } from "@/domain/plus";

// ---------------------------------------------------------------------------
// Stripe, over its REST API. No SDK: the app makes three calls (checkout,
// portal, cancel) and checks one webhook signature, and a payment SDK in the
// dependency tree is more surface than those are worth.
//
// The secret key and webhook secret are read only here; this module is
// server-only and nothing it returns carries either. Billing is "on" as soon
// as STRIPE_SECRET_KEY is set: that is the deployment saying it charges for
// Plus, so /api/ai enforces it from then on (src/app/api/ai/route.ts) even if
// the rest of the configuration is missing — checkout then fails with a 503
// that names the gap rather than AI quietly staying free.
// ---------------------------------------------------------------------------

const STRIPE_API = "https://api.stripe.com/v1";
/** Stripe's own default tolerance for a webhook timestamp. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export { plusOnSale as billingEnabled } from "./on-sale";

export interface BillingConfig {
  secretKey: string;
  webhookSecret: string;
  prices: Record<PlusInterval, string>;
}

/** Every variable checkout and the webhook need, or the names of the missing ones. */
export function billingConfig(): { ok: true; config: BillingConfig } | { ok: false; missing: string[] } {
  const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_PLUS_MONTHLY: process.env.STRIPE_PRICE_PLUS_MONTHLY,
    STRIPE_PRICE_PLUS_YEARLY: process.env.STRIPE_PRICE_PLUS_YEARLY,
  };
  const missing = Object.entries(env).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      secretKey: env.STRIPE_SECRET_KEY!,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET!,
      prices: { month: env.STRIPE_PRICE_PLUS_MONTHLY!, year: env.STRIPE_PRICE_PLUS_YEARLY! },
    },
  };
}

export class StripeRequestError extends Error {
  constructor(readonly status: number, readonly code: string | null) {
    // Never the response body: it can echo the request.
    super(`Stripe request failed (${status}${code ? `, ${code}` : ""})`);
  }
}

async function stripe<T>(secretKey: string, method: "POST" | "DELETE", path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body: method === "POST" ? new URLSearchParams(params).toString() : undefined,
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: { code?: string } }) | null;
  if (!res.ok || !body) throw new StripeRequestError(res.status, body?.error?.code ?? null);
  return body;
}

export interface CheckoutInput {
  userId: string;
  email: string | null;
  customerId: string | null;
  interval: PlusInterval;
  successUrl: string;
  cancelUrl: string;
}

/**
 * The params for a subscription Checkout Session. The user id rides on the
 * subscription's own metadata, so every later customer.subscription.* event
 * names its account without a lookup.
 */
export function checkoutParams(input: CheckoutInput, prices: Record<PlusInterval, string>): Record<string, string> {
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": prices[input.interval],
    "line_items[0][quantity]": "1",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    "metadata[user_id]": input.userId,
    "subscription_data[metadata][user_id]": input.userId,
  };
  if (input.customerId) params.customer = input.customerId;
  else if (input.email) params.customer_email = input.email;
  return params;
}

export async function createCheckoutSession(config: BillingConfig, input: CheckoutInput): Promise<string> {
  const session = await stripe<{ url?: string | null }>(config.secretKey, "POST", "/checkout/sessions", checkoutParams(input, config.prices));
  if (!session.url) throw new StripeRequestError(502, "no_checkout_url");
  return session.url;
}

export async function createPortalSession(config: BillingConfig, customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe<{ url?: string | null }>(config.secretKey, "POST", "/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  if (!session.url) throw new StripeRequestError(502, "no_portal_url");
  return session.url;
}

/** Cancels at once. A subscription that is already gone counts as cancelled. */
export async function cancelSubscription(secretKey: string, subscriptionId: string): Promise<void> {
  try {
    await stripe(secretKey, "DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  } catch (error) {
    if (error instanceof StripeRequestError && error.status === 404) return;
    throw error;
  }
}

// --- webhooks ---------------------------------------------------------------

/**
 * Verifies a Stripe-Signature header against the raw body: an HMAC-SHA256 of
 * `${t}.${body}` under the endpoint secret, compared in constant time against
 * every v1 signature, with the timestamp inside the tolerance either way.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds: number): boolean {
  if (!header) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s.trim());
    if (key === "t" && value && /^\d+$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || !signatures.length) return false;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some((signature) => {
    if (!/^[0-9a-f]+$/i.test(signature)) return false;
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const SUBSCRIPTION_EVENTS = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"] as const;

/** One subscription event, reduced to the row public.apply_plus_subscription_event stores. */
export interface SubscriptionChange {
  userId: string;
  customerId: string;
  subscriptionId: string;
  status: StripeSubscriptionStatus;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  eventCreatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unixToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

/**
 * Parses a verified event. Null means "not ours to store": another event type,
 * or a subscription with no Revise user id on it (made outside checkout).
 */
export function subscriptionChange(event: unknown): SubscriptionChange | null {
  if (typeof event !== "object" || event === null) return null;
  const { type, created, data } = event as { type?: unknown; created?: unknown; data?: { object?: unknown } };
  if (!(SUBSCRIPTION_EVENTS as readonly unknown[]).includes(type)) return null;
  const object = data?.object as
    | {
        id?: unknown;
        customer?: unknown;
        status?: unknown;
        cancel_at_period_end?: unknown;
        current_period_end?: unknown;
        metadata?: { user_id?: unknown };
        items?: { data?: { current_period_end?: unknown; price?: { id?: unknown } }[] };
      }
    | undefined;
  const userId = object?.metadata?.user_id;
  if (typeof userId !== "string" || !UUID.test(userId)) return null;
  if (typeof object?.id !== "string" || typeof object.customer !== "string") return null;
  const status = type === "customer.subscription.deleted" ? "canceled" : object.status;
  if (!(STRIPE_SUBSCRIPTION_STATUSES as readonly unknown[]).includes(status)) return null;
  const eventCreatedAt = unixToIso(created);
  if (!eventCreatedAt) return null;
  const item = object.items?.data?.[0];
  return {
    userId,
    customerId: object.customer,
    subscriptionId: object.id,
    status: status as StripeSubscriptionStatus,
    priceId: typeof item?.price?.id === "string" ? item.price.id : null,
    // Newer API versions moved the period onto the subscription item.
    currentPeriodEnd: unixToIso(object.current_period_end) ?? unixToIso(item?.current_period_end),
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    eventCreatedAt,
  };
}

