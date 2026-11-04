// ---------------------------------------------------------------------------
// Revise Plus — the pure rules: what it costs, what it unlocks, and what
// "this account has Plus" means.
//
// Plus unlocks cloud AI only: model marking and feedback, the tutor, photo to
// text and the other /api/ai tasks, because each call has a real per-request
// provider cost. Everything else stays free, including sync: taking backup
// away from a free learner in a local-first app would make a lost device a
// lost year. The offline marker and the in-browser model are free and remain
// the fallback for every AI feature.
//
// Prices are the single source for the pricing page and the upgrade card. The
// amounts Stripe actually charges come from the configured Stripe prices; a
// change here must be matched there.
// ---------------------------------------------------------------------------

export type PlusInterval = "month" | "year";

export const PLUS_PLAN = {
  name: "Revise Plus",
  currency: "GBP",
  prices: { month: 299, year: 2400 } satisfies Record<PlusInterval, number>,
  unlocks: [
    "AI marking: a model marks your written answers against the mark scheme, point by point",
    "AI feedback on what you lost marks for, and the AI tutor",
    "Photo to text for handwritten answers, and cards from your own notes",
  ],
  free: [
    "Spaced repetition, the plan and the one thing to do next",
    "Exam-style practice with the offline marker",
    "Lessons, the library and the WJEC Physics guides",
    "Sync and backup across your devices, with an account",
    "The in-browser AI model, which runs on your device",
  ],
} as const;

/** Pence to "£2.99"; whole pounds drop the pence ("£24"). */
export function formatPence(pence: number): string {
  const pounds = pence / 100;
  return `£${Number.isInteger(pounds) ? pounds : pounds.toFixed(2)}`;
}

/** Error code /api/ai returns when the account has no Plus, so the client explains rather than retries. */
export const PLUS_REQUIRED_CODE = "plus-required";
export const PLUS_REQUIRED_MESSAGE =
  "Cloud AI is part of Revise Plus, so the offline version answered instead. Subscribe in Settings → Plus.";
export const PLUS_UNAVAILABLE_CODE = "plus-unavailable";
export const PLUS_UNAVAILABLE_MESSAGE =
  "Your Plus subscription could not be checked right now, so the offline version answered instead. Try again shortly.";

/** Stripe subscription statuses that grant Plus. past_due keeps access while Stripe retries the card. */
export const PLUS_GRANTING_STATUSES = ["active", "trialing", "past_due"] as const;

export const STRIPE_SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type StripeSubscriptionStatus = (typeof STRIPE_SUBSCRIPTION_STATUSES)[number];

export interface PlusSubscription {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** The same rule as public.has_plus(): a granting status and a period that has not ended. */
export function hasPlus(subscription: PlusSubscription | null, now: Date): boolean {
  if (!subscription) return false;
  if (!(PLUS_GRANTING_STATUSES as readonly string[]).includes(subscription.status)) return false;
  return subscription.currentPeriodEnd === null || Date.parse(subscription.currentPeriodEnd) > now.getTime();
}

export function isPlusInterval(value: unknown): value is PlusInterval {
  return value === "month" || value === "year";
}
