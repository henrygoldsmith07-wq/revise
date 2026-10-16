"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSundayPlan } from "@/data/repository";
import { sundayActivityMessage, sundayWeekStart, type SundayPlanSnapshot } from "@/domain/sunday-plan";
import { useStoreFields } from "@/state/store";

/** Secondary, opt-in message; never competes with Today's recommended session. */
export function SundayPlan() {
  const { ready, userId, settings, updateSettings } = useStoreFields("ready", "userId", "settings", "updateSettings");
  const [now, setNow] = useState<Date | null>(null);
  const [plan, setPlan] = useState<{ userId: string; snapshot: SundayPlanSnapshot } | null>(null);
  const [preview, setPreview] = useState<{ userId: string; snapshot: SundayPlanSnapshot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const week = now ? sundayWeekStart(now, timeZone) : "";
  const enabled = settings.sundayPlanEnabled === true;

  useEffect(() => {
    let active = true;
    let timer = 0;
    const refresh = () => {
      if (!active) return;
      const current = new Date();
      setNow(current);
      const midnight = new Date(current);
      midnight.setDate(midnight.getDate() + 1);
      midnight.setHours(0, 0, 0, 250);
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, Math.max(1_000, midnight.getTime() - current.getTime()));
    };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    queueMicrotask(refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => {
    if (!ready || !enabled || !week) return;
    let active = true;
    void loadSundayPlan(userId, new Date(), timeZone).then((snapshot) => {
      if (active) { setPlan(snapshot ? { userId, snapshot } : null); setError(""); }
    }).catch(() => {
      if (active) setError("Your Sunday plan could not be saved locally. Reopen Today to try again; nothing was sent as a notification.");
    });
    return () => { active = false; };
  }, [ready, enabled, userId, week, timeZone]);

  async function changeConsent() {
    setBusy(true);
    setError("");
    try {
      await updateSettings({ sundayPlanEnabled: !enabled });
      setPreview(null);
    } catch {
      setError("Your choice could not be saved. The weekly setting has not changed.");
    } finally { setBusy(false); }
  }

  async function previewPlan() {
    setBusy(true);
    setError("");
    try {
      const snapshot = await loadSundayPlan(userId, new Date(), timeZone, true);
      setPreview(snapshot ? { userId, snapshot } : null);
    }
    catch { setError("The preview could not read your local study data. Please try again."); }
    finally { setBusy(false); }
  }

  // Never show a previous account's captured exam/activity while the next
  // account's asynchronous local read is pending.
  const captured = enabled ? plan : preview;
  const message = captured?.userId === userId ? captured.snapshot : null;
  return (
    <section aria-labelledby="sunday-plan-title" className="card p-4">
      <h2 id="sunday-plan-title" className="text-base font-semibold text-ink">Sunday plan: what moved, what’s next</h2>
      <p className="mt-1 text-sm leading-6 text-ink2">
        An optional weekly message here in the app — not email or push. Off until you choose it. On your first visit each Sunday week, it captures the previous week’s recorded practice, due reviews and your saved exam dates.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary min-h-11 px-3 text-sm" disabled={busy || !ready} aria-pressed={enabled} onClick={() => void changeConsent()}>
          {enabled ? "Turn off weekly plan" : "Turn on weekly plan"}
        </button>
        {!enabled ? <button type="button" className="min-h-11 text-sm text-ink2 underline underline-offset-4" disabled={busy || !ready} onClick={() => void previewPlan()}>Preview without turning on</button> : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-ink2">{error}</p> : null}
      {enabled && !message && !error ? <p role="status" className="mt-2 text-sm text-ink3">Reading your saved local activity…</p> : null}
      {message ? <SundayPlanMessage plan={message} preview={!enabled} /> : null}
      <p className="mt-3 text-xs leading-5 text-ink3">Uses data saved on this device, including any account history already synced here. Account sync may replicate this settings snapshot; no notification service is used. Turning off stops future weekly plans. Preview does not enable or save a weekly plan.</p>
    </section>
  );
}

export function SundayPlanMessage({ plan, preview = false }: { plan: SundayPlanSnapshot; preview?: boolean }) {
  return (
    <div className="mt-4 space-y-3 text-sm leading-6 text-ink2">
      <p className="text-xs text-ink3">{preview ? "On-demand preview" : "Saved weekly message"} · week of {plan.weekStart}</p>
      <p><span className="font-medium text-ink">What moved:</span> {sundayActivityMessage(plan)}</p>
      <p className="text-xs text-ink3">Recorded activity, not proof of better marks or exam readiness. Last week means {plan.lastWeek.from}–{plan.lastWeek.through}.</p>
      {plan.freshness === "no-data" ? <p>No answer or card-review history is available locally yet. This is a starting plan, not a progress claim.</p> : null}
      {plan.freshness === "old" ? <p>Your last recorded answer or card review is older than last week. This plan may miss study done elsewhere or not yet synced.</p> : null}
      <p><span className="font-medium text-ink">What’s next:</span> {plan.dueReviews} previously studied card{plan.dueReviews === 1 ? " is" : "s are"} due at capture. {plan.nearestExam ? `Next saved exam: ${plan.nearestExam.label || "Exam"}, ${plan.nearestExam.date} (${plan.nearestExam.days === 0 ? "exam day" : `${plan.nearestExam.days} days away`}).` : "No upcoming exam date is saved. No countdown has been guessed."}</p>
      <ul className="space-y-2">
        {plan.actions.map((action) => <li key={action.href}><Link href={action.href} className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">{action.label}</Link><p className="text-xs text-ink3">{action.reason}</p></li>)}
      </ul>
      <p className="text-xs text-ink3">Captured {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: plan.timeZone }).format(new Date(plan.capturedAt))} ({plan.timeZone}). {preview ? "This preview is not saved." : `Frozen until ${plan.nextSunday}; new activity, exam edits and later sync do not rewrite it. Open the linked pages for live data. The next message appears on your first visit from that Sunday.`}</p>
    </div>
  );
}
