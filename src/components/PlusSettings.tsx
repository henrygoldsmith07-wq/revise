"use client";

import { useEffect, useState } from "react";
import { formatPence, PLUS_PLAN, type PlusInterval } from "@/domain/plus";
import { Button, Panel, Pill, SectionHeading } from "./ui";

// Settings → Plus. Reads /api/billing/status, which answers for the signed-in
// account only, and hands the browser to Stripe for checkout or the billing
// portal. Nothing about payment is stored on this device.

interface BillingStatus {
  enabled: boolean;
  signedIn: boolean | null;
  plus: boolean;
  subscription: { status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
}

const MONTH = formatPence(PLUS_PLAN.prices.month);
const YEAR = formatPence(PLUS_PLAN.prices.year);

function periodEnd(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
}

export function PlusSettings() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/billing/status", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<BillingStatus>) : null))
      .then((body) => {
        if (!live) return;
        setStatus(body);
        // Back from Stripe: the webhook may not have landed yet.
        if (new URLSearchParams(window.location.search).get("plus") === "success" && body && !body.plus) {
          setMessage("Thanks for subscribing. Plus can take a moment to switch on while the payment is confirmed; reload in a minute.");
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function go(path: "/api/billing/checkout" | "/api/billing/portal", body?: { interval: PlusInterval }) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      setMessage(json.error ?? "That did not work. Try again shortly.");
    } catch {
      setMessage("You appear to be offline. Try again when you are connected.");
    }
    setBusy(false);
  }

  // A server that does not sell Plus shows nothing: every feature is already on.
  if (!status?.enabled) return null;

  const sub = status.subscription;
  const ends = periodEnd(sub?.currentPeriodEnd ?? null);

  return (
    <section id="plus">
      <SectionHeading title="Plus" hint={`Cloud AI for ${MONTH} a month or ${YEAR} a year. Everything else is free.`} />
      <Panel className="space-y-3">
        {status.plus ? (
          <>
            <Pill tone="success">Plus is on</Pill>
            <p className="text-sm text-ink2">
              {sub?.cancelAtPeriodEnd && ends
                ? `Cancelled: Plus stays on until ${ends}, then AI features use their offline versions.`
                : ends
                  ? `Renews on ${ends}.`
                  : "Your subscription is active."}
              {sub?.status === "past_due" ? " Your last payment did not go through; update your card to keep Plus." : ""}
            </p>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void go("/api/billing/portal")}>
              Manage subscription
            </Button>
          </>
        ) : (
          <>
            <ul className="text-sm text-ink2 list-disc pl-5 space-y-1">
              {PLUS_PLAN.unlocks.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {status.signedIn ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" disabled={busy} onClick={() => void go("/api/billing/checkout", { interval: "month" })}>
                  {MONTH} a month
                </Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void go("/api/billing/checkout", { interval: "year" })}>
                  {YEAR} a year
                </Button>
                {sub ? (
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void go("/api/billing/portal")}>
                    Billing history
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ink2">Sign in under Account below to subscribe, so Plus follows you to every device.</p>
            )}
            <p className="text-[11px] text-ink3">
              Payments are handled by Stripe. Cancel any time; cancelling deletes nothing. Under 18? Ask a parent or carer to
              subscribe. AI marking is a model&apos;s judgement, not a human review.
            </p>
          </>
        )}
        {message ? <p className="text-[11px] text-ink2" role="status">{message}</p> : null}
      </Panel>
    </section>
  );
}
