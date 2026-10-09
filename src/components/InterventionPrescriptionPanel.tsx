"use client";

// The repair path after lost marks, prescribed by the failure-mode engine.
//
// The generic "practise more" link ignores *why* a mark was lost. This asks
// the unified learner model what the actual failure mode is on this topic —
// recall gap, application gap, recurring misconception, command-word
// weakness, proof due — and renders the ordered repair path that follows from
// it. Each step says whether it counts as evidence, so help is never confused
// with proof.

import { useMemo } from "react";
import { getTopic } from "@/domain/curriculum";
import { buildLearnerIntelligence, describeTopicIntelligence } from "@/domain/learner-intelligence";
import { prescribeIntervention, INTERVENTION_STEP_LABEL } from "@/domain/intervention-engine";
import { useStoreFields } from "@/state/store";
import { ButtonLink } from "./ui";
import { captureProductEvent } from "@/lib/product-telemetry";

export function useInterventionPrescription(topicId: string | undefined) {
  const store = useStoreFields(
    "attempts",
    "examDates",
    "mastery",
    "mistakes",
    "proofLedger",
    "questions",
    "recallMastery",
    "applicationMastery",
    "settings",
  );
  return useMemo(() => {
    if (!topicId) return null;
    const topic = getTopic(topicId);
    if (!topic) return null;
    const intel = buildLearnerIntelligence({
      topicIds: [topicId],
      topicSubject: () => topic.subjectId,
      mastery: store.mastery,
      recallMastery: store.recallMastery ?? [],
      applicationMastery: store.applicationMastery ?? [],
      attempts: store.attempts,
      mistakes: store.mistakes,
      proof: store.proofLedger.topics,
      examDates: store.examDates,
      now: new Date(),
    });
    const row = intel.subjects.flatMap((s) => s.topics).find((t) => t.topicId === topicId);
    if (!row) return null;
    const prescription = prescribeIntervention(row, topic.title);
    return { row, prescription, topicTitle: topic.title, intelligenceLine: describeTopicIntelligence(row, topic.title) };
  }, [
    topicId,
    store.mastery,
    store.recallMastery,
    store.applicationMastery,
    store.attempts,
    store.mistakes,
    store.proofLedger,
    store.examDates,
  ]);
}

/**
 * Rendered under the mark result when marks were lost. The engine decides
 * the path; this only shows it, with the first step as the single action.
 */
export function InterventionPrescriptionPanel({ topicId, marksLost }: { topicId: string | undefined; marksLost: number }) {
  const prescribed = useInterventionPrescription(topicId);
  if (!prescribed || marksLost <= 0) return null;
  const { row, prescription, topicTitle, intelligenceLine } = prescribed;
  const steps = prescription.steps.slice(0, 4);
  const first = steps[0];
  if (!first) return null;
  const isApplicationGap = row.applicationGap !== null;
  return (
    <div className="rounded-[8px] border border-line px-3 py-2.5 space-y-2" aria-label="Your repair plan">
      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
        {isApplicationGap ? "You remember it — now make it score" : "Your repair plan"}
      </p>
      <p className="text-sm font-semibold text-ink">{prescription.headline}</p>
      <p className="text-xs text-ink2">{intelligenceLine}</p>
      <ol className="space-y-1.5" aria-label="Repair steps">
        {steps.map((step, i) => (
          <li key={step.kind} className="flex items-start gap-2 text-xs text-ink2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface2 text-[11px] font-semibold text-ink">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="font-medium text-ink">{INTERVENTION_STEP_LABEL[step.kind]}</span>
              {" — "}
              {step.why}
              {step.countsAsProof ? "" : " (practice, not proof)"}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink
          href={first.href}
          size="sm"
          variant="primary"
          onClick={() => captureProductEvent("intervention.started", { kind: first.kind })}
        >
          Start: {INTERVENTION_STEP_LABEL[first.kind]}
        </ButtonLink>
        {steps[1] ? (
          <ButtonLink href={steps[1].href} size="sm" variant="ghost">
            Then: {INTERVENTION_STEP_LABEL[steps[1].kind]} →
          </ButtonLink>
        ) : null}
      </div>
      <p className="text-[11px] text-ink3">
        Help never counts as proof. Only an unaided answer on a new question — at least 3 days
        on, where reviewed questions exist — counts. {prescription.totalMinutes} minutes total
        {row.daysToExam !== null ? ` · exam in ${row.daysToExam} days` : ""}.
      </p>
      <p className="text-[11px] text-ink3">
        Chosen for {topicTitle} from your recall, application, mistakes and proof evidence.
      </p>
    </div>
  );
}
