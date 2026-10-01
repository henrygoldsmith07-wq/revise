"use client";

import { useState } from "react";
import { getTopic } from "@/domain/curriculum";
import { buildRecoverySession, type RecoverySession } from "@/domain/marks-at-risk";
import { buildPaperAutopsy, type PaperAutopsy } from "@/domain/paper-autopsy";
import type { Attempt, Question } from "@/domain/types";
import { useStoreFields } from "@/state/store";
import { PaperAutopsyPanel } from "./PaperAutopsyPanel";
import { QuestionSetSession } from "./QuestionSetSession";
import { Button } from "./ui";

/** One bounded set aimed at the marks still open: the exact questions, then new ones on the same topics. */
export function RecoverMarksMode({ subjectId, onExit }: { subjectId?: string; onExit: () => void }) {
  const store = useStoreFields("attempts", "mistakes", "questions", "settings");
  const [session] = useState<RecoverySession>(() =>
    buildRecoverySession({
      mistakes: store.mistakes,
      attempts: store.attempts,
      questions: store.questions,
      subjectIds: store.settings.subjectIds,
      ...(subjectId ? { subjectId } : {}),
    }),
  );

  return (
    <QuestionSetSession
      title="Recover these marks"
      hint="Aimed at the marks you have already lost"
      questionIds={session.questionIds}
      startLabel="Start recovery"
      emptyBody="No open lost marks have a question to practise yet. Answer some questions and any marks you drop will be gathered here."
      onExit={onExit}
      intro={
        <>
          <p>
            <span className="font-semibold">Why these:</span> {session.resitIds.length} question{session.resitIds.length === 1 ? "" : "s"} behind your open losses
            {session.freshIds.length ? `, then ${session.freshIds.length} new on the same topics` : ""}. They target {session.coveredMarks} open marks across{" "}
            {session.topics.map((topic) => getTopic(topic.topicId)?.title ?? topic.topicId).slice(0, 3).join(", ") || "your weak topics"}.
          </p>
          <p>
            <span className="font-semibold">How it counts:</span> a mark only closes when its delayed retest earns the point. Doing well here is the first step, not the last.
          </p>
        </>
      }
      renderSummary={(attempts, queue) => <RecoverySummary attempts={attempts} queue={queue} session={session} />}
    />
  );
}

function RecoverySummary({ attempts, queue, session }: { attempts: Attempt[]; queue: Question[]; session: RecoverySession }) {
  const resits = attempts.filter((attempt) => session.resitIds.includes(attempt.questionId));
  const lost = resits.reduce((sum, attempt) => sum + (attempt.max - attempt.awarded), 0);
  const earned = resits.reduce((sum, attempt) => sum + attempt.awarded, 0);
  const max = resits.reduce((sum, attempt) => sum + attempt.max, 0);
  if (!resits.length) return <p className="text-xs text-ink2">No re-sits were answered, so nothing was tested against your open losses ({queue.length} questions in the set).</p>;
  return (
    <p className="text-xs text-ink2">
      Re-sits: {earned}/{max} marks{lost ? `, ${lost} still dropped and queued for repair` : ", all earned. Their delayed retests will confirm it"}.
    </p>
  );
}

function usePaperRun(runId: string) {
  const store = useStoreFields("attempts", "mistakes", "papers", "questions");
  const [autopsy] = useState<PaperAutopsy | null>(() => {
    const runAttempts = store.attempts.filter((attempt) => attempt.paperRunId === runId);
    const paperId = runAttempts.find((attempt) => attempt.paperId)?.paperId;
    const paper = paperId ? store.papers.find((candidate) => candidate.id === paperId) : undefined;
    if (!paper) return null;
    const byId = new Map(store.questions.map((question) => [question.id, question] as const));
    return buildPaperAutopsy({
      paper,
      paperRunId: runId,
      attempts: runAttempts,
      questions: paper.questionIds.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question)),
      mistakes: store.mistakes,
      bank: store.questions,
      history: store.attempts,
    });
  });
  return autopsy;
}

/** The autopsy for one paper sitting, reachable after the paper and from the papers list. */
export function PaperAutopsyView({ runId, onExit }: { runId: string; onExit: () => void }) {
  const autopsy = usePaperRun(runId);
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {autopsy ? (
        <PaperAutopsyPanel autopsy={autopsy} />
      ) : (
        <p className="text-sm text-ink3">That paper sitting could not be found on this device.</p>
      )}
      <Button className="w-full sm:w-auto" onClick={onExit}>Back to practice</Button>
    </div>
  );
}

/** One repair step, or the equivalent retest, taken from a paper autopsy. */
export function PaperRepairMode({ runId, step, onExit }: { runId: string; step: string; onExit: () => void }) {
  const autopsy = usePaperRun(runId);
  const retest = step === "retest";
  const repair = autopsy?.repairPlan.find((candidate) => candidate.id === step);
  const questionIds = retest ? autopsy?.equivalentRetest.questionIds ?? [] : repair?.questionIds ?? [];

  return (
    <QuestionSetSession
      title={retest ? "Equivalent retest" : `Repair: ${repair ? getTopic(repair.topicId)?.title ?? repair.topicId : "paper"}`}
      hint={autopsy ? autopsy.title : "Paper autopsy"}
      questionIds={questionIds}
      startLabel={retest ? "Start retest" : "Start repair"}
      emptyBody="This repair set is no longer available. Open the paper autopsy again to rebuild it."
      onExit={onExit}
      intro={
        retest ? (
          <>
            <p><span className="font-semibold">Why these:</span> new questions matched to the ones that lost you marks, so this measures the repair rather than your memory of the paper.</p>
            <p><span className="font-semibold">Read it carefully:</span> matched on topic, marks and difficulty, not identical in difficulty. Compare the totals, not single questions.</p>
          </>
        ) : (
          <>
            <p><span className="font-semibold">Why these:</span> the paper questions that lost marks here, re-sat with the mark scheme known{repair?.freshIds.length ? ", plus new questions on the same topic" : ""}.</p>
            {repair?.focus.length ? <p><span className="font-semibold">Missed on the paper:</span> {repair.focus.join("; ")}.</p> : null}
          </>
        )
      }
      renderSummary={retest && autopsy ? (attempts) => <RetestComparison autopsy={autopsy} attempts={attempts} /> : undefined}
    />
  );
}

function RetestComparison({ autopsy, attempts }: { autopsy: PaperAutopsy; attempts: Attempt[] }) {
  let before = 0;
  let beforeMax = 0;
  let after = 0;
  let afterMax = 0;
  for (const pair of autopsy.equivalentRetest.pairs) {
    const source = autopsy.analysis.questions.find((row) => row.questionId === pair.sourceQuestionId);
    const answered = attempts.find((attempt) => attempt.questionId === pair.equivalentQuestionId);
    if (!source || !answered) continue;
    before += source.marksAvailable - source.marksLost;
    beforeMax += source.marksAvailable;
    after += answered.awarded;
    afterMax += answered.max;
  }
  if (!beforeMax) return null;
  return (
    <p className="text-xs text-ink2" role="status">
      On the paper these questions scored {before}/{beforeMax}. On their equivalents: {after}/{afterMax}. Similar questions, not identical, so read the direction rather than the exact gap.
    </p>
  );
}
