"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import type { Recommendation } from "@/domain/types";
import { hrefForRecommendation } from "@/domain/recommender";
import { buildSessionStructure, sizeDueSession, type DueSessionSize } from "@/domain/session-structure";
import { forecastUntouched } from "@/domain/pace-forecast";
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

// Today answers one question first: "what should I do right now?" The bounded
// action stays dominant, with a compact roadmap underneath so the student can
// see where today's work fits without opening a second screen.
//
// The answer is a bounded session: the due cards that fit in 15–25 minutes,
// nothing more. No spec-point totals, no "2,216 things you owe" dashboard, no
// after-this queue trailing into tomorrow's plan. If a session was interrupted
// mid-way, resuming it replaces today's fresh session. Only when nothing is
// due does Today fall back to the recommender's next best task; the roadmap is
// context and a next learning checkpoint, not another analytics dashboard.

export default function TodayPage() {
  const store = useStore();
  const {
    recommendations,
    dueCards,
    settings,
    recordFunnel,
    revisionCheckpoint,
    examDates,
    reviewLogs,
    mastery,
  } = store;
  const greetingLabel = useGreeting();

  const primary = recommendations[0];
  const dueCount = dueCards.length;

  // Same seconds-per-card as the /review queue builder, so what Today
  // promises is exactly what the review route runs.
  const session = useMemo(
    () => sizeDueSession(dueCount, { targetMinutes: settings.sessionLengthMinutes || 20 }),
    [dueCount, settings.sessionLengthMinutes],
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

  // Recommendation telemetry fires only when a recommendation is actually on
  // screen — the due-review session is not a recommendation.
  const experimentArm = store.experimentArm;
  const recordExperimentEvent = store.recordExperimentEvent;
  useEffect(() => {
    if (dueCount > 0 || !primary) return;
    const today = new Date().toISOString().slice(0, 10);
    void recordFunnel("recommendation_displayed", `${primary.activity}:${primary.topicId ?? primary.subjectId}:${today}`);
    if (!experimentArm) return;
    const taskId = `${primary.activity}:${primary.topicId ?? primary.subjectId}:${today}`;
    void recordExperimentEvent("shown", { taskId, activity: primary.activity, topicId: primary.topicId ?? null });
  }, [dueCount, experimentArm, primary, recordExperimentEvent, recordFunnel]);

  if (dueCount > 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <PhaseEntryNotice />
        <CountdownPhaseBanner />
        {revisionCheckpoint ? (
          <>
            <ResumeRevisionCard />
            <TodayRoadmap preferredSubjectId={primary?.subjectId} />
          </>
        ) : (
          <>
            <TodayReviewSession session={session} displayName={settings.displayName} greeting={greetingLabel} />
            <TodayRoadmap preferredSubjectId={primary?.subjectId} />
            {pace ? <PaceForecastLine forecast={pace} /> : null}
            <ExamOutlook />
          </>
        )}
      </div>
    );
  }

  if (!primary) {
    return <EmptyToday name={settings.displayName} />;
  }

  // Nothing due today: one next task instead of an empty screen. The roadmap
  // below is a continuation path, not a competing queue or dashboard.
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PhaseEntryNotice />
      <CountdownPhaseBanner />
      {revisionCheckpoint ? (
        <>
          <ResumeRevisionCard />
          <TodayRoadmap preferredSubjectId={primary.subjectId} />
        </>
      ) : (
        <>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold" role="status">
            Nothing due right now
          </p>
          <NextBestAction recommendation={primary} displayName={settings.displayName} greeting={greetingLabel} />
          <TodayRoadmap preferredSubjectId={primary.subjectId} />
          {pace ? <PaceForecastLine forecast={pace} /> : null}
          <ExamOutlook />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's review session — the one thing to do, then stop.
// ---------------------------------------------------------------------------

function TodayReviewSession({
  session,
  displayName,
  greeting,
}: {
  session: DueSessionSize;
  displayName: string;
  greeting: string;
}) {
  const minutes = session.minutes >= 1 ? `${session.minutes} min` : "under a minute";
  return (
    <section aria-label="Today's review" className="pt-2">
      {greeting ? <p className="text-[11px] text-ink3 mb-0.5">{greeting}, {displayName}</p> : null}

      <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink mt-1">Today&apos;s review</p>

      <p className="text-lg text-ink mt-2 font-medium">
        {session.cards} due {session.cards === 1 ? "card" : "cards"} · about {minutes}
      </p>

      <p className="text-sm text-ink3 mt-0.5">
        That&apos;s today&apos;s session. Start it, finish it, stop — the queue will still be here tomorrow.
      </p>

      {session.capped ? (
        <p className="text-xs text-ink3 mt-2" role="status">
          {session.totalDue - session.cards} more cards are due but wait for another day — this session is all you
          need today.
        </p>
      ) : null}

      <ButtonLink href="/review" variant="primary" size="md" className="mt-4 w-full sm:w-auto min-h-[3rem] text-base">
        Start review →
      </ButtonLink>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Next Best Action hero — fallback when nothing is due.
// ---------------------------------------------------------------------------

function NextBestAction({
  recommendation,
  displayName,
  greeting,
}: {
  recommendation: Recommendation;
  displayName: string;
  greeting: string;
}) {
  const subject = getSubject(recommendation.subjectId);
  const topic = recommendation.topicId ? getTopic(recommendation.topicId) : null;
  const exp = recommendation.explanation;

  const href = hrefForRecommendation(recommendation);

  // Why-this bullets derived from structured explanation factors.
  const reasons: string[] = [];
  if (exp?.lastEvidencePercent != null && exp.lastEvidencePercent < 50)
    reasons.push(`scored ${exp.lastEvidencePercent}% last time`);
  if (exp?.daysSinceRetrieval != null && exp.daysSinceRetrieval >= 7)
    reasons.push(`last studied ${exp.daysSinceRetrieval} days ago`);
  else if (!exp?.daysSinceRetrieval) reasons.push("not yet covered");
  if (exp?.daysToExam != null && exp.daysToExam <= 30) reasons.push(`exam in ${exp.daysToExam} days`);
  if (exp?.recoverableMarks != null && exp.recoverableMarks > 0)
    reasons.push(`~${Math.round(exp.recoverableMarks)} marks recoverable`);
  if (exp?.marksPerHour != null) reasons.push(`${Math.round(exp.marksPerHour)} marks/hour on this topic`);

  const activityLabel: Record<string, string> = {
    learn: "Learn",
    flashcards: "Flashcards",
    recall: "Active recall",
    practice: recommendation.techniqueQuickMinutes ? "Timed run" : "Practice",
    paper: "Timed paper",
    mistakes: "Fix a mistake",
  };

  // Technique steering says which kind of work pays for this subject — say
  // so in plain language, with the evidence split when one exists.
  const techniqueLine =
    recommendation.techniqueQuickMinutes && recommendation.techniqueKnowledgeShare != null
      ? `Answering is the leak — ~${Math.round((1 - recommendation.techniqueKnowledgeShare) * 100)}% of lost marks are technique, not knowledge. That's why today is against the clock.`
      : recommendation.techniqueKnowledgeShare != null && recommendation.techniqueKnowledgeShare >= 0.62
        ? `Knowledge is the leak — ~${Math.round(recommendation.techniqueKnowledgeShare * 100)}% of lost marks are content not yet known. That's why today starts with learning.`
        : null;

  // Build a structured session from mastery level.
  const mastery = exp?.lastEvidencePercent != null ? exp.lastEvidencePercent / 100 : null;
  const session = buildSessionStructure({
    topicId: recommendation.topicId ?? recommendation.subjectId,
    mastery,
    totalMinutes: recommendation.minutes,
  });

  return (
    <section aria-label="Next best task">
      {greeting ? <p className="text-[11px] text-ink3 mb-0.5">{greeting}, {displayName}</p> : null}

      <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink mt-1">
        Your next{" "}
        <span className="tabular-nums text-accent">{recommendation.minutes} minutes</span>
      </p>

      <p className="text-lg text-ink mt-2 font-medium">
        {subject?.name ?? recommendation.subjectId}
        {topic ? ` — ${topic.title}` : ""}
      </p>

      <p className="text-sm text-ink3 mt-0.5">
        {activityLabel[recommendation.activity] ?? recommendation.activity} · {reasons.slice(0, 3).join(" · ")}
      </p>

      <div className="mt-3 space-y-1">
        {session.segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-ink2">
            <span className="tabular-nums text-ink3 w-8 text-right">{seg.minutes}m</span>
            <span
              className={
                "inline-block w-1.5 h-1.5 rounded-full " +
                (seg.kind === "warmup" || seg.kind === "easy-retrieval"
                  ? "bg-accent"
                  : seg.kind === "mistake-repair"
                    ? "bg-danger"
                    : seg.kind === "transfer"
                      ? "bg-success"
                      : "bg-ink3/50")
              }
              aria-hidden
            />
            <span>{seg.label}</span>
          </div>
        ))}
      </div>

      {techniqueLine ? (
        <p className="text-xs text-ink2 mt-2" role="note">
          {techniqueLine}
        </p>
      ) : null}

      <ButtonLink href={href} variant="primary" size="md" className="mt-4 w-full sm:w-auto min-h-[3rem] text-base">
        Start →
      </ButtonLink>

      {recommendation.reason ? (
        <details className="mt-2">
          <summary className="text-xs text-ink3 cursor-pointer select-none">Why this?</summary>
          <ul className="text-xs text-ink3 mt-1 space-y-0.5 list-disc list-inside pl-2">
            {reasons.map((r, i) => (
              <li key={i}>{r.charAt(0).toUpperCase() + r.slice(1)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
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
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/lesson" variant="primary" size="md" className="mt-2">
          Browse lessons
        </ButtonLink>
        <Link href="/settings" className="text-sm text-ink3 hover:text-ink underline mt-3.5">
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
