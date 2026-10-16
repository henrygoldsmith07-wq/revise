"use client";

// Runs a delayed proof check on one topic: the questions, support level and
// trust rules are the same ones a mission's delayed-proof stage uses, so an
// answer from here feeds the same proof ledger and nothing else.
//
// There is no separate result. The summary reads the store's ledger after the
// attempt is recorded, so what it says is exactly what Progress says.

import { useCallback, useState } from "react";
import { getSubject, getTopic } from "@/domain/curriculum";
import { buildProofCheck, proofHref, missionResumePosition } from "@/domain/mission-session";
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
  const href = proofHref(topic?.subjectId ?? "", topicId);

  const [{ check, resume }] = useState(() => {
    const fresh = buildProofCheck({ topicId, questions: store.questions, attempts: store.attempts });
    // A refresh mid-check must resume the same questions: rebuilding now would
    // exclude what has just been answered and silently swap the set.
    const saved = store.revisionCheckpoint;
    const savedIds = saved?.queueIds ?? [];
    const resumable = saved !== null && saved.href === href && !saved.mission &&
      savedIds.length === fresh.questionIds.length &&
      fresh.questionIds.every((id) => savedIds.includes(id));
    if (resumable && saved) {
      const startedAt = saved.updatedAt;
      const known = new Set(store.questions.map((q) => q.id));
      const done = store.attempts.filter((a) => a.createdAt >= startedAt && known.has(a.questionId) && savedIds.includes(a.questionId));
      return { check: fresh, resume: { index: missionResumePosition(fresh.questionIds, done, startedAt), attempts: done } };
    }
    return { check: fresh, resume: undefined };
  });

  const onProgress = useCallback((position: number) => {
    if (position >= check.questionIds.length) return;
    if (position === 0) void recordFunnel("revision_task_started", `proof:${topicId}`);
    void saveRevisionCheckpoint({
      activity: "practice",
      title: `Prove ${topic?.title ?? topicId}`,
      href,
      topicId,
      position,
      total: check.questionIds.length,
      queueIds: [...check.questionIds],
    });
  }, [check.questionIds, href, recordFunnel, saveRevisionCheckpoint, topic?.title, topicId]);

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
          <p>You revised {label} at least three days ago. These questions check whether it held.</p>
          <p><span className="font-semibold">How this works:</span> new questions you have not seen, marked by a human, with no hints available. Answer them as you would in the exam.</p>
          <p>A score here moves your proof of improvement. It does not by itself show you will hold this in a different part of the paper.</p>
        </>
      )}
      nextStep={plan.top ? { href: plan.top.route.href, label: `Continue: ${plan.top.title}`, detail: `${plan.top.title}, about ${Math.ceil(plan.top.minutes)} min.` } : null}
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
