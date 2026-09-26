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

// The roadmap derives lessons from the authored curriculum, which is a much
// larger client chunk than Today needs for its bounded review action. Load it
// after the shell hydrates so the home route stays quick while the path still
// appears in the same screen.
const TodayRoadmap = dynamic(() => import("@/components/TodayRoadmap"), {
  ssr: false,
  loading: () => <TodayRoadmapLoading />,
});

// Today answers one question first: "what is the best use of the next 20
// minutes?" The adaptive optimiser has already made the trade-off between
// FSRS pressure, mastery, mistakes, exam timing, and capability evidence. The
// home screen only presents that one decision; the compact roadmap remains
// secondary context below it. If a session was interrupted, resuming it still
// takes precedence so the student never loses their place.

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

  if (!adaptiveSession) return <EmptyToday name={settings.displayName} />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {revisionCheckpoint ? (
        <>
          <PhaseEntryNotice />
          <CountdownPhaseBanner />
          <ResumeRevisionCard />
          <TodayRoadmap preferredSubjectId={adaptiveSession.subjectId} />
          {pace ? <PaceForecastLine forecast={pace} /> : null}
          <ExamOutlook />
        </>
      ) : (
        <>
          <PhaseEntryNotice />
          <CountdownPhaseBanner />
          <AdaptiveSessionHero session={adaptiveSession} displayName={settings.displayName} greeting={greetingLabel} />
          <TodayRoadmap preferredSubjectId={adaptiveSession.subjectId} />
          {pace ? <PaceForecastLine forecast={pace} /> : null}
          <ExamOutlook />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — nothing due, no next task (fresh profile pre-plan).
// ---------------------------------------------------------------------------

function EmptyToday({ name }: { name: string }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4 py-12">
      <PhaseEntryNotice />
      <CountdownPhaseBanner />
      <p className="text-2xl font-semibold tracking-tight text-ink">Ready when you are{name ? `, ${name}` : ""}.</p>
      <p className="text-sm text-ink3">
        Nothing is due and there is no next task yet — start with a lesson, or set an exam date and study time to get a
        plan.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <ButtonLink href="/lesson" variant="primary" size="md" className="mt-2 w-full sm:w-auto min-h-[3rem] text-base">
          Browse lessons
        </ButtonLink>
        <Link href="/settings" className="text-sm text-ink3 hover:text-ink underline py-3 px-1 min-h-[3rem] inline-flex items-center">
          Set up exams
        </Link>
      </div>
      <TodayRoadmap />
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
