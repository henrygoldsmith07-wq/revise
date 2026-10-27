"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { forecastUntouched } from "@/domain/pace-forecast";
import { AdaptiveSessionHero } from "@/components/AdaptiveSessionHero";
import { PaceForecastLine } from "@/components/PaceForecast";
import { LazyBoundary } from "@/components/LazyBoundary";
import { ExamOutlook } from "@/components/ExamOutlook";
import { CountdownPhaseBanner } from "@/components/CountdownPhaseBanner";
import { PhaseEntryNotice } from "@/components/PhaseEntryNotice";
import { useStoreFields } from "@/state/store";
import { ButtonLink } from "@/components/ui";
import { ResumeRevisionCard } from "@/components/ResumeRevisionCard";
import { BestNextStep } from "@/components/BestNextStep";
import { CommandCentreCard } from "@/components/CommandCentreCard";
import { useRevisionPlan } from "@/components/recovery-evidence";
import { todayPick } from "@/domain/today-pick";
import { checkpointHasProgress } from "@/domain/revision-checkpoint";
import { WeekLine } from "@/components/RecoverySummary";
import { ExamDateNudge } from "@/components/ExamDateNudge";
import { TodayOverview } from "@/components/TodayOverview";
import { SundayPlan } from "@/components/SundayPlan";
import { todayLocal } from "@/domain/local-date";

// The roadmap derives lessons from the authored curriculum, which is a much
// larger client chunk than Today needs for its bounded review action. Load it
// after the shell hydrates so the home route stays quick while the path still
// appears in the same screen.
const TodayRoadmap = dynamic(() => import("@/components/TodayRoadmap"), {
  ssr: false,
  loading: () => <TodayRoadmapLoading />,
});

// A lazy chunk that was never cached cannot load offline. Contain that here so
// the rest of Today keeps working instead of the whole app showing an error page.
function SafeTodayRoadmap({ preferredSubjectId }: { preferredSubjectId?: string }) {
  return (
    <LazyBoundary fallback={<TodayRoadmapUnavailable />}>
      <TodayRoadmap preferredSubjectId={preferredSubjectId} />
    </LazyBoundary>
  );
}

// Today still leads with one recommended session. The subject tiles and planner
// below make it easier to find a course or see the exam run-up without competing
// with that lead action. If a session was interrupted, resuming it takes
// precedence so the student never loses their place.

export default function TodayPage() {
  const store = useStoreFields("adaptiveSession", "attempts", "examDates", "experimentArm", "mastery", "proofLedger", "ready", "recordExperimentEvent", "recordFunnel", "refreshPhaseNotices", "reviewLogs", "revisionCheckpoint", "settings");
  const {
    settings,
    recordFunnel,
    revisionCheckpoint,
    examDates,
    reviewLogs,
    mastery,
    adaptiveSession,
    proofLedger,
  } = store;
  const greetingLabel = useGreeting();
  // The Next Best Action engine ranks missions, paper recovery, proof checks, reviews and the
  // adaptive session together; Today shows only its winner.
  const { plan, supplyNote, evidence } = useRevisionPlan();
  // "Chosen from your answers" is only true once there are answers to choose from.
  const hasAnswers = store.attempts.length > 0 || reviewLogs.length > 0;
  const context = todayContext(evidence.daysToExam, hasAnswers);
  // A checkpoint is saved as soon as a step's first question shows; Today only
  // offers to resume (and steps its recommendation aside) once there is
  // progress in it to resume.
  const resume = useMemo(
    () => (revisionCheckpoint ? checkpointHasProgress(revisionCheckpoint, { attempts: store.attempts, reviewLogs }) : false),
    [revisionCheckpoint, store.attempts, reviewLogs],
  );

  // Honest pace forecast: what the current pace actually implies before the
  // nearest exam date. Null when nothing is untouched or no date is set — it
  // must never appear with invented numbers.
  const pace = useMemo(
    () =>
      forecastUntouched({
        now: new Date(),
        subjectIds: settings.subjectIds,
        mastery,
        reviewLogs,
        examDates,
      }),
    [settings.subjectIds, mastery, reviewLogs, examDates],
  );

  // Phase transitions announce themselves once: every snapshot change (exam
  // dates, subjects, hydration) re-evaluates, but the settings markers make an
  // already-announced run-up a no-op, so this stays cheap and never repeats.
  const refreshPhaseNotices = store.refreshPhaseNotices;
  useEffect(() => {
    if (!store.ready) return;
    void refreshPhaseNotices();
  }, [store.ready, refreshPhaseNotices]);

  // The adaptive plan is the single decision shown on Today. Keep the existing
  // funnel event name for backwards-compatible reporting, but identify the
  // task as an adaptive plan so acceptance and completion can be compared to
  // the former activity queues.
  const experimentArm = store.experimentArm;
  const recordExperimentEvent = store.recordExperimentEvent;
  useEffect(() => {
    if (!adaptiveSession) return;
    const today = todayLocal();
    void recordFunnel("recommendation_displayed", `adaptive:${adaptiveSession.topicId}:${today}`);
    if (!experimentArm) return;
    const taskId = `adaptive:${adaptiveSession.topicId}:${today}`;
    void recordExperimentEvent("shown", { taskId, activity: "adaptive", topicId: adaptiveSession.topicId });
  }, [adaptiveSession, experimentArm, recordExperimentEvent, recordFunnel]);

  if (!adaptiveSession && !plan.top) return <EmptyToday name={settings.displayName} greeting={greetingLabel} pace={pace} supplyNote={supplyNote} />;

  // Hierarchy: the next session (or resume) dominates the first viewport.
  // Everything else — overview, roadmap, pace, outlook — sits one tap away
  // inside a collapsed section so secondary data never competes with starting.
  return (
    <div className="mx-auto w-full space-y-5">
      <TodayWelcome name={settings.displayName} greeting={greetingLabel} context={context} />
      <PhaseEntryNotice />
      <CountdownPhaseBanner />
      {resume ? (
        <ResumeRevisionCard />
      ) : (
        <div className="today-focus card p-5 sm:p-7">
          {todayPick(plan.top, adaptiveSession)?.source === "plan" && plan.top ? (
            <BestNextStep action={plan.top} plan={plan} />
          ) : (
            <AdaptiveSessionHero session={adaptiveSession!} displayName={settings.displayName} greeting="" proof={proofLedger} />
          )}
        </div>
      )}
      {resume ? null : (
        <p className="text-sm text-ink3">
          Prefer to pick for yourself?{" "}
          <Link href="/study" className="inline-flex min-h-11 items-center font-medium text-ink2 underline underline-offset-4 hover:text-ink">Choose how to study</Link>
        </p>
      )}
      {resume ? null : <WeekLine />}
      {resume ? null : <ExamDateNudge />}
      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer select-none text-sm font-medium text-ink2">
          Plan, pace and outlook
        </summary>
        <div className="mt-4 space-y-5">
          <SundayPlan />
          <CommandCentreCard />
          <TodayOverview />
          <SafeTodayRoadmap preferredSubjectId={adaptiveSession?.subjectId ?? plan.top?.subjectId} />
          {pace ? <PaceForecastLine forecast={pace} /> : null}
          <ExamOutlook />
          <Link href="/readiness" className="inline-flex min-h-11 items-center text-sm font-medium text-ink2 underline underline-offset-4 hover:text-ink">
            See how every exam is tracking
          </Link>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — nothing due, no next task (fresh profile pre-plan).
// ---------------------------------------------------------------------------

/** One line of context under the greeting: the nearest exam when there is one, never a made-up number. */
function todayContext(daysToExam: number | null, hasAnswers: boolean): string {
  if (daysToExam === null) {
    return hasAnswers
      ? "One session, chosen from your answers so far. Start it, and Revise adjusts as you go."
      : "One session to start with. Answer it, and Revise adjusts what comes next to how you did.";
  }
  if (daysToExam === 0) return "Exam day. Keep it short and calm: one focused session.";
  return `Your next exam is in ${daysToExam} day${daysToExam === 1 ? "" : "s"}. This is the best use of your time right now.`;
}

function TodayWelcome({ name, greeting, hasSession = true, context }: { name: string; greeting: string; hasSession?: boolean; context?: string }) {
  const salutation = greeting ? "Good " + greeting.toLowerCase() : "Welcome back";
  return (
    <header className="today-welcome">
      {/* Narrow phones get a compact header (no eyebrow: the bottom nav already
          says Today) so the session's Start button stays in the first viewport. */}
      <span className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-ink3 sm:inline">Today</span>
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:mt-1 sm:text-3xl">
        {salutation}{name ? ", " + name : ""}
      </h1>
      <p className="mt-1 max-w-xl text-sm leading-6 text-ink2 sm:mt-2 sm:text-base">
        {hasSession ? context ?? "Your next session is ready. Start, get feedback and keep going." : "Choose a lesson that interests you, or make a plan for your exams."}
      </p>
    </header>
  );
}

function EmptyToday({ name, greeting, pace, supplyNote }: { name: string; greeting: string; pace: ReturnType<typeof forecastUntouched>; supplyNote?: string | null }) {
  return (
    <div className="mx-auto w-full space-y-5">
      <TodayWelcome name={name} greeting={greeting} hasSession={false} />
      <PhaseEntryNotice />
      <CountdownPhaseBanner />
      <div className="today-focus card p-5 sm:p-7">
        <p className="today-focus-eyebrow text-sm font-semibold text-speak">
          Do this now <span className="font-medium text-ink3 tabular-nums">· 5–10 min</span>
        </p>
        <h2 className="mt-2 text-xl font-semibold text-ink">Find where to start</h2>
        <p className="mt-2 text-sm leading-6 text-ink2">A 5–10 minute quick check across several topics — no hints, so answers count as evidence. Revise then chooses your personalised next step.</p>
        <p className="mt-1 text-sm leading-6 text-ink2">After that, this space shows one session chosen for you, with the reason why.</p>
        {/* Nothing here is ranked yet. Say which of the two reasons applies, rather
            than letting "nothing to do" look like an unfinished setup. */}
        {supplyNote ? (
          <p className="mt-3 border-l-2 border-ink3 pl-3 text-sm leading-6 text-ink2">{supplyNote}</p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <ButtonLink href="/diagnostic" variant="primary" size="md" className="w-full sm:w-auto min-h-[3rem] text-base">Start quick check</ButtonLink>
          <ButtonLink href="/lesson" variant="secondary" size="md" className="w-full sm:w-auto min-h-[3rem]">Browse lessons</ButtonLink>
          <Link href="/practice" className="text-sm text-ink2 underline underline-offset-4 hover:text-ink py-3 px-1 min-h-[3rem] inline-flex items-center">
            Practise a question
          </Link>
          <Link href="/settings" className="text-sm text-ink2 underline underline-offset-4 hover:text-ink py-3 px-1 min-h-[3rem] inline-flex items-center">
            Set up exams
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink3">Not a grade. Unreviewed questions are practice only — Revise says so rather than guessing.</p>
      </div>
      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer select-none text-sm font-medium text-ink2">Sunday plan</summary>
        <div className="mt-4"><SundayPlan /></div>
      </details>
      <TodayOverview />
      <SafeTodayRoadmap />
      {pace ? <PaceForecastLine forecast={pace} /> : null}
      <ExamOutlook />
    </div>
  );
}

function TodayRoadmapUnavailable() {
  return (
    <section aria-label="Today's learning roadmap" className="card p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink3 font-bold">Learning roadmap</p>
      <p className="mt-1 text-sm text-ink3" role="status">
        The roadmap could not load. It is available again once you are back online; revision still works.
      </p>
    </section>
  );
}

function TodayRoadmapLoading() {
  return (
    <section aria-label="Today's learning roadmap" className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink3 font-bold">Learning roadmap</p>
          <p className="mt-1 text-sm text-ink3">Loading your next checkpoints…</p>
        </div>
        <span className="h-2 w-20 rounded-full bg-surface2 animate-pulse" aria-hidden="true" />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Greeting hook (client-only wall clock, SSR-safe)
// ---------------------------------------------------------------------------

function greetingAt(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

function nextGreetingBoundary(now: Date): Date {
  const next = new Date(now);
  if (now.getHours() < 12) next.setHours(12, 0, 0, 0);
  else if (now.getHours() < 18) next.setHours(18, 0, 0, 0);
  else {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  }
  return next;
}

function useGreeting(): string {
  // Keep the server/client first render identical, then schedule only the next
  // semantic greeting boundary. Focus/visibility refresh handles suspended tabs.
  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      const now = new Date();
      setGreeting(greetingAt(now));
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, Math.max(1_000, nextGreetingBoundary(now).getTime() - now.getTime() + 250));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return greeting;
}
