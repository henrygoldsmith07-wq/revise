import { fitToBudget } from "./adaptive-budget";
import { capabilityState, type CapabilityProfile } from "./capability-mastery";

import { type LearningAction } from "./learning-action";
import { isTransferQuestion, questionContexts, questionFamilies, reasoningNoveltyFor } from "./learning-evidence";
import { questionExposureReport } from "./question-exposure";
import { capabilityCombination, combinationKey, isSynopticQuestion, synopticLearningValue } from "./synoptic-coverage";

import type { Attempt, Card, Id, Mistake, Question, Topic, InterventionAttemptContext } from "./types";

import { STEP_LABELS, type AdaptiveSessionStep, type AdaptiveStepKind } from "./adaptive-contract";
import type { AdaptiveTopicCandidate } from "./adaptive-scoring";

interface StepInput {
  topic: Topic;
  selected: AdaptiveTopicCandidate;
  cards: Card[];
  questions: Question[];
  attempts: Attempt[];
  mistakes: Mistake[];
  profile: CapabilityProfile;
  targetMinutes: number;
  /** True while this topic's readiness says the core loop may stop early. */
  stopTopicDone: boolean;
}

export function buildSteps(input: StepInput): AdaptiveSessionStep[] {
  const { topic, selected, cards, questions, attempts, mistakes, profile, targetMinutes, stopTopicDone } = input;
  const dueCardIds = selected.evidence.dueCardIds.slice(0, 3);
  const delayedCardIds = dueCardIds.length
    ? dueCardIds
    : cards
        .filter((card) => !card.suspended)
        .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id))
        .slice(0, 1)
        .map((card) => card.id);
  const mistakeIds = selected.evidence.openMistakeIds.slice(0, 3);
  const usedQuestions = new Set<Id>();
  const attemptedIds = new Set(attempts.map((attempt) => attempt.questionId));
  const questionById = new Map(questions.map((question) => [question.id, question] as const));
  // Family-aware freshness: a reskinned same-family question the student has
  // already met is familiar evidence, even under a new question id. Attempted
  // families are derived from the full attempt history (not just trusted
  // attempts) because familiarity does not depend on marking quality.
  const attemptedFamilies = new Set<string>();
  for (const attempt of attempts) {
    const prior = questionById.get(attempt.questionId);
    if (prior) for (const family of questionFamilies(prior)) attemptedFamilies.add(family);
  }
  // Overpractised questions (secure, repeatedly answered) are kept as a last
  // resort so the session does not burn minutes re-proving what is secure.
  const exposureByQuestion = new Map(questionExposureReport({ questions, attempts }).rows.map((row) => [row.questionId, row.status] as const));
  const isFreshFamily = (question: Question): boolean =>
    !questionFamilies(question).some((family) => attemptedFamilies.has(family));
  const orderedQuestions = questions.slice().sort((a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  // Reasoning novelty (0–1, 1 = no solution-path overlap with anything already
  // attempted) is memoised per question; familiarity does not depend on marking
  // quality, so the full attempt history is used, matching the family logic.
  const noveltyCache = new Map<Id, number>();
  const reasoningNovelty = (question: Question): number => {
    const cached = noveltyCache.get(question.id);
    if (cached !== undefined) return cached;
    const value = reasoningNoveltyFor(question, attempts, questions);
    noveltyCache.set(question.id, value);
    return value;
  };
  const rankByFreshness = (question: Question): number =>
    (isFreshFamily(question) ? 0 : 1) * 100 +
    Math.round((1 - reasoningNovelty(question)) * 90) +
    (exposureByQuestion.get(question.id) === "overpractised" ? 1 : 0);
  const pickQuestion = (predicate: (question: Question) => boolean): Question | undefined => {
    const candidates = orderedQuestions.filter(
      (question) => !usedQuestions.has(question.id) && !attemptedIds.has(question.id) && predicate(question),
    );
    const fresh = candidates.filter(isFreshFamily);
    const pool = fresh.length ? fresh : candidates;
    const found = pool.slice().sort((a, b) =>
      rankByFreshness(a) - rankByFreshness(b) || a.difficulty - b.difficulty || a.id.localeCompare(b.id))[0] ??
      orderedQuestions.find((question) => !usedQuestions.has(question.id) && predicate(question));
    if (found) {
      usedQuestions.add(found.id);
      for (const family of questionFamilies(found)) attemptedFamilies.add(family);
    }
    return found;
  };
  const supported = pickQuestion((question) => question.difficulty <= 2);
  const independent = pickQuestion((question) => question.difficulty >= 3 && question.difficulty <= 4);
  // Transfer must be a genuinely new family in a new context: the same idea
  // met in the supported/independent rungs does not test transfer, and a
  // reskinned familiar family would let memorised working pass as transfer
  // evidence. If no fresh family exists, do not label rehearsal as transfer.
  const practisedFamilies = new Set<string>([
    ...(supported ? questionFamilies(supported) : []),
    ...(independent ? questionFamilies(independent) : []),
  ]);
  const practisedContexts = new Set<string>([
    ...(supported ? questionContexts(supported) : []),
    ...(independent ? questionContexts(independent) : []),
  ]);
  // Encountered capability combinations, so a transfer step can prefer a
  // genuinely new pairing over a repeat of one already sat.
  const encounteredCombinations = new Set<string>();
  for (const attempt of attempts) {
    const prior = questionById.get(attempt.questionId);
    const combination = prior ? capabilityCombination(prior) : null;
    if (combination) encounteredCombinations.add(combinationKey(combination));
  }
  const practisedQuestions = questions.filter((question) => attemptedIds.has(question.id));
  const synopticTransferBonus = (question: Question): number =>
    isSynopticQuestion(question)
      ? synopticLearningValue(question, practisedQuestions, encounteredCombinations)
      : 0;
  const transferCandidates = (): Question | undefined => {
    const pool = orderedQuestions.filter((question) => {
      if (usedQuestions.has(question.id) || attemptedIds.has(question.id)) return false;
      if (!isTransferQuestion(question)) return false;
      const families = questionFamilies(question);
      const contexts = questionContexts(question);
      return !families.some((family) => practisedFamilies.has(family) || !isFreshFamily(question)) &&
        !contexts.some((context) => practisedContexts.has(context));
    });
    const found = pool.slice().sort((a, b) =>
      rankByFreshness(a) - rankByFreshness(b) ||
      // A question that combines previously-separate capabilities through
      // genuinely new reasoning is the higher-value transfer; a fresh costume
      // over one capability adds complexity without moving the needle.
      synopticTransferBonus(b) - synopticTransferBonus(a) ||
      a.difficulty - b.difficulty || a.id.localeCompare(b.id))[0];
    if (found) {
      usedQuestions.add(found.id);
      for (const family of questionFamilies(found)) attemptedFamilies.add(family);
    }
    return found;
  };
  const transfer = transferCandidates();

  const focusEvidence = profile[selected.evidence.focus];
  const needsExplanation =
    mistakes.length > 0 ||
    capabilityState(focusEvidence) === "unknown" ||
    (focusEvidence.score ?? 1) < 0.65;
  const steps: AdaptiveSessionStep[] = [];
  const add = (step: Omit<AdaptiveSessionStep, "minutes"> & { minutes: number }) => steps.push(step);
  const common = {
    topicId: topic.id,
    subjectId: topic.subjectId,
    cardIds: [] as Id[],
    questionIds: [] as Id[],
    mistakeIds: [] as Id[],
  };
  const priorState: InterventionAttemptContext["priorState"] =
    selected.evidence.focusState === "unknown" ? "unknown" :
      selected.evidence.focusState === "emerging" ? "weak" : selected.evidence.focusState;
  const focusCapabilityId: Id = selected.evidence.focus;
  const contextFor = (stepId: Id, kind: InterventionAttemptContext["kind"], activity: NonNullable<InterventionAttemptContext["activity"]>, plannedMinutes: number,
    support: InterventionAttemptContext["support"], capabilityId = focusCapabilityId, chainId = `${topic.id}:${capabilityId}`): InterventionAttemptContext => ({
      id: `${topic.id}:intervention:${stepId}`,
      chainId,
      kind,
      capabilityId,
      topicId: topic.id,
      priorState,
      plannedMinutes,
      support,
      activity,
    });
  const capabilityForQuestion = (question: Question): Id => {
    // Only a question whose parts all isolate the same single capability can
    // carry that capability's intervention chain. A mixed structured question
    // cannot locate its smallest failed skill, so it stays on the focus
    // capability rather than misattributing the attempt.
    const ids = [...new Set(question.parts.flatMap((part) => part.capabilityIds ?? []))];
    return ids.length === 1 ? ids[0]! : focusCapabilityId;
  };

  if (dueCardIds.length) {
    const count = dueCardIds.length;
    add({
      ...common,
      id: `${topic.id}:overdue-retrieval`,
      kind: "overdue-retrieval",
      minutes: 2,
      label: `${count} ${selected.evidence.overdueCount ? "overdue" : "due"} retrieval${count === 1 ? "" : "s"}`,
      description: "Recall the answer before you reveal it; FSRS grades decide what returns next.",
      href: reviewHref(topic.id, `limit=${dueCardIds.length}`),
      cardIds: dueCardIds,
      why: `${count} card${count === 1 ? " is" : "s are"} due — recall first so today's work builds on what is actually there.`,
      intervention: contextFor(`${topic.id}:overdue-retrieval`, "retention", "retrieval", 2, "none"),
    });
  }

  if (mistakeIds.length) {
    add({
      ...common,
      id: `${topic.id}:misconception-repair`,
      kind: "misconception-repair",
      minutes: 2,
      label: "Repair the misconception",
      description: "Name the tempting wrong idea, then replace it with the examiner-safe explanation.",
      href: reviewHref(topic.id, `mode=mistakes&limit=${mistakeIds.length}`),
      mistakeIds,
      why: `${mistakeIds.length} open misconception${mistakeIds.length === 1 ? "" : "s"} — the same lost mark returns unless the wrong idea is replaced.`,
      intervention: contextFor(`${topic.id}:misconception-repair`, "guided", "teaching", 2, "scaffold"),
    });
  }

  if (needsExplanation) {
    add({
      ...common,
      id: `${topic.id}:explanation`,
      kind: "explanation",
      minutes: 2,
      label: "Explain the gap",
      description: "Write what you remember first, then open the short step-by-step explanation.",
      href: `/lesson?subject=${encodeURIComponent(topic.subjectId)}&topic=${encodeURIComponent(topic.id)}&from=adaptive&return=${encodeURIComponent(`/adaptive-session?topic=${encodeURIComponent(topic.id)}&start=1&resume=1`)}`,
      why: `Your ${selected.evidence.focus} evidence is ${selected.evidence.focusState} — teaching lands on the gap instead of a page of prose.`,
      intervention: contextFor(`${topic.id}:explanation`, "guided", "teaching", 2, "scaffold"),
    });
  }

  if (supported) {
    add({
      ...common,
      id: `${topic.id}:supported-practice`,
      kind: "supported-practice",
      minutes: 4,
      label: "Supported question",
      description: "Use one prompt or hint if needed; the support fades before the next block.",
      href: practiceHref(topic.id, supported.id, "supported"),
      questionIds: [supported.id],
      why: "Scaffolded attempt first — support that counts as weaker evidence, then fades.",
      params: { support: "supported", hintBudget: 3 },
      intervention: contextFor(`${topic.id}:supported-practice:${supported.id}`, "guided", "question", 4, "scaffold", capabilityForQuestion(supported)),
    });
  }

  if (independent && !stopTopicDone) {
    add({
      ...common,
      id: `${topic.id}:independent-application`,
      kind: "independent-application",
      minutes: 4,
      label: "Independent application",
      description: "Answer without notes or hints. This is the evidence rung, not a practice preview.",
      href: practiceHref(topic.id, independent.id, "independent"),
      questionIds: [independent.id],
      why: "Unaided success is the only proof that counts — this rung carries full evidence weight.",
      params: { support: "independent", hintBudget: 0 },
      intervention: contextFor(`${topic.id}:independent-application:${independent.id}`, "independent", "question", 4, "none", capabilityForQuestion(independent)),
    });
  }

  if (transfer && !stopTopicDone) {
    add({
      ...common,
      id: `${topic.id}:transfer`,
      kind: "transfer",
      minutes: 4,
      label: "Unfamiliar transfer",
      description: "Apply the same idea in a new context, closer to what an exam will ask.",
      href: practiceHref(topic.id, transfer.id, "transfer"),
      questionIds: [transfer.id],
      why: "Same idea, new clothing — transfer is what the exam actually tests.",
      params: { support: "independent", hintBudget: 0 },
      intervention: contextFor(`${topic.id}:transfer:${transfer.id}`, "transfer", "question", 4, "none", capabilityForQuestion(transfer)),
    });
  }

  // A delayed check is structural, not a suggestion. The runner uses the
  // existing one-day bury/sync path to make a due card reappear tomorrow.
  add({
    ...common,
    id: `${topic.id}:delayed-retrieval`,
    kind: "delayed-retrieval",
    minutes: 2,
    label: "Schedule delayed retrieval",
    description: "Queue one short check for tomorrow so today's gain has to survive a delay.",
    href: reviewHref(topic.id, `limit=1`),
    cardIds: delayedCardIds,
    why: "Today's gain only counts if it survives a delay — this check proves it.",
    intervention: contextFor(`${topic.id}:delayed-retrieval`, "retention", "retrieval", 2, "none"),
  });

  fitToBudget(steps, targetMinutes);
  return steps;
}

export function practiceHref(topicId: Id, questionId: Id, step: string): string {
  const back = `/adaptive-session?topic=${encodeURIComponent(topicId)}&start=1&resume=1`;
  return `/practice?topic=${encodeURIComponent(topicId)}&question=${encodeURIComponent(questionId)}&adaptiveStep=${step}&from=adaptive&return=${encodeURIComponent(back)}`;
}

export function reviewHref(topicId: Id, extra: string): string {
  const back = `/adaptive-session?topic=${encodeURIComponent(topicId)}&start=1&resume=1`;
  return `/review?topic=${encodeURIComponent(topicId)}&${extra}&from=adaptive&return=${encodeURIComponent(back)}`;
}

export function reasonFor(candidate: AdaptiveTopicCandidate, topicTitle: string): string {
  const { evidence } = candidate;
  const reasons: string[] = [];
  if (evidence.overdueCount) reasons.push(`${evidence.overdueCount} overdue retrieval${evidence.overdueCount === 1 ? "" : "s"}`);
  else if (evidence.dueCount) reasons.push(`${evidence.dueCount} FSRS retrieval${evidence.dueCount === 1 ? "" : "s"} due`);
  if (evidence.openMistakes) reasons.push(`${evidence.openMistakes} open misconception${evidence.openMistakes === 1 ? "" : "s"}`);
  if (evidence.mastery < 0.55) reasons.push(`${Math.round(evidence.mastery * 100)}% proven mastery`);
  if (evidence.daysToExam != null && evidence.daysToExam <= 30) reasons.push(`exam in ${Math.max(0, evidence.daysToExam)} days`);
  if (evidence.focusState === "unknown") reasons.push(`first ${evidence.focus} evidence`);
  if (!reasons.length) reasons.push("the best balance of recall, application and exam readiness");
  return `${topicTitle}: ${reasons.slice(0, 3).join(" · ")}.`;
}

export function learningActionStep(action: LearningAction, topicId: Id, subjectId: Id, seq: number): AdaptiveSessionStep {
  const questionTopicId = action.topicId ?? topicId;
  const kind: AdaptiveStepKind = action.kind === "guided" ? "misconception-repair" :
    action.kind === "transfer" ? "transfer" : "independent-application";
  const intervention: InterventionAttemptContext = {
    id: `${topicId}:intervention:${seq}:${action.question.id}`,
    ...(action.mistakeId ? { chainId: action.mistakeId } : { chainId: `${topicId}:${action.capabilityId}` }),
    kind: action.kind,
    capabilityId: action.capabilityId,
    topicId: questionTopicId,
    priorState: action.priorState,
    ...(action.priorAccuracy !== undefined ? { priorAccuracy: action.priorAccuracy } : {}),
    plannedMinutes: action.minutes,
    support: action.teaching ? "scaffold" : "none",
    activity: "question",
  };
  return {
    id: `${topicId}:skill:${seq}:${action.question.id}`, kind,
    label: action.kind === "diagnose" ? "Check the smallest gap" : action.kind === "retention" ? "Check what stayed with you" : STEP_LABELS[kind],
    description: action.reason, why: action.reason, minutes: action.minutes,
    topicId: questionTopicId, subjectId, questionIds: [action.question.id], cardIds: [],
    mistakeIds: action.mistakeId && action.kind !== "diagnose" ? [action.mistakeId] : [],
    capabilityId: action.capabilityId, teaching: action.teaching,
    intervention,
    href: practiceHref(questionTopicId, action.question.id, kind),
    params: { support: action.teaching ? "supported" : "independent", hintBudget: action.teaching ? 3 : 0 },
  };
}
