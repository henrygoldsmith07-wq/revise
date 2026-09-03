"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { todayIso } from "@/domain/scheduling";
import { getSubject, getTopic } from "@/domain/curriculum";
import type { Recommendation } from "@/domain/types";
import { hrefForRecommendation } from "@/domain/recommender";
import { useStore } from "@/state/store";
import { ButtonLink } from "@/components/ui";
import { LessonsIcon, ICON_SIZE } from "@/components/icons";
import { ResumeRevisionCard } from "@/components/ResumeRevisionCard";
import { buildSessionStructure } from "@/domain/session-structure";

// Next Best Action IS the product. The entire home screen answers one
// question: "what should I do right now?" — and makes starting effortless.
// Everything else is context, never a competing call to action.

export default function TodayPage() {
  const store = useStore();
  const today = todayIso();
  const { recommendations, dueCards, mistakes, streak, settings, recordFunnel } = store;
  const greetingLabel = useGreeting();

  const [primary, ...rest] = recommendations;
  const experimentArm = store.experimentArm;
  const recordExperimentEvent = store.recordExperimentEvent;
  const lessonsStarted = useLessonsStarted();

  useEffect(() => {
    if (!primary) return;
    void recordFunnel("recommendation_displayed", `${primary.activity}:${primary.topicId ?? primary.subjectId}:${today}`);
    if (!experimentArm) return;
    const taskId = `${primary.activity}:${primary.topicId ?? primary.subjectId}:${today}`;
    void recordExperimentEvent("shown", { taskId, activity: primary.activity, topicId: primary.topicId ?? null });
  }, [experimentArm, primary, recordExperimentEvent, recordFunnel, today]);

  if (!primary) return (
    <div className="max-w-2xl mx-auto space-y-5">
      <StartHereCallout started={lessonsStarted} />
      <EmptyToday name={settings.displayName} />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* --- First-run: learn the topic before drilling it -------------- */}
      <StartHereCallout started={lessonsStarted} />

      {/* --- Hero: the one thing to do right now ------------------------- */}
      <NextBestAction recommendation={primary} displayName={settings.displayName} greeting={greetingLabel} />

      {/* --- Queue: what comes after -------------------------------------- */}
      {rest.length > 0 && (
        <div className="space-y-1 px-1">
          {rest.slice(0, 3).map((rec, i) => (
            <Link
              key={`${rec.activity}-${rec.topicId ?? rec.subjectId}`}
              href={hrefForRecommendation(rec)}
              className="flex items-center gap-2 text-xs text-ink3 hover:text-ink transition-colors group"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink3/70">
                {i === 0 ? "After this:" : i === 1 ? "Then:" : ""}
              </span>
              <span className="group-hover:underline">
                {getSubject(rec.subjectId)?.name ?? rec.subjectId}
                {rec.topicId ? ` — ${getTopic(rec.topicId)?.title ?? ""}` : ""}
              </span>
              <span className="tabular-nums">{rec.minutes} min</span>
            </Link>
          ))}
        </div>
      )}

      {/* --- Resume interrupted session ---------------------------------- */}
      <ResumeRevisionCard />

      {/* --- Minimal status strip ----------------------------------------- */}
      <div className="flex gap-4 text-[11px] text-ink3 border-t border-line pt-3 px-1" aria-label="Quick stats">
        <span>
          <strong className="text-ink tabular-nums">{dueCards.length}</strong> due
        </span>
        <span>
          <strong className="text-ink tabular-nums">{mistakes.filter((m) => !m.resolved).length}</strong> mistakes open
        </span>
        <span>
          <strong className="text-ink tabular-nums">{streak.current}</strong>-day streak
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next Best Action hero
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
  if (exp?.daysToExam != null && exp.daysToExam <= 30)
    reasons.push(`exam in ${exp.daysToExam} days`);
  if (exp?.recoverableMarks != null && exp.recoverableMarks > 0)
    reasons.push(`~${Math.round(exp.recoverableMarks)} marks recoverable`);
  if (exp?.marksPerHour != null)
    reasons.push(`${Math.round(exp.marksPerHour)} marks/hour on this topic`);

  const activityLabel: Record<string, string> = {
    learn: "Learn",
    flashcards: "Flashcards",
    recall: "Active recall",
    practice: "Practice",
    paper: "Timed paper",
    mistakes: "Fix a mistake",
  };

  // Build a structured session from mastery level.
  const mastery = exp?.lastEvidencePercent != null ? exp.lastEvidencePercent / 100 : null;
  const session = buildSessionStructure({
    topicId: recommendation.topicId ?? recommendation.subjectId,
    mastery,
    totalMinutes: recommendation.minutes,
  });

return (
    <section aria-label="Your next best task">
      {greeting ? (
        <p className="text-[11px] text-ink3 mb-0.5">{greeting}, {displayName}</p>
      ) : null}

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
            <span className={"inline-block w-1.5 h-1.5 rounded-full " + (
              seg.kind === "warmup" || seg.kind === "easy-retrieval" ? "bg-accent" :
              seg.kind === "mistake-repair" ? "bg-danger" :
              seg.kind === "transfer" ? "bg-success" :
              "bg-ink3/50")} aria-hidden />
            <span>{seg.label}</span>
          </div>
        ))}
      </div>

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
// Empty state
// ---------------------------------------------------------------------------

function EmptyToday({ name }: { name: string }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4 py-12">
      <p className="text-2xl font-semibold tracking-tight text-ink">Ready when you are{name ? `, ${name}` : ""}.</p>
      <p className="text-sm text-ink3">Set an exam date and available study time to get your first recommendation.</p>
      <ButtonLink href="/settings" variant="primary" size="md" className="mt-2">
        Set up exams
      </ButtonLink>
    </div>
  );
}

// ---------------------------------------------------------------------------
// First-run lesson callout
// ---------------------------------------------------------------------------

// Lesson completion lives in the synced store (one snapshot row per user, the
// same conduit as mastery and streaks), so the callout reflects progress made
// on any device, not just this one.
function useLessonsStarted(): boolean {
  const { lessonProgress } = useStore();
  return Object.keys(lessonProgress.completed).length > 0;
}

function StartHereCallout({ started }: { started: boolean }) {
  if (started) return null;
  return (
    <section
      aria-label="Start here"
      className="flex items-center gap-3 px-4 py-3 rounded-[10px] border border-accent/40 bg-accentsoft/30"
    >
      <div className="shrink-0 w-8 h-8 rounded-full bg-accentsoft text-accent flex items-center justify-center">
        <LessonsIcon size={ICON_SIZE.md} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">New here? Start with a lesson.</p>
        <p className="text-xs text-ink3 mt-0.5">
          Learn a topic from zero before the flashcards — lessons take about five minutes.
        </p>
      </div>
      <ButtonLink href="/lesson" variant="primary" size="sm" className="shrink-0">
        Start here
      </ButtonLink>
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
