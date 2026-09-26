"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { forecastUntouched } from "@/domain/pace-forecast";
import { AdaptiveSessionHero } from "@/components/AdaptiveSessionHero";
import { PaceForecastLine } from "@/components/PaceForecast";
import { ExamOutlook } from "@/components/ExamOutlook";
import { CountdownPhaseBanner } from "@/components/CountdownPhaseBanner";
import { PhaseEntryNotice } from "@/components/PhaseEntryNotice";
import { useStore } from "@/state/store";
import { ButtonLink } from "@/components/ui";
import { ResumeRevisionCard } from "@/components/ResumeRevisionCard";
import { TodayOverview } from "@/components/TodayOverview";

// The roadmap derives lessons from the authored curriculum, which is a much
// larger client chunk than Today needs for its bounded review action. Load it
// after the shell hydrates so the home route stays quick while the path still
// appears in the same screen.
const TodayRoadmap = dynamic(() => import("@/components/TodayRoadmap"), {
  ssr: false,
  loading: () => <TodayRoadmapLoading />,
});

// Today still leads with one recommended session. The subject tiles and planner
// below make it easier to find a course or see the exam run-up without competing
// with that lead action. If a session was interrupted, resuming it takes
// precedence so the student never loses their place.

export default function TodayPage() {
  const store = useStore();
  const {
    settings,
    recordFunnel,
    revisionCheckpoint,
    examDates,
    reviewLogs,
    mastery,
    adaptiveSession,
  } = store;
  const greetingLabel = useGreeting();

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
    const today = new Date().toISOString().slice(0, 10);
    void recordFunnel("recommendation_displayed", `adaptive:${adaptiveSession.topicId}:${today}`);
    if (!experimentArm) return;
    const taskId = `adaptive:${adaptiveSession.topicId}:${today}`;
    void recordExperimentEvent("shown", { taskId, activity: "adaptive", topicId: adaptiveSession.topicId });
  }, [adaptiveSession, experimentArm, recordExperimentEvent, recordFunnel]);

  if (!adaptiveSession) return <EmptyToday name={settings.displayName} greeting={greetingLabel} pace={pace} />;

  // Hierarchy: the next session (or resume) dominates the first viewport.
  // Everything else — overview, roadmap, pace, outlook — sits one tap away
  // inside a collapsed section so secondary data never competes with starting.
  return (
    <div className="mx-auto w-full space-y-5">
      <TodayWelcome name={settings.displayName} greeting={greetingLabel} />
      <PhaseEntryNotice />
      <CountdownPhaseBanner />
      {revisionCheckpoint ? (
        <ResumeRevisionCard />
      ) : (
        <div className="today-focus card p-5 sm:p-7">
          <AdaptiveSessionHero session={adaptiveSession} displayName={settings.displayName} greeting="" />
        </div>
      )}
      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer select-none text-sm font-medium text-ink2">
          Plan, pace and outlook
        </summary>
        <div className="mt-4 space-y-5">
          <TodayOverview />
          <TodayRoadmap preferredSubjectId={adaptiveSession.subjectId} />
          {pace ? <PaceForecastLine forecast={pace} /> : null}
          <ExamOutlook />
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — nothing due, no next task (fresh profile pre-plan).
// ---------------------------------------------------------------------------

function TodayWelcome({ name, greeting, hasSession = true }: { name: string; greeting: string; hasSession?: boolean }) {
  const salutation = greeting ? "Good " + greeting.toLowerCase() : "Welcome back";
  return (
    <header className="today-welcome">
      <span className="relative z-10 text-xs font-bold uppercase tracking-[0.13em] text-ink2">Today</span>
      <h1 className="relative z-10 mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {salutation}{name ? ", " + name : ""}
      </h1>
      <p className="relative z-10 mt-2 max-w-xl text-sm leading-6 text-ink2 sm:text-base">
        {hasSession ? "Start with a short session, or choose a subject you feel like exploring." : "Choose a lesson that interests you, or make a plan for your exams."}
      </p>
    </header>
  );
}

function EmptyToday({ name, greeting, pace }: { name: string; greeting: string; pace: ReturnType<typeof forecastUntouched> }) {
  return (
    <div className="mx-auto w-full space-y-5">
      <TodayWelcome name={name} greeting={greeting} hasSession={false} />
      <PhaseEntryNotice />
      <CountdownPhaseBanner />
      <div className="today-focus card p-5 sm:p-7">
        <h2 className="text-xl font-semibold text-ink">A lesson is a good place to begin</h2>
        <p className="mt-2 text-sm leading-6 text-ink2">Browse a topic that interests you, or add exam dates to make a plan.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <ButtonLink href="/lesson" variant="primary" size="md" className="w-full sm:w-auto min-h-[3rem] text-base">Browse lessons</ButtonLink>
          <Link href="/settings" className="text-sm text-ink2 underline underline-offset-4 hover:text-ink py-3 px-1 min-h-[3rem] inline-flex items-center">
            Set up exams
          </Link>
        </div>
      </div>
      <TodayOverview />
      <TodayRoadmap />
      {pace ? <PaceForecastLine forecast={pace} /> : null}
      <ExamOutlook />
    </div>
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

const NO_SUBSCRIBE = () => () => {};
let cachedHour: number | null = null;
function clientHour(): number {
  if (cachedHour == null) cachedHour = new Date().getHours();
  return cachedHour;
}
function serverHour(): number {
  return -1;
}

function useGreeting(): string {
  const hour = useSyncExternalStore(NO_SUBSCRIBE, clientHour, serverHour);
  if (hour < 0) return "";
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}
