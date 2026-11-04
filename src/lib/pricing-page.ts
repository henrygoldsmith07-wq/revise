// The public /pricing page, built from PLUS_PLAN so the page, the Settings
// card and the markdown twin quote one price list. It may claim only what the
// trust position allows: Plus buys model marking, not a reviewed bank or a
// better grade.
//
// Until this deployment sells Plus (STRIPE_SECRET_KEY unset) the page says so
// rather than sending people to a Settings card that is not there, so the
// page and its links can ship before billing is switched on.

import { formatPence, PLUS_PLAN } from "@/domain/plus";
import { plusOnSale } from "@/lib/billing/on-sale";
import type { StaticPage } from "@/lib/static-page";

export const PRICING_PATH = "/pricing";

const built = new Map<boolean, StaticPage>();

export function pricingPage(onSale: boolean = plusOnSale()): StaticPage {
  const cached = built.get(onSale);
  if (cached) return cached;
  const month = formatPence(PLUS_PLAN.prices.month);
  const year = formatPence(PLUS_PLAN.prices.year);
  const yearPerMonth = formatPence(Math.round(PLUS_PLAN.prices.year / 12));
  const page: StaticPage = {
    path: PRICING_PATH,
    title: `Revise pricing: free, or Plus for ${month} a month`,
    heading: "Pricing",
    description: `Revise is free: spaced repetition, exam practice with the offline marker, lessons and sync. Plus adds cloud AI marking and feedback for ${month} a month or ${year} a year.`,
    lead: onSale
      ? `Revise is free. Plus adds cloud AI for ${month} a month or ${year} a year.`
      : `Revise is free. Plus, which will add cloud AI for ${month} a month or ${year} a year, is not on sale yet.`,
    blocks: [
      {
        heading: "Free and Plus",
        table: {
          head: ["", "Free", "Plus"],
          rows: [
            ...PLUS_PLAN.free.map((feature) => [feature, "Yes", "Yes"]),
            ...PLUS_PLAN.unlocks.map((feature) => [feature, "No", "Yes"]),
            ["Price", "£0", `${month} a month, or ${year} a year`],
          ],
        },
      },
      {
        heading: "Plus",
        items: [
          `**${month} a month**, or **${year} a year** (${yearPerMonth} a month).`,
          "Cancel any time from Settings → Plus. You keep Plus until the end of the period you paid for.",
          "Cancelling deletes nothing: your revision stays on your device, and sync stays free.",
          "Payments are handled by Stripe. Revise never sees your card details.",
          "Without Plus, every AI feature falls back to its offline version, so nothing stops working.",
        ],
      },
      {
        heading: "What Plus does not change",
        honest: true,
        paragraphs: [
          "AI marking is a model's judgement against the mark scheme. It is not a human review, and no question in Revise has been human-reviewed yet, so Plus cannot prove that you have improved any more than the free version can.",
        ],
      },
      {
        heading: "Under 18?",
        paragraphs: ["Ask a parent or carer to subscribe with their own card. Everything free works without paying anything."],
      },
      onSale
        ? {
            heading: "Subscribing",
            paragraphs: ["[Open Revise](/settings) and go to Settings → Plus. You need an account, so the subscription follows you across devices; signing in only needs an email address."],
          }
        : {
            heading: "Subscribing",
            paragraphs: ["Plus is not on sale yet, so every feature in the table is free for now. [Open Revise](/) to start."],
          },
    ],
    related: [
      { label: "WJEC A-level Physics guides", path: "/wjec-a-level-physics" },
      { label: "What Revise can and cannot do yet", path: "/welcome" },
    ],
  };
  built.set(onSale, page);
  return page;
}
