import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_CONSENT_VERSION } from "@/domain/ai-consent";
import { formatPence, hasPlus, PLUS_PLAN, PLUS_REQUIRED_CODE, PLUS_UNAVAILABLE_CODE } from "@/domain/plus";

// Revise Plus billing with mocked edges: the cookie session (anon key), the
// service-role client and Stripe's HTTP API (global fetch). Asserts on real
// route responses, and on the exact requests that would reach Stripe.

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      }),
  },
}));

let sessionUser: { id: string; email?: string } | null = null;
let ownRow: Record<string, unknown> | null = null;
let hasPlusResult: { data: unknown; error: unknown } = { data: false, error: null };
const adminCalls: { fn: string; args: Record<string, unknown> }[] = [];
let adminError: { message: string } | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "ai_consent"
              ? { data: { enabled: true, consent_version: AI_CONSENT_VERSION }, error: null }
              : { data: ownRow, error: null },
        }),
      }),
    }),
    rpc: async (fn: string) => (fn === "has_plus" ? hasPlusResult : { data: null, error: null }),
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      adminCalls.push({ fn, args });
      return { data: adminError ? null : true, error: adminError };
    },
  }),
}));

import { POST as aiPost } from "@/app/api/ai/route";
import { POST as checkoutPost } from "@/app/api/billing/checkout/route";
import { GET as statusGet } from "@/app/api/billing/status/route";
import { POST as webhookPost } from "@/app/api/billing/webhook/route";
import { checkoutParams, subscriptionChange, verifyStripeSignature, WEBHOOK_TOLERANCE_SECONDS } from "@/lib/billing/stripe";
import sitemap from "@/app/sitemap";
import { renderMarkdown } from "@/lib/md/registry";
import { PRICING_PATH, pricingPage } from "@/lib/pricing-page";
import { absoluteUrl } from "@/lib/site";
import { renderStaticHtml } from "@/lib/static-page";

const USER = "aaaaaaaa-1111-4111-8111-111111111111";
const SECRET = "whsec_test";
const ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  STRIPE_SECRET_KEY: "sk_test_secret_DO_NOT_LEAK",
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_PRICE_PLUS_MONTHLY: "price_month",
  STRIPE_PRICE_PLUS_YEARLY: "price_year",
};
const saved: Record<string, string | undefined> = {};

function sign(body: string, timestamp: number, secret = SECRET): string {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

function subscriptionEvent(overrides: Record<string, unknown> = {}, type = "customer.subscription.updated") {
  return {
    id: "evt_1",
    type,
    created: 1_790_000_000,
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        metadata: { user_id: USER },
        items: { data: [{ current_period_end: 1_792_000_000, price: { id: "price_month" } }] },
        ...overrides,
      },
    },
  };
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://revise.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://revise.example", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  sessionUser = { id: USER, email: "learner@example.com" };
  ownRow = null;
  hasPlusResult = { data: false, error: null };
  adminCalls.length = 0;
  adminError = null;
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("Plus plan facts", () => {
  it("prices Plus at £2.99 a month or £24 a year", () => {
    expect(formatPence(PLUS_PLAN.prices.month)).toBe("£2.99");
    expect(formatPence(PLUS_PLAN.prices.year)).toBe("£24");
  });

  it("grants Plus only for a granting status inside the period", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(hasPlus(null, now)).toBe(false);
    expect(hasPlus({ status: "active", currentPeriodEnd: "2026-11-30T00:00:00Z", cancelAtPeriodEnd: true }, now)).toBe(true);
    expect(hasPlus({ status: "past_due", currentPeriodEnd: null, cancelAtPeriodEnd: false }, now)).toBe(true);
    expect(hasPlus({ status: "active", currentPeriodEnd: "2026-10-01T00:00:00Z", cancelAtPeriodEnd: false }, now)).toBe(false);
    expect(hasPlus({ status: "canceled", currentPeriodEnd: "2026-11-30T00:00:00Z", cancelAtPeriodEnd: false }, now)).toBe(false);
    expect(hasPlus({ status: "unpaid", currentPeriodEnd: null, cancelAtPeriodEnd: false }, now)).toBe(false);
  });
});

describe("Stripe webhook signatures", () => {
  const body = JSON.stringify(subscriptionEvent());
  const now = 1_790_000_100;

  it("accepts a correct signature inside the tolerance, among several v1 values", () => {
    expect(verifyStripeSignature(body, sign(body, now), SECRET, now)).toBe(true);
    expect(verifyStripeSignature(body, `${sign(body, now)},v1=${"0".repeat(64)}`, SECRET, now)).toBe(true);
  });

  it("refuses a tampered body, a wrong secret, a stale timestamp or a missing header", () => {
    expect(verifyStripeSignature(`${body} `, sign(body, now), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now, "whsec_other"), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now - WEBHOOK_TOLERANCE_SECONDS - 1), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, null, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now},v1=nothex`, SECRET, now)).toBe(false);
  });
});

describe("subscription events", () => {
  it("reduces an event to the stored row, reading the period from the item when the subscription lacks it", () => {
    expect(subscriptionChange(subscriptionEvent())).toEqual({
      userId: USER,
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      priceId: "price_month",
      currentPeriodEnd: new Date(1_792_000_000 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      eventCreatedAt: new Date(1_790_000_000 * 1000).toISOString(),
    });
  });

  it("stores a deleted subscription as canceled", () => {
    expect(subscriptionChange(subscriptionEvent({}, "customer.subscription.deleted"))?.status).toBe("canceled");
  });

  it("ignores other event types, subscriptions with no Revise user, and unknown statuses", () => {
    expect(subscriptionChange(subscriptionEvent({}, "invoice.paid"))).toBeNull();
    expect(subscriptionChange(subscriptionEvent({ metadata: {} }))).toBeNull();
    expect(subscriptionChange(subscriptionEvent({ metadata: { user_id: "not-a-uuid" } }))).toBeNull();
    expect(subscriptionChange(subscriptionEvent({ status: "made_up" }))).toBeNull();
    expect(subscriptionChange(null)).toBeNull();
  });
});

describe("checkout params", () => {
  const prices = { month: "price_month", year: "price_year" };
  const base = { userId: USER, email: "learner@example.com", customerId: null, interval: "year" as const, successUrl: "https://s", cancelUrl: "https://c" };

  it("puts the user id on the subscription so every later event names the account", () => {
    const params = checkoutParams(base, prices);
    expect(params.mode).toBe("subscription");
    expect(params["line_items[0][price]"]).toBe("price_year");
    expect(params["subscription_data[metadata][user_id]"]).toBe(USER);
    expect(params.client_reference_id).toBe(USER);
    expect(params.customer_email).toBe("learner@example.com");
  });

  it("reuses an existing Stripe customer instead of the email", () => {
    const params = checkoutParams({ ...base, customerId: "cus_9" }, prices);
    expect(params.customer).toBe("cus_9");
    expect(params.customer_email).toBeUndefined();
  });
});

describe("POST /api/billing/webhook", () => {
  const now = () => Math.floor(Date.now() / 1000);

  it("fails closed without the webhook secret", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const body = JSON.stringify(subscriptionEvent());
    const res = await webhookPost(post("/api/billing/webhook", body, { "stripe-signature": sign(body, now()) }));
    expect(res.status).toBe(503);
    expect(adminCalls).toEqual([]);
  });

  it("refuses an unsigned or forged event and writes nothing", async () => {
    const body = JSON.stringify(subscriptionEvent());
    expect((await webhookPost(post("/api/billing/webhook", body))).status).toBe(400);
    expect((await webhookPost(post("/api/billing/webhook", body, { "stripe-signature": sign(body, now(), "whsec_forged") }))).status).toBe(400);
    expect(adminCalls).toEqual([]);
  });

  it("applies a signed subscription event through the service-role function", async () => {
    const body = JSON.stringify(subscriptionEvent());
    const res = await webhookPost(post("/api/billing/webhook", body, { "stripe-signature": sign(body, now()) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, applied: true });
    expect(adminCalls).toHaveLength(1);
    expect(adminCalls[0]).toMatchObject({ fn: "apply_plus_subscription_event", args: { p_user_id: USER, p_status: "active", p_subscription_id: "sub_1" } });
  });

  it("acknowledges an event that is not a Revise subscription without writing", async () => {
    const body = JSON.stringify(subscriptionEvent({}, "invoice.paid"));
    const res = await webhookPost(post("/api/billing/webhook", body, { "stripe-signature": sign(body, now()) }));
    expect(res.status).toBe(200);
    expect(adminCalls).toEqual([]);
  });

  it("returns 500 when the write fails, so Stripe retries", async () => {
    adminError = { message: "db down" };
    const body = JSON.stringify(subscriptionEvent());
    const res = await webhookPost(post("/api/billing/webhook", body, { "stripe-signature": sign(body, now()) }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/billing/checkout", () => {
  function stripeOk() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_1" }), { status: 200 }));
  }

  it("names no secret when unconfigured", async () => {
    delete process.env.STRIPE_PRICE_PLUS_YEARLY;
    const res = await checkoutPost(post("/api/billing/checkout", { interval: "year" }));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("STRIPE");
  });

  it("refuses cross-site requests, bad intervals and signed-out callers before reaching Stripe", async () => {
    const fetchSpy = stripeOk();
    expect((await checkoutPost(post("/api/billing/checkout", { interval: "year" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await checkoutPost(post("/api/billing/checkout", { interval: "week" }))).status).toBe(400);
    expect((await checkoutPost(post("/api/billing/checkout", "not json"))).status).toBe(400);
    sessionUser = null;
    expect((await checkoutPost(post("/api/billing/checkout", { interval: "year" }))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not sell Plus twice", async () => {
    const fetchSpy = stripeOk();
    ownRow = { stripe_customer_id: "cus_1", status: "active", current_period_end: "2999-01-01T00:00:00Z", cancel_at_period_end: false };
    expect((await checkoutPost(post("/api/billing/checkout", { interval: "month" }))).status).toBe(409);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates a session for the signed-in account, never one named in the body", async () => {
    const fetchSpy = stripeOk();
    const res = await checkoutPost(post("/api/billing/checkout", { interval: "month", userId: "someone-else" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_1" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions");
    const sent = new URLSearchParams(String(init?.body));
    expect(sent.get("subscription_data[metadata][user_id]")).toBe(USER);
    expect(sent.get("line_items[0][price]")).toBe("price_month");
    expect(String(init?.body)).not.toContain("someone-else");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sk_test_secret_DO_NOT_LEAK");
  });

  it("reports a Stripe failure without echoing it or the key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "resource_missing", message: "No such price: price_month" } }), { status: 400 }));
    const res = await checkoutPost(post("/api/billing/checkout", { interval: "month" }));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("price_month");
    expect(text).not.toContain("sk_test");
  });
});

describe("GET /api/billing/status", () => {
  it("says Plus is not sold when billing is off", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(await (await statusGet()).json()).toMatchObject({ enabled: false, plus: false });
  });

  it("reports a signed-out visitor without an error", async () => {
    sessionUser = null;
    expect(await (await statusGet()).json()).toMatchObject({ enabled: true, signedIn: false, plus: false });
  });

  it("reports the caller's own subscription and no Stripe ids", async () => {
    ownRow = { stripe_customer_id: "cus_1", status: "active", current_period_end: "2999-01-01T00:00:00Z", cancel_at_period_end: true };
    const res = await statusGet();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ plus: true, subscription: { status: "active", cancelAtPeriodEnd: true } });
    expect(text).not.toContain("cus_1");
  });
});

describe("POST /api/ai with Plus on sale", () => {
  const explain = () => post("/api/ai", { task: "explain", payload: { topicId: "wjec-alevel-physics.waves" } });

  it("refuses a signed-in account without Plus with a code the client stops retrying on", async () => {
    const res = await aiPost(explain());
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: PLUS_REQUIRED_CODE });
  });

  it("fails closed when Plus cannot be checked", async () => {
    hasPlusResult = { data: null, error: { message: "db down" } };
    const res = await aiPost(explain());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: PLUS_UNAVAILABLE_CODE });
  });

  it("lets a Plus account past the gate", async () => {
    hasPlusResult = { data: true, error: null };
    const res = await aiPost(post("/api/ai", { task: "not-a-task", payload: {} }));
    // Past consent and Plus, the request reaches payload validation.
    expect(res.status).toBe(400);
  });

  it("does not gate AI at all when this server does not sell Plus", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await aiPost(post("/api/ai", { task: "not-a-task", payload: {} }));
    expect(res.status).toBe(400);
  });
});

describe("/pricing", () => {
  const html = renderStaticHtml(pricingPage());

  it("is an indexable, script-free page in the sitemap, with a twin", () => {
    expect(html).toContain('<meta name="robots" content="index, follow">');
    expect(html).toContain(`<link rel="canonical" href="${absoluteUrl(PRICING_PATH)}">`);
    expect(html).not.toContain("<script");
    expect(sitemap().map((entry) => entry.url)).toContain(absoluteUrl(PRICING_PATH));
    expect(renderMarkdown(PRICING_PATH)!.text).toContain(`Canonical: ${absoluteUrl(PRICING_PATH)}`);
  });

  it("quotes the plan's own prices and every feature on each side", () => {
    expect(html).toContain("£2.99 a month");
    expect(html).toContain("£24 a year");
    for (const feature of [...PLUS_PLAN.free, ...PLUS_PLAN.unlocks]) expect(html).toContain(feature);
  });

  it("claims nothing the trust position cannot back", () => {
    expect(html).not.toMatch(/\bproven\b|guarantee|boost|improves? (your )?grades?/i);
    expect(html).toContain("It is not a human review");
  });
});
