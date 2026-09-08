"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { allTopics, getSubject, getTopic } from "@/domain/curriculum";
import {
  buildAdaptiveSession,
  replanAdaptiveSession,
  resultFromQuestionAttempt,
  resultFromRetrievalGrades,
  summariseAdaptiveRun,
  type AdaptivePrereqVerdict,
  type AdaptiveReplan,
  type AdaptiveSessionPlan,
  type AdaptiveSessionStep,
  type AdaptiveStepRecord,
} from "@/domain/adaptive-session";
import { diagnosePrerequisiteWeakness } from "@/domain/prerequisite-diagnosis";
import { buryCard } from "@/domain/scheduling";
import { evaluateMistakeRetest } from "@/domain/mistakes";
import { wjecCapabilities } from "@/content/capabilities";
import type { Attempt, Card, Id, Mistake, Question, Topic } from "@/domain/types";
import { readReviseUserMeta, writeReviseUserMeta } from "@/data/storage-namespace";
import { useStore } from "@/state/store";
import { AdaptiveRetrievalBlock, type RetrievalOutcome } from "@/components/AdaptiveRetrievalBlock";
import { AdaptiveQuestionBlock } from "@/components/AdaptiveQuestionBlock";
import { Button, ButtonLink, EmptyState, Panel, Pill, ProgressBar } from "@/components/ui";

// ---------------------------------------------------------------------------
// The adaptive session runner.
//
// Today chooses ONE session; this route runs it as one continuous experience:
// the student answers in place (cards, questions, retests). Every meaningful
// step becomes an evidence record, and replanAdaptiveSession re-derives the
// remaining sequence from that evidence — support fades or returns, repairs
// and prerequisite detours are inserted, unneeded teaching is skipped, and
// the session stops when the evidence (or the time budget) says so. A refresh
// or Pause/Resume never loses the run: executed records are stored per user
// and the remaining plan is replayed deterministically from them.
// ---------------------------------------------------------------------------

const RUN_META = "adaptiveRun";

interface AdaptiveRunState {
  key: string;
  topicId: Id;
  startedAt: string;
  completed: AdaptiveStepRecord[];
  finished: boolean;
}

export default function AdaptiveSessionPage() {
  return (
    <Suspense fallback={null}>
      <AdaptiveSession />
    </Suspense>
  );
}

function AdaptiveSession() {
  const params = useSearchParams();
  const store = useStore();
  const requestedTopicId = params.get("topic");
  const startRequested = params.get("start") === "1";
  const resumeRequested = params.get("resume") === "1";
  const checkpointTopicId = store.revisionCheckpoint?.topicId;
  const { clearRevisionCheckpoint, saveRevisionCheckpoint } = store;
  const topics = useMemo(() => allTopics(store.settings.subjectIds), [store.settings.subjectIds]);

  // The plan's original ladder anchors the session: executed ids are filtered
  // out of it by the replanner, and replanned steps extend it. It must not
  // move while a run is live, so it is frozen on first use.
  const computedPlan = useMemo<AdaptiveSessionPlan | null>(() => {
    if (!requestedTopicId && !resumeRequested) return store.adaptiveSession;
    return buildAdaptiveSession({
      topics,
      cards: store.cards,
      reviewLogs: store.reviewLogs,
      questions: store.questions,
      attempts: store.attempts,
      mistakes: store.mistakes,
      mastery: store.mastery,
      exams: store.examDates,
      subjectIds: store.settings.subjectIds,
      recallMastery: store.recallMastery,
      applicationMastery: store.applicationMastery,
      readiness: store.examReadiness,
      targetMinutes: 20,
      topicId: requestedTopicId ?? checkpointTopicId,
    });
  }, [
    requestedTopicId,
    resumeRequested,
    store.adaptiveSession,
    store.cards,
    store.reviewLogs,
    store.questions,
    store.attempts,
    store.mistakes,
    store.mastery,
    store.examDates,
    store.settings.subjectIds,
    store.recallMastery,
    store.applicationMastery,
    store.examReadiness,
    checkpointTopicId,
    topics,
  ]);
  const [frozenPlan] = useState<AdaptiveSessionPlan | null>(() => computedPlan);
  const plan = frozenPlan ?? computedPlan;

  const [run, setRun] = useState<AdaptiveRunState | null>(null);
  const [steps, setSteps] = useState<AdaptiveSessionStep[]>([]);
  const [phase, setPhase] = useState<"loading" | "intro" | "active" | "done">("loading");
  const [replanReason, setReplanReason] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState<AdaptiveStepRecord | null>(null);
  const [replanned, setReplanned] = useState(false);
  const bootstrapped = useRef(false);

  const subject = plan ? getSubject(plan.subjectId) : undefined;
  const checkpointHref = plan
    ? `/adaptive-session?topic=${encodeURIComponent(plan.topicId)}&start=1&resume=1`
    : "/adaptive-session";

  // ---- Boot: restore a saved run or begin fresh -----------------------------
  useEffect(() => {
    if (!plan || bootstrapped.current) return;
    bootstrapped.current = true;
    if (startRequested || resumeRequested) {
      void (async () => {
        const saved = await readReviseUserMeta<AdaptiveRunState>(RUN_META, store.userId);
        if (saved && saved.key === plan.key && saved.topicId === plan.topicId) {
          if (saved.finished) {
            setRun(saved);
            setPhase("done");
          } else {
            setRun(saved);
            // A run with no completed steps is indistinguishable from a fresh
            // one, so restart the original ladder rather than stalling.
            setSteps(saved.completed.length ? [] : plan.steps);
            setPhase("active");
          }
        } else {
          const fresh: AdaptiveRunState = {
            key: plan.key,
            topicId: plan.topicId,
            startedAt: new Date().toISOString(),
            completed: [],
            finished: false,
          };
          setRun(fresh);
          setSteps(plan.steps);
          setPhase("active");
        }
      })();
    }
    // When neither start nor resume was requested the phase stays "loading"
    // and the intro is rendered instead of the restore message (see below).
  }, [plan, startRequested, resumeRequested, store.userId]);

  // ---- Replan after every executed step ------------------------------------
  // Reads the freshest stored evidence so mistakes/attempts just created by
  // the finished step are visible to the tutor's next decision. Runs after an
  // await so state updates happen outside the synchronous effect body.
  useEffect(() => {
    if (!plan || !run || !run.completed.length || run.finished) return;
    let cancelled = false;
    void (async () => {
      const result = await Promise.resolve().then(() =>
        replanWithCurrentEvidence(plan, store, topics, run.completed),
      );
      if (cancelled) return;
      if (result && result.steps.length === 0 && result.done) {
        const finished: AdaptiveRunState = { ...run, finished: true };
        setRun(finished);
        setSteps([]);
        setPhase("done");
        void writeReviseUserMeta(RUN_META, store.userId, finished);
        setReplanReason(result.reason);
        return;
      }
      setSteps(result?.steps ?? []);
      setReplanReason(result?.reason ?? null);
      setReplanned(true);
    })();
    return () => {
      cancelled = true;
    };
    // The store object is intentionally omitted: replanning must run only when
    // the run's completed evidence changes, and the store is read fresh each
    // time the effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, plan, topics]);

  // A finished run clears its resume checkpoint so Today moves on.
  useEffect(() => {
    if (phase === "done") void clearRevisionCheckpoint();
  }, [phase, clearRevisionCheckpoint]);

  // ---- Checkpoint: pause/resume keeps the position --------------------------
  useEffect(() => {
    if (!plan || !run || phase !== "active") return;
    void saveRevisionCheckpoint({
      activity: "adaptive",
      title: `${subject?.name ?? plan.subjectId} — ${plan.topicTitle}`,
      href: checkpointHref,
      topicId: plan.topicId,
      position: run.completed.length,
      total: run.completed.length + steps.length,
      queueIds: [...run.completed.map((record) => record.stepId), ...steps.map((step) => step.id)],
    });
  }, [
    checkpointHref,
    phase,
    plan,
    run,
    saveRevisionCheckpoint,
    steps,
    subject,
  ]);

  const startFresh = () => {
    if (!plan) return;
    const fresh: AdaptiveRunState = {
      key: plan.key,
      topicId: plan.topicId,
      startedAt: new Date().toISOString(),
      completed: [],
      finished: false,
    };
    setRun(fresh);
    setSteps(plan.steps);
    setReplanned(true);
    setJustCompleted(null);
    setPhase("active");
    void writeReviseUserMeta(RUN_META, store.userId, fresh);
  };

  const recordStep = (record: AdaptiveStepRecord) => {
    if (!run) return;
    const next = { ...run, completed: [...run.completed, record] };
    setRun(next);
    setJustCompleted(record);
    setReplanned(false);
    void writeReviseUserMeta(RUN_META, store.userId, next);
  };

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <EmptyState
          title="No adaptive session yet"
          body="Choose a subject in onboarding or settings and Today will build the next best sequence for you."
          action={<ButtonLink href="/settings" variant="primary">Choose subjects</ButtonLink>}
        />
      </div>
    );
  }

  if (phase === "done" && run) {
    return (
      <AdaptiveComplete
        plan={plan}
        run={run}
        store={store}
        onRestart={startFresh}
      />
    );
  }

  // With no start/resume requested the boot effect never runs, so the phase
  // stays "loading" and the intro is the correct screen. The explicit
  // "intro" branch remains for parity with that path.
  const showIntro =
    phase === "intro" || (phase === "loading" && !run && !startRequested && !resumeRequested);
  if (showIntro) {
    return <Intro plan={plan} subjectName={subject?.name ?? plan.subjectId} onStart={startFresh} />;
  }

  if (phase === "loading" || !run) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <p className="text-sm text-ink3" role="status">Restoring your session…</p>
      </div>
    );
  }

  const activeStep = steps[0];
  const spentMinutes = run.completed.reduce((sum, record) => sum + Math.max(0, record.minutes), 0);
  const nextAfter = steps.length > 1 ? steps[1] : undefined;
  const lastRecord = run.completed.at(-1);
  const showContinue = Boolean(justCompleted && replanned && activeStep?.id !== justCompleted.stepId);
  const sessionFinished =
    lastRecord?.kind === "delayed-retrieval" && lastRecord.result === "scheduled" && steps.length === 0;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink3 truncate">{subject?.name ?? plan.subjectId} · {plan.topicTitle}</p>
          <h1 className="text-sm font-semibold">Adaptive session</h1>
        </div>
        <ButtonLink href="/" size="sm" variant="ghost">Pause</ButtonLink>
      </div>

      <ProgressBar
        value={plan.targetMinutes ? Math.min(1, spentMinutes / plan.targetMinutes) : 0}
        label={`Step ${run.completed.length + 1} of ${Math.max(1, run.completed.length + steps.length)} · ${spentMinutes}/${plan.targetMinutes} minutes planned`}
      />

      {activeStep ? (
        <StepPanel
          key={activeStep.id}
          step={activeStep}
          plan={plan}
          store={store}
          replanReason={replanReason}
          onDone={recordStep}
          onRetrievalComplete={(outcome: RetrievalOutcome) => {
            if (!run) return;
            recordStep({
              stepId: activeStep.id,
              kind: activeStep.kind,
              minutes: activeStep.minutes,
              result: resultFromRetrievalGrades(outcome.grades),
              awardedMarks: 0,
              maxMarks: 0,
              hintTier: null,
              missedItemIds: outcome.missedItemIds,
              elapsedMs: 0,
            });
          }}
        />
      ) : (
        <Panel>
          <p className="text-sm text-ink2" role="status">
            {replanReason ?? "Preparing the next step…"}
          </p>
        </Panel>
      )}

      {showContinue || sessionFinished ? (
        <div className="rounded-[10px] border border-line bg-surface2/60 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-ink2 font-bold">Next step</p>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold mt-1">
            {justCompleted?.result === "passed-independent"
              ? "Recorded — independent success"
              : justCompleted?.result === "passed-assisted"
                ? "Recorded — assisted success (weaker evidence)"
                : justCompleted?.result === "missed" || justCompleted?.result === "gave-up"
                  ? "Recorded — this attempt missed"
                  : justCompleted?.result === "scheduled"
                    ? "Delayed retrieval scheduled"
                    : "Step recorded"}
          </p>
          {replanReason ? <p className="text-xs text-ink2 mt-1">{replanReason}</p> : null}
          <Button
            variant="primary"
            className="w-full min-h-11 mt-3"
            onClick={() => {
              setJustCompleted(null);
              setReplanned(false);
              if (!steps.length) {
                const finished = run ? { ...run, finished: true } : run;
                if (finished) {
                  setRun(finished);
                  setPhase("done");
                  void writeReviseUserMeta(RUN_META, store.userId, finished);
                }
              }
            }}
          >
            {nextAfter ? `Continue — ${nextAfter.label}` : steps.length === 0 ? "Finish session" : "Continue"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

function StepPanel({
  step,
  plan,
  store,
  replanReason,
  onDone,
  onRetrievalComplete,
}: {
  step: AdaptiveSessionStep;
  plan: AdaptiveSessionPlan;
  store: ReturnType<typeof useStore>;
  replanReason: string | null;
  onDone: (record: AdaptiveStepRecord) => void;
  onRetrievalComplete: (outcome: RetrievalOutcome) => void;
}) {
  const availableCards: Card[] = step.cardIds.length
    ? store.cards.filter((card) => step.cardIds.includes(card.id) && !card.suspended)
    : [];
  const mistake: Mistake | undefined = step.mistakeIds[0]
    ? store.mistakes.find((candidate) => candidate.id === step.mistakeIds[0] && !candidate.resolved)
    : undefined;
  const question: Question | undefined = step.questionIds[0]
    ? store.questions.find((candidate) => candidate.id === step.questionIds[0])
    : undefined;
  const support: "supported" | "independent" =
    step.params?.support ??
    (step.kind === "supported-practice" || step.kind === "prerequisite-repair" ? "supported" : "independent");
  const topic = getTopic(step.topicId);

  const [recallDraft, setRecallDraft] = useState("");
  const [recallRevealed, setRecallRevealed] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const scheduleCards = useMemo(
    () =>
      step.cardIds.length
        ? store.cards.filter((candidate) => step.cardIds.includes(candidate.id))
        : (plan.steps.at(-1)?.cardIds ?? [])
            .map((id) => store.cards.find((candidate) => candidate.id === id))
            .filter((card): card is Card => Boolean(card)),
    [step.cardIds, plan.steps, store.cards],
  );

  const finishQuestion = (attempt: Attempt, hintTier: AdaptiveStepRecord["hintTier"], gaveUp: boolean) => {
    const effectiveHint = hintTier ?? (attempt.repairTeachingSeen ? "scaffold" : null);
    const result = resultFromQuestionAttempt({ awarded: attempt.awarded, max: attempt.max, hintTier: effectiveHint, gaveUp });
    let resolvedMistakeId: Id | undefined;
    if (mistake && question && attempt.retestMistakeId === mistake.id) {
      const evaluation = evaluateMistakeRetest(mistake, question, attempt, store.attempts, store.questions);
      if (evaluation.status === "resolved") resolvedMistakeId = mistake.id;
    }
    onDone({
      stepId: step.id,
      kind: step.kind,
      minutes: step.minutes,
      result,
      awardedMarks: attempt.awarded,
      maxMarks: attempt.max,
      hintTier: effectiveHint,
      ...(attempt.questionId ? { itemId: attempt.questionId } : {}),
      ...(resolvedMistakeId ? { resolvedMistakeId } : {}),
      elapsedMs: attempt.elapsedMs,
    });
  };

  return (
    <Panel className="space-y-4">
      <div className="min-w-0">
        <Pill tone="accent">{step.minutes} min</Pill>
        <h2 className="text-xl font-semibold text-ink mt-2">{step.label}</h2>
        {topic ? <p className="text-xs text-ink3 mt-0.5">{getSubject(topic.subjectId)?.name} · {topic.title}</p> : null}
      </div>
      {replanReason ? <p className="text-sm text-ink2" role="note">Why this step: {replanReason}</p> : null}
      {step.description ? <p className="text-sm text-ink2">{step.description}</p> : null}

      {step.kind === "overdue-retrieval" ? (
        availableCards.length ? (
          <AdaptiveRetrievalBlock cards={availableCards} onComplete={onRetrievalComplete} />
        ) : (
          <p className="text-xs text-ink3" role="status">
            These cards were already handled — moving on.
          </p>
        )
      ) : null}

      {step.kind === "explanation" ? (
        <ExplanationGate
          plan={plan}
          draft={recallDraft}
          revealed={recallRevealed}
          onDraft={setRecallDraft}
          onReveal={() => setRecallRevealed(true)}
          onDone={() =>
            onDone({
              stepId: step.id,
              kind: step.kind,
              minutes: step.minutes,
              result: "viewed",
              awardedMarks: 0,
              maxMarks: 0,
              hintTier: null,
              elapsedMs: 0,
            })
          }
        />
      ) : null}

      {step.kind === "misconception-repair" ? (
        <div className="space-y-3">
          {mistake ? (
            <div className="rounded-[8px] border border-danger/30 bg-dangersoft/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-danger font-semibold">The skill to repair</p>
              <p className="text-sm text-ink mt-1">{mistake.description}</p>
              {mistake.point ? (
                <p className="text-xs text-ink3 mt-1">
                  The mark needed: “{mistake.point}”. Contrast your answer with that point, then re-earn it below.
                </p>
              ) : null}
              {step.capabilityId ? <p className="text-sm text-ink mt-2">{wjecCapabilities.find((node) => node.id === step.capabilityId)?.explanation}</p> : null}
            </div>
          ) : (
            <p className="text-xs text-ink2">
              Contrast the tempting wrong idea with the credited one, then re-apply it independently below.
            </p>
          )}
          {question ? (
            <AdaptiveQuestionBlock
              key={`repair:${question.id}:${mistake?.id ?? "none"}`}
              question={question}
              support={support}
              retestMistake={mistake}
              repairTeachingSeen={Boolean(mistake)}
              onComplete={({ attempt, hintTier, gaveUp }) => finishQuestion(attempt, hintTier, gaveUp)}
            />
          ) : (
            <p className="text-xs text-ink3" role="status">
              No source question is stored for this mistake — the next application rung re-tests the idea.
            </p>
          )}
        </div>
      ) : null}

      {step.kind === "supported-practice" ||
      step.kind === "independent-application" ||
      step.kind === "transfer" ||
      step.kind === "prerequisite-repair" ? (
        question ? (
          <AdaptiveQuestionBlock
            key={`${step.kind}:${question.id}`}
            question={question}
            support={support}
            retestMistake={mistake}
            onComplete={({ attempt, hintTier, gaveUp }) => finishQuestion(attempt, hintTier, gaveUp)}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink2">No question is available for this rung in the current bank.</p>
            <Button
              variant="primary"
              onClick={() =>
                onDone({
                  stepId: step.id,
                  kind: step.kind,
                  minutes: step.minutes,
                  result: "viewed",
                  awardedMarks: 0,
                  maxMarks: 0,
                  hintTier: null,
                  elapsedMs: 0,
                })
              }
            >
              Mark this rung as not attemptable
            </Button>
          </div>
        )
      ) : null}

      {step.kind === "delayed-retrieval" ? (
        <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-3">
          <p className="text-sm text-ink2">
            Tomorrow&apos;s short retrieval is part of today&apos;s learning, not an optional extra — the gain is only
            proven once it survives a delay.
          </p>
          <Button
            variant={scheduled ? "secondary" : "primary"}
            size="sm"
            className="mt-3"
            disabled={scheduled}
            onClick={async () => {
              if (scheduled) return;
              if (scheduleCards.length) {
                await store.updateCards(scheduleCards.map((card) => buryCard(card, 1)));
              }
              setScheduled(true);
              onDone({
                stepId: step.id,
                kind: step.kind,
                minutes: Math.max(0, step.minutes),
                result: "scheduled",
                awardedMarks: 0,
                maxMarks: 0,
                hintTier: null,
                elapsedMs: 0,
              });
            }}
          >
            {scheduled ? "Delayed retrieval scheduled" : "Schedule for tomorrow"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

function ExplanationGate({
  plan,
  draft,
  revealed,
  onDraft,
  onReveal,
  onDone,
}: {
  plan: AdaptiveSessionPlan;
  draft: string;
  revealed: boolean;
  onDraft: (value: string) => void;
  onReveal: () => void;
  onDone: () => void;
}) {
  const topic = getTopic(plan.topicId);
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-[8px] border border-line bg-surface2/60 px-3 py-3">
        <label className="block text-xs font-semibold text-ink2" htmlFor="adaptive-recall">
          Before reading: explain {plan.topicTitle} in your own words.
        </label>
        <textarea
          id="adaptive-recall"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          rows={4}
          className="field w-full text-sm"
          placeholder="Write the mechanism, condition, or consequence you remember…"
        />
        {!revealed ? (
          <Button variant="primary" disabled={!draft.trim()} onClick={onReveal}>
            Reveal explanation
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-[8px] border border-line bg-surface2 px-3 py-3">
              {topic?.summary ? <p className="text-sm text-ink2">{topic.summary}</p> : null}
              {topic?.keyPoints.length ? (
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-ink2">
                  {topic.keyPoints.slice(0, 5).map((point) => <li key={point}>{point}</li>)}
                </ul>
              ) : null}
              {topic?.commonErrors.length ? (
                <p className="text-xs text-ink3 mt-2">
                  <span className="font-semibold">Examiner note: </span>
                  {topic.commonErrors[0]}
                </p>
              ) : null}
            </div>
            <Button variant="primary" className="w-full" onClick={onDone}>
              Done — continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intro + completion
// ---------------------------------------------------------------------------

function Intro({ plan, subjectName, onStart }: { plan: AdaptiveSessionPlan; subjectName: string; onStart: () => void }) {
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <ButtonLink href="/" variant="ghost" size="sm">← Today</ButtonLink>
      <header>
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Adaptive session</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink mt-1">
          Best use of the next {plan.totalMinutes} minutes
        </h1>
        <p className="text-lg text-ink mt-2">{subjectName} — {plan.topicTitle}</p>
        <p className="text-sm text-ink3 mt-1">{plan.reason}</p>
      </header>

      <Panel>
        <p className="text-sm text-ink2">
          One clear action at a time: answer, get feedback, and Revise chooses what comes next from how you did — no
          menus, no leaving the session. Answer from memory first; support appears only when you need it.
        </p>
        <details className="mt-3">
          <summary className="text-xs text-ink2 cursor-pointer select-none">Preview the planned ladder</summary>
          <ol className="mt-2 space-y-1.5 list-disc list-inside text-xs text-ink3">
            {plan.steps.map((step) => (
              <li key={step.id}>
                <span className="font-medium text-ink2">{step.label}</span> — {step.minutes}m
              </li>
            ))}
          </ol>
        </details>
      </Panel>

      <Button variant="primary" className="w-full min-h-[3rem] text-base" onClick={onStart}>
        Start session
      </Button>
    </div>
  );
}

function AdaptiveComplete({
  plan,
  run,
  store,
  onRestart,
}: {
  plan: AdaptiveSessionPlan;
  run: AdaptiveRunState;
  store: ReturnType<typeof useStore>;
  onRestart: () => void;
}) {
  const subject = getSubject(plan.subjectId);
  const summary = useMemo(() => {
    const open = store.mistakes
      .filter((mistake) => !mistake.resolved && mistake.topicId === plan.topicId)
      .map((mistake) => mistake.id);
    return summariseAdaptiveRun({ plan, completed: run.completed, openMistakeIds: open });
  }, [plan, run.completed, store.mistakes]);

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div role="status" aria-live="polite">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Session complete</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink mt-1">The gain is now tested.</h1>
        <p className="text-sm text-ink3 mt-1">{subject?.name ?? plan.subjectId} — {plan.topicTitle}</p>
      </div>

      <Panel className="space-y-4">
        {summary.marks.max > 0 ? (
          <ProgressBar
            value={summary.marks.awarded / summary.marks.max}
            label={`${summary.marks.awarded}/${summary.marks.max} marks on this session's questions`}
            tone="accent"
          />
        ) : null}
        <SummarySection title="Improved" lines={summary.improved} />
        <SummarySection title="Still fragile" lines={summary.fragile} />
        <SummarySection title="Repaired" lines={summary.repaired} />
        <SummarySection title="Later" lines={summary.later} />
        {summary.learned.length ? (
          <div className="rounded-[10px] bg-accentsoft border border-accent/15 px-3.5 py-3">
            <p className="text-[11px] uppercase tracking-wide text-accent font-semibold">Revise learned</p>
            {summary.learned.map((line) => <p key={line} className="text-xs text-ink2 mt-1">{line}</p>)}
          </div>
        ) : null}
        <div className="rounded-[10px] bg-accentsoft border border-accent/15 px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-wide text-accent font-semibold">Best next action</p>
          <p className="text-sm text-ink2 mt-1">{summary.bestNext}</p>
        </div>
      </Panel>

      <div className="flex gap-2">
        <ButtonLink href="/" variant="primary" className="flex-1">Back to Today</ButtonLink>
        <Button variant="secondary" className="flex-1" onClick={onRestart}>Start again</Button>
      </div>
    </div>
  );
}

function SummarySection({ title, lines }: { title: string; lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-sm text-ink mt-1">
          {line}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence plumbing
// ---------------------------------------------------------------------------

/** Build the tutor's next-step verdict from the freshest stored evidence. */
function replanWithCurrentEvidence(
  plan: AdaptiveSessionPlan,
  store: ReturnType<typeof useStore>,
  topics: Topic[],
  completed: AdaptiveStepRecord[],
): AdaptiveReplan | null {
  const topicQuestions = store.questions.filter((question) => question.topicIds.includes(plan.topicId));
  const topicCards = store.cards.filter((card) => card.topicId === plan.topicId);
  const topicMistakes = store.mistakes.filter((mistake) => !mistake.resolved && mistake.topicId === plan.topicId);
  const topicAttempts = store.attempts.filter((attempt) => attempt.topicIds.includes(plan.topicId));

  const subjectTopics = topics.filter((topic) => topic.subjectId === plan.subjectId);
  const topic = subjectTopics.find((candidate) => candidate.id === plan.topicId);
  let prereq: AdaptivePrereqVerdict | null = null;
  let prereqQuestions: Question[] | undefined;
  if (topic) {
    const diagnosis = diagnosePrerequisiteWeakness({
      topicId: plan.topicId,
      topics: subjectTopics,
      attempts: store.attempts,
      mistakes: store.mistakes,
      mastery: store.mastery,
      cards: store.cards,
    });
    const verdict = diagnosis.verdict;
    if (verdict && verdict.kind !== "topic-itself") {
      const prereqTopic = subjectTopics.find((candidate) => candidate.id === verdict.prereqTopicId);
      if (prereqTopic) {
        prereq = {
          prereqTopicId: prereqTopic.id,
          prereqTopicTitle: prereqTopic.title,
          kind: verdict.kind,
        };
        prereqQuestions = store.questions.filter((question) => question.topicIds.includes(prereqTopic.id));
      }
    }
  }

  return replanAdaptiveSession({
    plan,
    completed,
    questions: topicQuestions,
    cards: topicCards,
    mistakes: topicMistakes,
    attempts: topicAttempts,
    prereqQuestions,
    prereq,
  });
}
