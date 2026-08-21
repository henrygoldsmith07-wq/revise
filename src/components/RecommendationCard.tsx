"use client";

import { getSubject, getTopic } from "@/domain/curriculum";
import { ACTIVITY_BLURB, ACTIVITY_LABEL } from "@/domain/recommender";
import type { Recommendation, RecommendationExplanation } from "@/domain/types";
import { formatMinutes, recommendationHref } from "@/lib/activity";
import { ButtonLink, Panel, Pill } from "./ui";

function FactorRow({ factors }: { factors: Recommendation["factors"] }) {
  if (!factors) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      <Pill title={`Expected marks this activity recovers`}>gain {factors.examGain.toFixed(1)}</Pill>
      <Pill title="Closer exam = higher urgency">urgency ×{factors.urgency.toFixed(2)}</Pill>
      <Pill title="Lower mastery = higher weakness">weak ×{factors.weakness.toFixed(2)}</Pill>
      <Pill title="Decayed retention = higher forgetting risk">forget ×{factors.forgetting.toFixed(2)}</Pill>
      <Pill title="Thin evidence = higher uncertainty (explore)">uncert ×{factors.uncertainty.toFixed(2)}</Pill>
    </div>
  );
}

function formatMarks(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function examTiming(explanation: RecommendationExplanation): string | null {
  if (explanation.daysToExam == null) return null;
  const paper = explanation.paperLabel ?? "Next paper";
  if (explanation.daysToExam === 0) return `${paper} is today.`;
  if (explanation.daysToExam === 1) return `${paper} is tomorrow.`;
  return `${paper} is in ${explanation.daysToExam} days.`;
}

function buildWhyThis(
  recommendation: Recommendation,
  explanation: RecommendationExplanation,
  target: string,
): { summary: string; evidence: string[] } {
  const evidence = [`Estimated value: about ${formatMarks(explanation.recoverableMarks)} exam marks in ${formatMinutes(recommendation.minutes)}.`];

  switch (recommendation.activity) {
    case "flashcards": {
      const count = explanation.count ?? 0;
      const overdue = explanation.overdueCount ?? 0;
      return {
        summary:
          overdue > 0
            ? `${count} review ${count === 1 ? "card is" : "cards are"} waiting, including ${overdue} overdue. Reviewing them now protects recall before it fades further.`
            : `${count} review ${count === 1 ? "card is" : "cards are"} due today. Clearing them keeps recently learned material retrievable.`,
        evidence: [...evidence, `${overdue > 0 ? `${overdue} overdue` : "No overdue cards"} in this review set.`],
      };
    }
    case "mistakes": {
      const count = explanation.count ?? 0;
      return {
        summary: `${count} ${count === 1 ? "mistake is" : "mistakes are"} still unrepaired. Re-answering them targets marks you have already shown you can recover, rather than starting from scratch.`,
        evidence,
      };
    }
    case "practice":
      return {
        summary:
          explanation.lastEvidencePercent != null
            ? `${target} is currently at ${explanation.lastEvidencePercent}% in marked evidence. Exam-style questions will test the gap and show exactly what to fix next.`
            : `${target} is a weak point with limited marked evidence. An exam-style question will turn that uncertainty into something you can act on.`,
        evidence,
      };
    case "learn":
      return {
        summary: `You have not started ${target} yet. A first pass fills the coverage gap before recall and exam questions try to strengthen it.`,
        evidence: [...evidence, "No marked evidence yet — this is a coverage gap."],
      };
    case "paper":
      return {
        summary:
          explanation.daysToExam != null && explanation.daysToExam <= 21
            ? `${examTiming(explanation)?.replace(/\.$/, "")} A timed paper now checks whether your knowledge survives the conditions that matter.`
            : `Your coverage is strong enough for a timed ${target} paper. It will reveal whether knowledge holds up under exam pressure.`,
        evidence,
      };
    case "recall":
      return {
        summary: `${target} needs a retrieval check, not another reread. Recalling it from memory will expose the missing links while there is still time to repair them.`,
        evidence,
      };
    default:
      return {
        summary: recommendation.reason,
        evidence,
      };
  }
}

function RecommendationWhy({
  recommendation,
  explanation,
  target,
  compact,
}: {
  recommendation: Recommendation;
  explanation: RecommendationExplanation;
  target: string;
  compact: boolean;
}) {
  const copy = buildWhyThis(recommendation, explanation, target);
  const timing = examTiming(explanation);
  const whyId = `recommendation-why-${recommendation.activity}-${recommendation.subjectId}`;
  const evidence = [...copy.evidence];

  if (explanation.marksPerHour != null) {
    evidence.push(`Expected return: about ${explanation.marksPerHour.toFixed(1)} marks per hour.`);
  }
  if (explanation.lastEvidencePercent != null && recommendation.activity !== "practice") {
    evidence.push(`Latest marked evidence: ${explanation.lastEvidencePercent}% accuracy.`);
  }
  if (explanation.daysSinceRetrieval != null) {
    evidence.push(
      explanation.daysSinceRetrieval === 0
        ? "Last retrieval was today."
        : `Last retrieval was ${explanation.daysSinceRetrieval} days ago.`,
    );
  }
  if (timing) evidence.push(timing);

  const content = (
    <>
      <p className="text-sm text-ink2 leading-6">{copy.summary}</p>
      <ul className="mt-3 space-y-2 text-xs text-ink3">
        {evidence.slice(0, 3).map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-accent" aria-hidden="true">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <details className="mt-3 border-t border-line pt-2.5">
        <summary className="cursor-pointer text-[11px] font-semibold text-ink3 hover:text-ink">
          Show scoring detail
        </summary>
        <FactorRow factors={explanation.factors} />
        <p className="text-[11px] text-ink3 mt-2">
          The rank weighs expected marks, exam timing, weakness, fading recall and evidence depth against the time required.
        </p>
      </details>
    </>
  );

  if (compact) {
    return (
      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink2 hover:text-ink">Why this?</summary>
        <div className="pt-2.5">{content}</div>
      </details>
    );
  }

  return (
    <section className="mt-4 border-t border-line pt-3" aria-labelledby={whyId}>
      <h3 id={whyId} className="text-xs font-semibold text-ink2">Why this?</h3>
      <div className="pt-2.5">{content}</div>
    </section>
  );
}

export function RecommendationCard({
  recommendation,
  variant = "primary",
  compact = false,
}: {
  recommendation: Recommendation;
  variant?: "primary" | "secondary";
  compact?: boolean;
}) {
  const topic = recommendation.topicId ? getTopic(recommendation.topicId) : null;
  const subject = getSubject(recommendation.subjectId);
  const exp = recommendation.explanation;
  const isPrimary = variant === "primary";

  return (
    <Panel className={isPrimary ? "relative overflow-hidden" : ""}>
      {isPrimary ? (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Pill tone="speak">{compact ? "Next step" : "Recommended now"}</Pill>
          <Pill>{formatMinutes(recommendation.minutes)}</Pill>
          {recommendation.plannedSessionId ? <Pill tone="success">In today&apos;s plan</Pill> : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-1.5">
          <Pill>{ACTIVITY_LABEL[recommendation.activity]}</Pill>
          <span className="text-[11px] text-ink3">{formatMinutes(recommendation.minutes)}</span>
        </div>
      )}

      <h2 className={isPrimary ? "text-lg sm:text-xl font-semibold tracking-tight" : "text-sm font-medium text-ink"}>
        {ACTIVITY_LABEL[recommendation.activity]}
        {topic ? ` · ${topic.title}` : !isPrimary && subject ? ` · ${subject.name}` : ""}
      </h2>
      <p className="text-sm text-ink3 mt-0.5">
        {subject?.name ?? recommendation.subjectId} — {ACTIVITY_BLURB[recommendation.activity]}
      </p>
      <p className="text-sm text-ink2 mt-3 max-w-2xl">{recommendation.reason}</p>

      {exp ? (
        <RecommendationWhy
          recommendation={recommendation}
          explanation={exp}
          target={topic?.title ?? subject?.name ?? recommendation.subjectId}
          compact={compact}
        />
      ) : !compact ? (
        <FactorRow factors={recommendation.factors ?? recommendation.explanation?.factors} />
      ) : null}

      <div className={isPrimary ? "mt-4 flex flex-wrap gap-2" : "mt-3"}>
        <ButtonLink
          href={recommendationHref(recommendation)}
          variant={isPrimary ? "primary" : "secondary"}
          className={isPrimary ? "flex-1 sm:flex-none w-full sm:w-auto min-h-[3rem] px-6" : "block w-full"}
        >
          {isPrimary ? "Start now" : "Start"}
        </ButtonLink>
      </div>
    </Panel>
  );
}
