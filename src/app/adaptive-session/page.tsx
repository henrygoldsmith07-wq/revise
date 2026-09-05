"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { allTopics, getSubject, getTopic } from "@/domain/curriculum";
import {
  buildAdaptiveSession,
  type AdaptiveSessionPlan,
  type AdaptiveSessionStep,
} from "@/domain/adaptive-session";
import { buryCard } from "@/domain/scheduling";
import { useStore } from "@/state/store";
import { Button, ButtonLink, EmptyState, Panel, Pill, ProgressBar } from "@/components/ui";

/** A resumable runner for the single plan selected on Today. */
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
  const { clearRevisionCheckpoint, saveRevisionCheckpoint, updateCards } = store;
  const topics = useMemo(() => allTopics(store.settings.subjectIds), [store.settings.subjectIds]);

  // When a review/practice link returns to this route, hold the same topic
  // even if completing the step changed the ranking underneath it.
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
    checkpointTopicId,
    topics,
  ]);

  // Once the runner starts, keep the chosen ladder stable for its lifetime.
  // Review/practice completion changes the underlying evidence (and therefore
  // Today’s next plan), but it must not make the current step disappear or
  // reorder underneath a student who is returning to this same session.
  const [frozenPlan] = useState<AdaptiveSessionPlan | null>(() => computedPlan);
  const plan = frozenPlan ?? computedPlan;

  const checkpoint =
    store.revisionCheckpoint?.activity === "adaptive" &&
    (!requestedTopicId || store.revisionCheckpoint.href.includes(encodeURIComponent(requestedTopicId)))
      ? store.revisionCheckpoint
      : null;
  const requestedPosition = checkpoint?.position ?? (startRequested ? 0 : -1);
  // A persisted checkpoint can outlive a curriculum/evidence change that
  // shortens the regenerated ladder. Keep the student inside the current
  // plan rather than rendering an empty step and silently resetting it.
  const initialPosition =
    plan && requestedPosition >= 0
      ? Math.min(requestedPosition, Math.max(0, plan.steps.length - 1))
      : requestedPosition;
  const [stepIndex, setStepIndex] = useState(initialPosition);
  const [finished, setFinished] = useState(false);
  const [recallDraft, setRecallDraft] = useState("");
  const [recallRevealed, setRecallRevealed] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  const step = plan && stepIndex >= 0 ? plan.steps[stepIndex] : undefined;
  const subject = plan ? getSubject(plan.subjectId) : undefined;
  const topic = plan ? getTopic(plan.topicId) : undefined;
  const checkpointHref = plan
    ? `/adaptive-session?topic=${encodeURIComponent(plan.topicId)}&start=1&resume=1`
    : "/adaptive-session";

  useEffect(() => {
    if (!plan || !step || finished || stepIndex < 0) {
      if (resumeRequested && !plan) void clearRevisionCheckpoint();
      return;
    }
    void saveRevisionCheckpoint({
      activity: "adaptive",
      title: `${subject?.name ?? plan.subjectId} — ${plan.topicTitle}`,
      href: checkpointHref,
      topicId: plan.topicId,
      position: stepIndex,
      total: plan.steps.length,
      queueIds: plan.steps.map((candidate) => candidate.id),
    });
  }, [checkpointHref, clearRevisionCheckpoint, finished, plan, resumeRequested, saveRevisionCheckpoint, step, stepIndex, subject]);

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

  if (finished) {
    return <AdaptiveComplete plan={plan} />;
  }

  if (stepIndex < 0 || !step) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <ButtonLink href="/" variant="ghost" size="sm">← Today</ButtonLink>
        <header>
          <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Adaptive session</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink mt-1">
            Best use of the next {plan.totalMinutes} minutes
          </h1>
          <p className="text-lg text-ink mt-2">{subject?.name ?? plan.subjectId} — {plan.topicTitle}</p>
          <p className="text-sm text-ink3 mt-1">{plan.reason}</p>
        </header>

        <PlanOutline plan={plan} />

        <Button
          variant="primary"
          className="w-full min-h-[3rem] text-base"
          onClick={() => setStepIndex(0)}
        >
          Start session
        </Button>
      </div>
    );
  }

  const advance = () => {
    setRecallDraft("");
    setRecallRevealed(false);
    setScheduled(false);
    if (stepIndex >= plan.steps.length - 1) {
      void clearRevisionCheckpoint();
      setFinished(true);
    } else {
      setStepIndex((index) => index + 1);
    }
  };

  const needsRecallGate = step.kind === "explanation" || step.kind === "misconception-repair";
  const canAdvance = !needsRecallGate || recallRevealed;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink3 truncate">{subject?.name ?? plan.subjectId} · {plan.topicTitle}</p>
          <h1 className="text-sm font-semibold">Adaptive session</h1>
        </div>
        <ButtonLink href="/" size="sm" variant="ghost">Pause</ButtonLink>
      </div>

      <ProgressBar value={(stepIndex + 1) / plan.steps.length} label={`Step ${stepIndex + 1} of ${plan.steps.length}`} />

      <AdaptiveStepPanel
        step={step}
        plan={plan}
        topicSummary={topic?.summary}
        keyPoints={topic?.keyPoints ?? []}
        mistakes={store.mistakes}
        cards={store.cards}
        recallDraft={recallDraft}
        recallRevealed={recallRevealed}
        scheduled={scheduled}
        onRecallDraft={setRecallDraft}
        onRevealRecall={() => setRecallRevealed(true)}
        onSchedule={async () => {
          const selected = store.cards.filter((card) => step.cardIds.includes(card.id));
          if (selected.length) await updateCards(selected.map((card) => buryCard(card, 1)));
          setScheduled(true);
        }}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          disabled={stepIndex === 0}
          onClick={() => {
            setStepIndex((index) => Math.max(0, index - 1));
            setRecallDraft("");
            setRecallRevealed(false);
          }}
        >
          Back
        </Button>
        <Button variant="primary" disabled={!canAdvance || (step.kind === "delayed-retrieval" && !scheduled)} onClick={advance}>
          {stepIndex === plan.steps.length - 1 ? "Finish session" : "Next step"}
        </Button>
      </div>
    </div>
  );
}

function PlanOutline({ plan }: { plan: AdaptiveSessionPlan }) {
  return (
    <Panel>
      <ol className="space-y-2" aria-label="Adaptive learning sequence">
        {plan.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3 rounded-[8px] border border-line px-3 py-2.5">
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-ink3">{step.minutes}m</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{step.label}</p>
              <p className="text-xs text-ink3 mt-0.5">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function AdaptiveStepPanel({
  step,
  plan,
  topicSummary,
  keyPoints,
  mistakes,
  cards,
  recallDraft,
  recallRevealed,
  scheduled,
  onRecallDraft,
  onRevealRecall,
  onSchedule,
}: {
  step: AdaptiveSessionStep;
  plan: AdaptiveSessionPlan;
  topicSummary?: string;
  keyPoints: string[];
  mistakes: { id: string; topicId: string; description: string; point?: string; resolved: boolean }[];
  cards: { id: string; topicId: string }[];
  recallDraft: string;
  recallRevealed: boolean;
  scheduled: boolean;
  onRecallDraft: (value: string) => void;
  onRevealRecall: () => void;
  onSchedule: () => Promise<void>;
}) {
  const stepMistakes = mistakes.filter((mistake) => step.mistakeIds.includes(mistake.id));
  const cardCount = cards.filter((card) => step.cardIds.includes(card.id)).length;
  const questionId = step.questionIds[0];

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Pill tone="accent">{step.minutes} minutes</Pill>
          <h2 className="text-xl font-semibold text-ink mt-2">{step.label}</h2>
        </div>
        <span className="text-xs text-ink3 tabular-nums">{step.kind.replaceAll("-", " ")}</span>
      </div>

      <p className="text-sm text-ink2">{step.description}</p>

      {step.kind === "overdue-retrieval" ? (
        <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-3">
          <p className="text-sm font-semibold text-ink">{cardCount || step.cardIds.length} cards are ready.</p>
          <p className="text-xs text-ink2 mt-1">Open review, answer from memory, and grade honestly before moving on.</p>
          <ButtonLink href={step.href} variant="primary" size="sm" className="mt-3">Open retrieval</ButtonLink>
        </div>
      ) : null}

      {step.kind === "misconception-repair" ? (
        <div className="space-y-2">
          <div className="space-y-2 rounded-[8px] border border-line bg-surface2/60 px-3 py-3">
            <label className="block text-xs font-semibold text-ink2" htmlFor="adaptive-misconception-recall">
              Before opening the cards: what tempting wrong idea is this topic trying to repair?
            </label>
            <textarea
              id="adaptive-misconception-recall"
              value={recallDraft}
              onChange={(event) => onRecallDraft(event.target.value)}
              rows={3}
              className="field w-full text-sm"
              placeholder="Name the mistake and the corrected idea…"
            />
            {!recallRevealed ? (
              <Button variant="secondary" disabled={!recallDraft.trim()} onClick={onRevealRecall}>
                I&apos;ve named the gap
              </Button>
            ) : (
              <p className="text-xs text-success" role="status">Good — now compare it with the captured mistake below.</p>
            )}
          </div>
          {stepMistakes.map((mistake) => (
            <div key={mistake.id} className="rounded-[8px] border border-danger/30 bg-dangersoft/40 px-3 py-2.5">
              <p className="text-sm text-ink">{mistake.description}</p>
              {mistake.point ? <p className="text-xs text-ink3 mt-1">Missing point: {mistake.point}</p> : null}
            </div>
          ))}
          <ButtonLink href={step.href} variant="secondary" size="sm">Open mistake cards</ButtonLink>
        </div>
      ) : null}

      {step.kind === "explanation" ? (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-ink2" htmlFor="adaptive-recall">
            Before reading: explain {plan.topicTitle} in your own words.
          </label>
          <textarea
            id="adaptive-recall"
            value={recallDraft}
            onChange={(event) => onRecallDraft(event.target.value)}
            rows={4}
            className="field w-full text-sm"
            placeholder="Write the mechanism, condition, or consequence you remember…"
          />
          {!recallRevealed ? (
            <Button variant="primary" disabled={!recallDraft.trim()} onClick={onRevealRecall}>
              Reveal explanation
            </Button>
          ) : (
            <div className="rounded-[8px] border border-line bg-surface2 px-3 py-3">
              {topicSummary ? <p className="text-sm text-ink2">{topicSummary}</p> : null}
              {keyPoints.length ? (
                <ul className="mt-2 space-y-1 list-disc list-inside text-xs text-ink2">
                  {keyPoints.slice(0, 5).map((point) => <li key={point}>{point}</li>)}
                </ul>
              ) : null}
              <ButtonLink href={step.href} variant="secondary" size="sm" className="mt-3">Open full lesson</ButtonLink>
            </div>
          )}
        </div>
      ) : null}

      {step.kind === "supported-practice" || step.kind === "independent-application" || step.kind === "transfer" ? (
        <div className="rounded-[8px] border border-line bg-surface2 px-3 py-3">
          <p className="text-xs text-ink3">{questionId ? "The selected question is held for this rung of the ladder." : "Use the topic question bank for this rung."}</p>
          {questionId ? <p className="text-xs text-ink2 mt-1">Question {questionId}</p> : null}
          <ButtonLink href={step.href} variant="primary" size="sm" className="mt-3">Open question</ButtonLink>
        </div>
      ) : null}

      {step.kind === "delayed-retrieval" ? (
        <div className="rounded-[8px] border border-accent bg-accentsoft px-3 py-3">
          <p className="text-sm text-ink2">Tomorrow&apos;s short retrieval is part of today&apos;s learning, not an optional extra.</p>
          <Button
            variant={scheduled ? "secondary" : "primary"}
            size="sm"
            className="mt-3"
            onClick={() => void onSchedule()}
            disabled={scheduled}
          >
            {scheduled ? "Retrieval scheduled" : "Schedule for tomorrow"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

function AdaptiveComplete({ plan }: { plan: AdaptiveSessionPlan }) {
  const subject = getSubject(plan.subjectId);
  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div role="status" aria-live="polite">
        <p className="text-[11px] uppercase tracking-wide text-ink3 font-semibold">Session complete</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink mt-1">The gain is now tested.</h1>
        <p className="text-sm text-ink3 mt-1">{subject?.name ?? plan.subjectId} — {plan.topicTitle}</p>
      </div>
      <Panel className="space-y-3">
        <p className="text-sm text-ink2">You moved from retrieval through application and closed with a delayed check.</p>
        <ProgressBar value={1} label={`${plan.totalMinutes} minutes planned`} tone="success" />
      </Panel>
      <ButtonLink href="/" variant="primary" className="w-full">Back to Today</ButtonLink>
    </div>
  );
}
