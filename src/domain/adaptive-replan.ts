import { localDayOfInstant } from "./local-date";
import { ADAPTIVE_MAX_QUESTION_ATTEMPTS, ADAPTIVE_MAX_REPAIR_ATTEMPTS, ADAPTIVE_MAX_RETRIEVAL_FAILS, ADAPTIVE_PASS_RATIO, REBUILT_STEP_MINUTES, assertBudgetNotExceeded, QUESTION_STEP_KINDS, remainingMinutes, spentMinutes } from "./adaptive-budget";

import { selectLearningAction } from "./learning-action";
import { isTransferQuestion, questionFamilies } from "./learning-evidence";

import type { HintTier } from "./hints";

import type { Id, Question, RecallGrade, InterventionAttemptContext } from "./types";

import { STEP_LABELS, DONE_REASON_BUDGET, DONE_REASON_EVIDENCE, DONE_REASON_CAPPED, type AdaptiveReplanInput, type AdaptiveReplan, type AdaptiveStepResult, type AdaptiveStepKind, type AdaptiveSessionPlan, type AdaptiveSessionStep } from "./adaptive-contract";
import { buildMistakePatterns } from "./mistake-patterns";
import { learningActionStep, practiceHref } from "./adaptive-sequence";
import { trustedAdaptiveEvidence } from "./adaptive-scoring";

/**
 * Classify one question-rung execution from its marks and support use.
 * Even the smallest hint demotes an otherwise-full success to assisted
 * evidence: only a hint-free pass can be independent proof.
 */
export function resultFromQuestionAttempt(input: {
  awarded: number;
  max: number;
  hintTier: HintTier | null;
  /** A copied model answer is a successful mark, never independent evidence. */
  copiedAnswer?: boolean;
  gaveUp?: boolean;
}): AdaptiveStepResult {
  if (input.gaveUp) return "gave-up";
  const ratio = input.max > 0 ? input.awarded / input.max : 0;
  if (ratio < ADAPTIVE_PASS_RATIO) return "missed";
  return input.hintTier === null && !input.copiedAnswer ? "passed-independent" : "passed-assisted";
}

/** Classify one card-retrieval pass from the grades the student gave. */
export function resultFromRetrievalGrades(grades: RecallGrade[]): AdaptiveStepResult {
  return grades.some((grade) => grade === "again") ? "missed" : "passed-independent";
}

function difficultyNumber(question: Question): number {
  return typeof question.difficulty === "number" && Number.isFinite(question.difficulty)
    ? question.difficulty
    : 3;
}

function inBand(question: Question, band: "supported" | "independent" | "transfer"): boolean {
  const difficulty = difficultyNumber(question);
  if (band === "supported") return difficulty <= 2;
  if (band === "independent") return difficulty >= 3 && difficulty <= 4;
  return isTransferQuestion(question);
}

function baseStep(plan: AdaptiveSessionPlan, kind: AdaptiveStepKind, seq: number): AdaptiveSessionStep {
  const id = `${plan.topicId}:${kind}${seq > 0 ? `-${seq}` : ""}`;
  return {
    id,
    kind,
    minutes: REBUILT_STEP_MINUTES[kind],
    label: STEP_LABELS[kind],
    description: "",
    href: practiceHref(plan.topicId, "", kind),
    topicId: plan.topicId,
    subjectId: plan.subjectId,
    cardIds: [],
    questionIds: [],
    mistakeIds: [],
  };
}

/**
 * Re-derive the rest of a session from what has actually happened.
 * Called after every meaningful step; the caller replaces its remaining
 * queue with the returned steps (never mutating completed history).
 */
export function replanAdaptiveSession(input: AdaptiveReplanInput): AdaptiveReplan {
  const nodes = input.capabilityNodes ?? [];
  const { plan, completed, questions, cards, mistakes, attempts, prereq, prereqQuestions } = input;

  if (plan.learningPolicy === "capability-evidence-v1") {
    const spent = spentMinutes(completed);
    const remaining = remainingMinutes(plan.targetMinutes, spent);
    const count = completed.filter((r) => QUESTION_STEP_KINDS.has(r.kind)).length;
    const scheduled = completed.some((r) => r.kind === "delayed-retrieval" && r.result === "scheduled");
    const trusted = trustedAdaptiveEvidence({ attempts, mistakes, questions });
    const action = count < ADAPTIVE_MAX_QUESTION_ATTEMPTS && !scheduled ? selectLearningAction({
      topicId: plan.topicId, nodes: nodes, questions, attempts, mistakes,
      now: input.now ?? new Date(), remainingMinutes: remaining, interventionOutcomes: input.interventionOutcomes,
    }) : undefined;
    if (action) {
      const next = [learningActionStep(action, plan.topicId, plan.subjectId, completed.length + 1)];
      assertBudgetNotExceeded(next, remaining, `replanAdaptiveSession:capability:${plan.topicId}`);
      return { steps: next, done: false, stopped: false, reason: action.reason };
    }
    const delayed = plan.steps.find((s) => s.kind === "delayed-retrieval");
    const delayedStep = !scheduled && delayed && remaining > 0 ? { ...delayed, minutes: Math.min(1, remaining) } : undefined;
    // Draft/auto-marked Physics mistakes may remain in storage for practice,
    // but they cannot make the session claim that transfer has been shown.
    const waiting = trusted.mistakes.find((m) => !m.resolved && m.repair?.stage === "transfer" && m.repair.dueAt);
    const reason = count >= ADAPTIVE_MAX_QUESTION_ATTEMPTS ? DONE_REASON_CAPPED : waiting?.repair?.dueAt
      ? `Transfer is demonstrated. The repair stays open until an independent check after ${localDayOfInstant(waiting.repair.dueAt)}.`
      : "No further fresh mapped check fits this session. Remaining skills stay unproven; more targeted content or a later check is needed.";
    return { steps: delayedStep ? [delayedStep] : [],
      done: scheduled || !delayed || remaining <= 0, stopped: true, reason };
  }

  const spent = spentMinutes(completed);
  const remaining = remainingMinutes(plan.targetMinutes, spent);
  const executed = new Set(completed.map((record) => record.stepId));
  // Steps of the original ladder that have not run yet (original order).
  const tail = plan.steps.filter((step) => !executed.has(step.id));

  const questionRecords = completed.filter((record) => QUESTION_STEP_KINDS.has(record.kind));
  const retrievalRecords = completed.filter((record) => record.kind === "overdue-retrieval");
  const repairRecords = completed.filter((record) => record.kind === "misconception-repair");
  const prereqRecords = completed.filter((record) => record.kind === "prerequisite-repair");
  const explanations = completed.filter((record) => record.kind === "explanation");
  const supportedPassedIndependent = completed.some(
    (record) => record.kind === "supported-practice" && record.result === "passed-independent",
  );
  const independentPassedIndependent = completed.some(
    (record) => record.kind === "independent-application" && record.result === "passed-independent",
  );
  const transferPassedIndependent = completed.some(
    (record) => record.kind === "transfer" && record.result === "passed-independent",
  );
  const scheduled = completed.some((record) => record.kind === "delayed-retrieval" && record.result === "scheduled");
  const lastRetrieval = retrievalRecords.at(-1);
  const availableCardIds = new Set(
    cards
      .filter((card) => !card.suspended)
      .map((card) => card.id),
  );

  // Question pools: fresh = never attempted anywhere, with unseen families
  // preferred so a reskinned familiar question cannot stand in for new
  // learning; retryable = missed here. Familiarity is family-based, not
  // id-based, because a renamed variant is still familiar evidence.
  const ordered = [...questions].sort(
    (a, b) => difficultyNumber(a) - difficultyNumber(b) || a.id.localeCompare(b.id),
  );
  const questionById = new Map(questions.map((question) => [question.id, question] as const));
  const attemptedFamilies = new Set<string>();
  for (const attempt of attempts) {
    const prior = questionById.get(attempt.questionId);
    if (prior) for (const family of questionFamilies(prior)) attemptedFamilies.add(family);
  }
  for (const record of completed) {
    if (!record.itemId) continue;
    const prior = questionById.get(record.itemId);
    if (prior) for (const family of questionFamilies(prior)) attemptedFamilies.add(family);
  }
  const isFreshFamily = (question: Question): boolean =>
    !questionFamilies(question).some((family) => attemptedFamilies.has(family));
  const usedThisRun = new Set(
    completed
      .map((record) => record.itemId)
      .filter((id): id is Id => Boolean(id)),
  );
  const attemptedEver = new Set(attempts.map((attempt) => attempt.questionId));
  const fresh = ordered.filter((question) => !usedThisRun.has(question.id) && !attemptedEver.has(question.id));
  const missedIds = new Set(
    completed
      .filter((record) => record.result === "missed" || record.result === "gave-up")
      .map((record) => record.itemId)
      .filter((id): id is Id => Boolean(id)),
  );
  const retryPool = ordered.filter((question) => missedIds.has(question.id));

  const pickQuestion = (
    band: "supported" | "independent" | "transfer",
    prefer: "fresh" | "retry" | "any" = "fresh",
  ): Question | undefined => {
    if (prefer !== "retry") {
      const inBandFresh = fresh.filter((question) => inBand(question, band));
      const freshFamily = inBandFresh.find(isFreshFamily);
      if (freshFamily) return freshFamily;
      const fromFresh = inBandFresh[0] ?? (prefer === "any" ? fresh.find(isFreshFamily) ?? fresh[0] : undefined);
      if (fromFresh) return fromFresh;
    }
    if (band === "transfer") return undefined;
    const fromRetry = retryPool.find((question) => inBand(question, band)) ?? (prefer === "any" ? retryPool[0] : undefined);
    return fromRetry;
  };

  const openMistakes = mistakes.filter((mistake) => !mistake.resolved);
  const resolvedIds = new Set(
    completed
      .map((record) => record.resolvedMistakeId)
      .filter((id): id is Id => Boolean(id)),
  );
  // Mistakes still open that this run has not already repaired (by retest).
  // Ordered like the canonical mistake queue (marks lost, then recency) so
  // repair targets the highest-value misconception first, not input order.
  const openWithoutRepair = openMistakes
    .filter((mistake) => !resolvedIds.has(mistake.id))
    .sort((a, b) => (b.marksLost - a.marksLost) || b.createdAt.localeCompare(a.createdAt));

  const steps: AdaptiveSessionStep[] = [];
  const priorState: InterventionAttemptContext["priorState"] =
    plan.evidence.focusState === "unknown" ? "unknown" :
      plan.evidence.focusState === "emerging" ? "weak" : plan.evidence.focusState;
  const defaultCapabilityId: Id = plan.evidence.focus;
  const defaultIntervention = (stepId: Id, kind: InterventionAttemptContext["kind"], activity: NonNullable<InterventionAttemptContext["activity"]>, plannedMinutes: number,
    support: InterventionAttemptContext["support"], capabilityId = defaultCapabilityId, chainId = `${plan.topicId}:${capabilityId}`, topicId = plan.topicId): InterventionAttemptContext => ({
      id: `${plan.topicId}:intervention:${stepId}`,
      chainId,
      kind,
      capabilityId,
      topicId,
      priorState,
      plannedMinutes,
      support,
      activity,
    });
  const pushStep = (kind: AdaptiveStepKind, seq: number, partial: Partial<AdaptiveSessionStep> = {}) => {
    const step = { ...baseStep(plan, kind, seq), ...partial, minutes: REBUILT_STEP_MINUTES[kind] };
    if (!step.intervention) {
      const activity = kind === "overdue-retrieval" || kind === "delayed-retrieval" ? "retrieval" : "teaching";
      const interventionKind = activity === "retrieval" ? "retention" : "guided";
      step.intervention = defaultIntervention(step.id, interventionKind, activity, step.minutes, activity === "teaching" ? "scaffold" : "none");
    }
    steps.push(step);
  };
  const pushQuestionStep = (
    kind: AdaptiveStepKind,
    seq: number,
    question: Question | undefined,
    opts: { support: "supported" | "independent"; hintBudget: number; mistakeId?: Id },
  ): boolean => {
    if (!question) return false;
    const partial: Partial<AdaptiveSessionStep> = {
      questionIds: [question.id],
      params: { support: opts.support, hintBudget: opts.hintBudget },
      href: practiceHref(plan.topicId, question.id, kind),
      intervention: defaultIntervention(
        `${kind}:${seq}:${question.id}`,
        kind === "transfer" ? "transfer" : kind === "prerequisite-repair" ? "diagnose" : opts.support === "supported" ? "guided" : "independent",
        "question",
        REBUILT_STEP_MINUTES[kind],
        opts.support === "supported" ? "scaffold" : "none",
        question.parts.flatMap((part) => part.capabilityIds ?? [])[0] ?? defaultCapabilityId,
        opts.mistakeId ?? `${plan.topicId}:${question.parts.flatMap((part) => part.capabilityIds ?? [])[0] ?? defaultCapabilityId}`,
      ),
    };
    if (kind === "misconception-repair" && opts.mistakeId) partial.mistakeIds = [opts.mistakeId];
    pushStep(kind, seq, partial);
    return true;
  };

  let reason = "";
  let stopped = false;

  // --- A. Retrieval: retry missed cards once; teach instead of retrying twice.
  if (lastRetrieval && lastRetrieval.result === "missed") {
    const fails = retrievalRecords.length;
    const stillMissed = (lastRetrieval.missedItemIds ?? []).filter((id) => availableCardIds.has(id));
    if (fails < ADAPTIVE_MAX_RETRIEVAL_FAILS && stillMissed.length) {
      // Failed recall → retrieval cue → immediate retry of exactly those cards.
      pushStep("overdue-retrieval", fails, {
        cardIds: stillMissed,
        label: "Retry the missed retrieval",
        description: "The cards you missed come back now, while the attempt is fresh.",
        href: `/review?topic=${encodeURIComponent(plan.topicId)}&limit=${stillMissed.length}&from=adaptive`,
      });
      reason =
        "A retrieval came back as a miss — the same cards are retried once while the attempt is fresh, before anything new.";
    } else if (fails >= ADAPTIVE_MAX_RETRIEVAL_FAILS && explanations.length === 0) {
      // Repeated recall failure: stop cycling the card, teach the gap first.
      pushStep("explanation", explanations.length + 1, {
        description: "Recall failed twice — read the short explanation, then apply it with support.",
        href: `/lesson?subject=${encodeURIComponent(plan.subjectId)}&topic=${encodeURIComponent(plan.topicId)}&from=adaptive`,
      });
      const supported = pickQuestion("supported", "any");
      if (supported) {
        pushQuestionStep("supported-practice", questionRecords.length + 1, supported, {
          support: "supported",
          hintBudget: 3,
        });
      }
      reason = "The same card failed twice — more retrieval would just cycle it. Teaching, then one supported attempt, replaces the retry.";
    }
  }

  // --- B. A fresh question miss with an open mistake ⇒ misconception repair.
  const lastQuestion = questionRecords.at(-1);
  const lastMissedOrGaveUp =
    lastQuestion && (lastQuestion.result === "missed" || lastQuestion.result === "gave-up");
  if (
    lastMissedOrGaveUp &&
    lastQuestion?.kind !== "misconception-repair" &&
    lastQuestion?.kind !== "prerequisite-repair" &&
    openWithoutRepair.length > 0 &&
    repairRecords.length < ADAPTIVE_MAX_REPAIR_ATTEMPTS &&
    !steps.some((step) => step.kind === "misconception-repair") &&
    !tail.some((step) => step.kind === "misconception-repair")
  ) {
    // Repair targets the mistake with a source question when one exists — the
    // retest is an independent re-answer, which is the only thing that can
    // resolve it. Otherwise it runs as a supported re-application that re-tests
    // the same idea in a new attempt; contrast copy still precedes it.
    const target = openWithoutRepair[0];
    // Recurring technique errors (units, working, linking, command words) are not
    // fixed by re-teaching content: practise the technique on a different question.
    const technique = buildMistakePatterns({ mistakes: openWithoutRepair, attempts, questions })
      .find((row) => row.recurring && row.intervention === "technique-intervention" && target && row.mistakeIds.includes(target.id));
    const techniqueQuestion = technique ? pickQuestion("independent", "fresh") ?? pickQuestion("supported", "fresh") : undefined;
    if (technique && techniqueQuestion) {
      pushQuestionStep("misconception-repair", repairRecords.length + 1, techniqueQuestion, { support: "independent", hintBudget: 0 });
      const step = steps.at(-1);
      if (step) {
        step.focus = "technique";
        step.label = "Fix the exam technique";
        step.description = technique.headline;
        step.why = "The same technique error keeps costing marks across questions. Re-teaching the content would not fix it; a different question will test whether it has.";
      }
      reason = "The same technique error has recurred — practise it on a different question instead of re-teaching the content.";
    } else {
      const sourceQuestion = target?.questionId
        ? ordered.find((candidate) => candidate.id === target.questionId)
        : undefined;
      const question = sourceQuestion ?? pickQuestion("supported", "retry");
      const canResolve = Boolean(sourceQuestion);
      pushQuestionStep("misconception-repair", repairRecords.length + 1, question, {
        support: "independent",
        hintBudget: 0,
        ...(canResolve && target ? { mistakeId: target.id } : {}),
      });
      reason = "A dropped mark exposed a misconception — contrast it and re-earn the point independently before anything new.";
    }
  }

  // --- C. Repeated failure on this topic ⇒ short prerequisite detour.
  const topicQuestionMisses = questionRecords.filter(
    (record) =>
      (record.kind === "supported-practice" ||
        record.kind === "independent-application" ||
        record.kind === "transfer") &&
      (record.result === "missed" || record.result === "gave-up"),
  ).length;
  if (
    topicQuestionMisses >= 2 &&
    prereq &&
    prereqRecords.length === 0 &&
    (prereqQuestions?.length ?? 0) > 0 &&
    !steps.some((step) => step.kind === "prerequisite-repair")
  ) {
    const prereqOrdered = [...(prereqQuestions ?? [])].sort(
      (a, b) => difficultyNumber(a) - difficultyNumber(b) || a.id.localeCompare(b.id),
    );
    const prereqQuestion =
      prereqOrdered.find((question) => inBand(question, "supported")) ?? prereqOrdered[0];
    if (prereqQuestion) {
      const prereqCapabilityId = prereqQuestion.parts.flatMap((part) => part.capabilityIds ?? [])[0] ?? defaultCapabilityId;
      steps.push({
        ...baseStep(plan, "prerequisite-repair", prereqRecords.length + 1),
        topicId: prereq.prereqTopicId,
        label: `Fix ${prereq.prereqTopicTitle} first`,
        description:
          "This topic keeps breaking because an earlier skill is not secure. One short question on the foundation, then back here.",
        questionIds: [prereqQuestion.id],
        params: { support: "supported", hintBudget: 2 },
        href: practiceHref(prereq.prereqTopicId, prereqQuestion.id, "prerequisite-repair"),
        intervention: defaultIntervention(
          `prerequisite-repair:${prereqRecords.length + 1}:${prereqQuestion.id}`,
          "diagnose",
          "question",
          REBUILT_STEP_MINUTES["prerequisite-repair"],
          "scaffold",
          prereqCapabilityId,
          `${prereq.prereqTopicId}:${prereqCapabilityId}`,
          prereq.prereqTopicId,
        ),
      });
      reason = "Two misses on the same topic point upstream — a two-minute foundation check replaces another similar question here.";
    }
  }

  // --- D. Independent-application failure ⇒ raise support before transfer.
  const lastIndependent = [...completed]
    .reverse()
    .find((record) => record.kind === "independent-application");
  if (
    lastIndependent &&
    (lastIndependent.result === "missed" || lastIndependent.result === "gave-up") &&
    !independentPassedIndependent &&
    !steps.some((step) => step.kind === "supported-practice" || step.kind === "misconception-repair") &&
    !tail.some((step) => step.kind === "supported-practice")
  ) {
    // Increase support: a supported attempt (fresh or the missed question) then
    // the independent rung is owed again — assisted success is not enough.
    const supported = pickQuestion("supported", "any");
    if (supported) {
      pushQuestionStep("supported-practice", questionRecords.length + 2, supported, {
        support: "supported",
        hintBudget: 3,
      });
      const independent = pickQuestion("independent", "fresh");
      if (independent) {
        pushQuestionStep("independent-application", questionRecords.length + 3, independent, {
          support: "independent",
          hintBudget: 0,
        });
      }
      reason = "Independent application missed — support returns for one attempt, then the independent rung is owed again.";
    }
  }

  // --- E. Independent success removes unnecessary teaching/support.
  const explanationInTail = tail.findIndex((step) => step.kind === "explanation");
  if (
    explanationInTail >= 0 &&
    !explanations.length &&
    (supportedPassedIndependent || independentPassedIndependent) &&
    !steps.some((step) => step.kind === "explanation")
  ) {
    tail.splice(explanationInTail, 1);
    reason = reason || "Independent success already proves the gap is closed — the planned teaching step is skipped.";
  }

  // --- F. Keep the remaining original rungs, in order.
  steps.push(...tail);

  // --- G. Drop rungs whose evidence is already satisfied.
  const satisfiedTransfer = steps.findIndex((step) => step.kind === "transfer");
  if (transferPassedIndependent && satisfiedTransfer >= 0) {
    steps.splice(satisfiedTransfer, 1);
  }

  // --- H. Attempt cap: never drill the SAME topic more than MAX times. Repair
  // and the single prerequisite detour are bounded by their own rules, so they
  // survive the cap — the cap exists to stop same-topic rung loops.
  const TOPIC_RUNGS: ReadonlySet<AdaptiveStepKind> = new Set([
    "supported-practice",
    "independent-application",
    "transfer",
  ]);
  const executedTopicAttempts = questionRecords.filter((record) => TOPIC_RUNGS.has(record.kind)).length;
  const plannedTopicRungs = steps.filter((step) => TOPIC_RUNGS.has(step.kind)).length;
  if (executedTopicAttempts + plannedTopicRungs > ADAPTIVE_MAX_QUESTION_ATTEMPTS && executedTopicAttempts > 0) {
    const kept: AdaptiveSessionStep[] = [];
    for (const step of steps) {
      if (!TOPIC_RUNGS.has(step.kind)) kept.push(step);
    }
    steps.splice(0, steps.length, ...kept);
    stopped = true;
    reason = reason || DONE_REASON_CAPPED;
  }

  // --- I. Delayed retrieval is structural: always the final rung once.
  if (!scheduled && !steps.some((step) => step.kind === "delayed-retrieval")) {
    const delayedCardIds = (plan.steps.at(-1)?.cardIds ?? []).slice(0, 1);
    steps.push({
      ...baseStep(plan, "delayed-retrieval", scheduled ? 1 : 0),
      cardIds: delayedCardIds,
      label: "Schedule delayed retrieval",
      description: "Queue one short check for tomorrow so today's gain has to survive a delay.",
      href: `/review?topic=${encodeURIComponent(plan.topicId)}&limit=1&from=adaptive`,
    });
  }

  // --- J. Fit the remaining time budget. Delayed retrieval is structural:
  // it survives even when every budgeted minute is already spent, shrunk to
  // whatever remains (a 0-minute schedule-later action when nothing does).
  const trimmed: AdaptiveSessionStep[] = [];
  let allotted = 0;
  for (const step of steps) {
    const isDelayed = step.kind === "delayed-retrieval";
    if (isDelayed && scheduled) continue; // already done; nothing left
    if (!isDelayed && remaining <= 0) continue; // a rung cannot start with no time
    const stepMinutes = isDelayed ? Math.max(0, Math.min(1, remaining - allotted)) : step.minutes;
    if (!isDelayed && allotted + stepMinutes > remaining) continue;
    // Store the capped minutes, not the original: what the runner displays
    // and records must equal what the budget accounted for.
    trimmed.push(isDelayed ? { ...step, minutes: stepMinutes } : step);
    allotted += stepMinutes;
  }
  // A structural final step that reports "schedule later" still closes the
  // loop even when every budgeted minute is gone (kept at whatever remains,
  // possibly zero — the scheduling action itself costs no study time).
  if (!scheduled) {
    const delayed = steps.find((step) => step.kind === "delayed-retrieval");
    if (delayed && !trimmed.some((step) => step.kind === "delayed-retrieval")) {
      const fallbackMinutes = Math.max(0, Math.min(delayed.minutes, remaining - allotted));
      trimmed.push(delayed.intervention ? { ...delayed, minutes: fallbackMinutes } : {
        ...delayed,
        minutes: fallbackMinutes,
        intervention: defaultIntervention(
          `${delayed.id}:schedule`,
          "retention",
          "retrieval",
          fallbackMinutes,
          "none",
        ),
      });
    }
  }
  assertBudgetNotExceeded(trimmed, remaining, `replanAdaptiveSession:${plan.topicId}`);

  const evidenceSatisfied =
    independentPassedIndependent &&
    (transferPassedIndependent || !ordered.some((question) => inBand(question, "transfer")));
  const hasUndoneRungs = trimmed.some((step) => step.kind !== "delayed-retrieval");
  const done = trimmed.length === 0 || (!hasUndoneRungs && scheduled);

  if (!reason && trimmed.length) {
    const nextKind = trimmed[0].kind;
    reason =
      nextKind === "delayed-retrieval"
        ? "The evidence rungs are done — the only step left is to queue the delayed check."
        : nextKind === "explanation"
          ? "The next rung needs the short explanation first."
          : nextKind === "supported-practice"
            ? "The next attempt runs with support available — the minimum that gets you there."
            : nextKind === "independent-application"
              ? "Support has done its job — the next rung is answered alone."
              : nextKind === "transfer"
                ? "The idea held on familiar ground — now the same idea in a new context."
                : nextKind === "misconception-repair"
                  ? "Repair comes before new material: re-earn the dropped point first."
                  : "Keep the sequence moving — one clear action at a time.";
  }
  if (done && !reason) {
    reason = evidenceSatisfied ? DONE_REASON_EVIDENCE : scheduled ? DONE_REASON_BUDGET : DONE_REASON_CAPPED;
  }

  return { steps: trimmed, done, reason, stopped };
}
