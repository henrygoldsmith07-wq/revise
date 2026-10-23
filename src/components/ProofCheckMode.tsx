"use client";

// Runs a delayed proof check on one topic: the questions, support level and
// trust rules are the same ones a mission's delayed-proof stage uses, so an
// answer from here feeds the same proof ledger and nothing else.
//
// There is no separate result. The summary reads the store's ledger after the
// attempt is recorded, so what it says is exactly what Progress says.

import { aboutMinutesLabel } from "@/domain/minutes";
import { useCallback, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { buildProofCheck, proofCheckCheckpoint, restoreProofCheck } from "@/domain/mission-session";
import { MIN_PROOF_DELAY_DAYS } from "@/domain/proof-of-improvement";
import { proofOutcomeFor } from "@/domain/proof-action";
import type { Id } from "@/domain/types";
import { useStoreFields } from "@/state/store";
import { QuestionSetSession } from "./QuestionSetSession";
import { useRevisionPlan } from "./recovery-evidence";
import { Button, EmptyState, Pill, SectionHeading } from "./ui";

export function ProofCheckMode({ topicId, onExit }: { topicId: string; onExit: () => void }) {
  const store = useStoreFields(
    "attempts",
    "clearRevisionCheckpoint",
    "proofLedger",
    "questions",
    "recordFunnel",
    "revisionCheckpoint",
    "saveRevisionCheckpoint",
  );
  const { saveRevisionCheckpoint, clearRevisionCheckpoint, recordFunnel } = store;
  const { plan } = useRevisionPlan();
  const topic = getTopic(topicId);

  const [{ check, resume, startedAt }] = useState(() => {
    // A refresh mid-check resumes the saved run exactly: same questions, same
    // order, no hints, and the answers already given. Rebuilding would exclude
    // what was just answered and swap the set; dating the run by the
    // checkpoint's updatedAt (which moves on every save) would drop answers.
    const restored = restoreProofCheck(store.revisionCheckpoint, {
      topicId, subjectId: topic?.subjectId ?? "", questions: store.questions, attempts: store.attempts,
    });
    if (restored) return restored;
    const fresh = buildProofCheck({ topicId, questions: store.questions, attempts: store.attempts });
    return { check: fresh, resume: undefined, startedAt: new Date().toISOString() };
  });

  const onProgress = useCallback((position: number) => {
    if (position >= check.questionIds.length) return;
    if (position === 0) void recordFunnel("revision_task_started", `proof:${topicId}`);
    void saveRevisionCheckpoint(proofCheckCheckpoint(check, { title: `Prove ${topic?.title ?? topicId}`, subjectId: topic?.subjectId ?? "" }, startedAt, position));
  }, [check, recordFunnel, saveRevisionCheckpoint, startedAt, topic?.subjectId, topic?.title, topicId]);

  const onFinished = useCallback(() => {
    void clearRevisionCheckpoint();
    void recordFunnel("recommendation_completed", `proof:${topicId}`);
  }, [clearRevisionCheckpoint, recordFunnel, topicId]);

  const exit = useCallback(() => { void clearRevisionCheckpoint(); onExit(); }, [clearRevisionCheckpoint, onExit]);

  const label = topic?.title ?? topicId;
  const subjectName = topic ? getSubject(topic.subjectId)?.name ?? topic.subjectId : "";

  if (!check.questionIds.length) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <SectionHeading title={`Prove ${label}`} hint={subjectName} />
        <EmptyState
          title="Not enough reviewed questions yet"
          body={check.limit ?? "Revise cannot run a check on this topic yet."}
          action={<Button onClick={exit}>Back to Today</Button>}
        />
      </div>
    );
  }

  const hintBudgetFor = Object.fromEntries(check.questionIds.map((id) => [id, check.hintBudget])) as Record<Id, number | undefined>;

  return (
    <QuestionSetSession
      title={`Prove ${label}`}
      hint={subjectName}
      questionIds={check.questionIds}
      startLabel="Start the check"
      exitLabel="Back to Today"
      emptyBody={check.limit ?? "Nothing to check here right now."}
      onExit={exit}
      resume={resume}
      onProgress={onProgress}
      onFinished={onFinished}
      hintBudgetFor={hintBudgetFor}
      intro={(
        <>
          <p>You revised {label} at least {MIN_PROOF_DELAY_DAYS} days ago. These questions check whether it held.</p>
          <p><span className="font-semibold">How this works:</span> new teacher-reviewed questions you have not seen, with no hints available. Answer them as you would in the exam.</p>
          <p>A score here moves your proof of improvement. It does not by itself show you will hold this in a different part of the paper.</p>
        </>
      )}
      nextStep={plan.top ? { href: plan.top.route.href, label: `Continue: ${plan.top.title}`, detail: `${plan.top.title}, ${aboutMinutesLabel(plan.top.minutes)}.` } : null}
      renderSummary={() => <ProofOutcomeSummary topicId={topicId} label={label} />}
    />
  );
}

/** Reads the ledger after the check, so the learner reads the same verdict Progress shows. */
function ProofOutcomeSummary({ topicId, label }: { topicId: string; label: string }) {
  const store = useStoreFields("proofLedger");
  const row = store.proofLedger.topics.find((candidate) => candidate.topicId === topicId);
  if (!row) return null;
  const outcome = proofOutcomeFor(row, { now: new Date() });
  return (
    <section className="space-y-2 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{label}</h2>
        <Pill tone={outcome.outcome === "proven" ? "success" : outcome.outcome === "slipped" ? "danger" : "accent"}>{outcome.headline}</Pill>
      </div>
      <p className="text-sm text-ink2">{outcome.detail}</p>
      <p className="text-xs text-ink3">{outcome.limits}</p>
      {outcome.nextCheckOn ? <p className="text-xs text-ink3">A check on new questions would count from {outcome.nextCheckOn}.</p> : null}
    </section>
  );
}
