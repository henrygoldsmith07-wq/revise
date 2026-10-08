"use client";

// One coherent repair prescription for a topic, derived from the unified
// learner model. Different failure modes get different workflows — never the
// same generic practice for every weakness.

import { useMemo } from "react";
import { getTopic } from "@/domain/curriculum";
import { buildLearnerIntelligence } from "@/domain/learner-intelligence";
import { prescribeIntervention, INTERVENTION_STEP_LABEL } from "@/domain/intervention-engine";
import { useStoreFields } from "@/state/store";
import { ButtonLink, Panel } from "./ui";
import { captureProductEvent } from "@/lib/product-telemetry";

export function InterventionCard({ topicId }: { topicId: string }) {
  const store = useStoreFields(
    "attempts",
    "mistakes",
    "mastery",
    "recallMastery",
    "applicationMastery",
    "examDates",
    "proofLedger",
  );
  const topic = getTopic(topicId);

  const prescription = useMemo(() => {
    if (!topic) return null;
    const intel = buildLearnerIntelligence({
      topicIds: [topicId],
      topicSubject: () => topic.subjectId,
      mastery: store.mastery,
      recallMastery: store.recallMastery,
      applicationMastery: store.applicationMastery,
      attempts: store.attempts,
      mistakes: store.mistakes,
      proof: store.proofLedger.topics,
      examDates: store.examDates,
      now: new Date(),
    });
    const row = intel.subjects.flatMap((s) => s.topics).find((t) => t.topicId === topicId);
    if (!row) return null;
    return prescribeIntervention(row, topic.title);
  }, [
    topic,
    topicId,
    store.mastery,
    store.recallMastery,
    store.applicationMastery,
    store.attempts,
    store.mistakes,
    store.proofLedger,
    store.examDates,
  ]);

  if (!topic || !prescription) return null;
  const [first, ...rest] = prescription.steps;
  if (!first) return null;

  return (
    <Panel className="border-accent space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">
          Recommended repair
        </p>
        <p className="mt-1 text-sm font-semibold text-ink">{prescription.headline}</p>
        <p className="mt-1 text-sm text-ink2">{prescription.reason}</p>
      </div>
      <ol className="space-y-1.5" aria-label="Repair steps">
        {[first, ...rest.slice(0, 3)].map((step, i) => (
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <ButtonLink
          href={first.href}
          variant="primary"
          size="md"
          className="min-h-[3rem]"
          onClick={() => captureProductEvent("intervention.started", { kind: first.kind })}
        >
          Start: {INTERVENTION_STEP_LABEL[first.kind]}
        </ButtonLink>
        {rest[0] ? (
          <ButtonLink href={rest[0].href} variant="ghost" size="sm" className="min-h-[3rem] inline-flex items-center justify-center">
            Then: {INTERVENTION_STEP_LABEL[rest[0].kind]} →
          </ButtonLink>
        ) : null}
      </div>
      <p className="text-[11px] text-ink3">
        Help never counts as proof. {prescription.totalMinutes} minutes total; proof needs a new
        unseen question with no hints.
      </p>
    </Panel>
  );
}
