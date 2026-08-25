"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { todayIso } from "@/domain/scheduling";
import { getSubject, getTopic } from "@/domain/curriculum";
import type { Recommendation } from "@/domain/types";
import { useStore } from "@/state/store";
import { ButtonLink } from "@/components/ui";
import { ResumeRevisionCard } from "@/components/ResumeRevisionCard";
import { buildSessionStructure } from "@/domain/session-structure";

// Next Best Action IS the product. The entire home screen answers one
// question: "what should I do right now?" — and makes starting effortless.
// Everything else is context, never a competing call to action.

export default function TodayPage() {
  const store = useStore();
  const today = todayIso();
  const { recommendations, dueCards, mistakes, streak, settings } = store;
  const greetingLabel = useGreeting();

  const [primary, ...rest] = recommendations;
  const experimentArm = store.experimentArm;
  const recordExperimentEvent = store.recordExperimentEvent;

  useEffect(() => {
    if (!primary) return;
    void store.recordFunnel("recommendation_displayed", `${primary.activity}:${primary.topicId ?? primary.subjectId}:${today}`);
    if (!experimentArm) return;
    const taskId = `${primary.activity}:${primary.topicId ?? primary.subjectId}:${today}`;
    void recordExperimentEvent("shown", { taskId, activity: primary.activity, topicId: primary.topicId ?? null });
  }, [experimentArm, primary, recordExperimentEvent, today]);

  if (!primary) return <EmptyToday name={settings.displayName} />;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* --- Hero: the one thing to do right now ------------------------- */}
      <NextBestAction recommendation={primary} displayName={settings.displayName} greeting={greetingLabel} />

      {/* --- Queue: what comes after -------------------------------------- */}
      {rest.length > 0 && (
        <div className="space-y-1 px-1">
          {rest.slice(0, 3).map((rec, i) => (
            <Link
              key={`${rec.activity}-${rec.topicId ?? rec.subjectId}`}
              href={rec.topicId ? `/practice?topic=${rec.topicId}` : `/review`}
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

  const href = recommendation.topicId
    ? `/practice?topic=${recommendation.topicId}`
    : `/review`;

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
