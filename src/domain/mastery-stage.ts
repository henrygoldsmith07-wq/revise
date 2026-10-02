// ---------------------------------------------------------------------------
// Mastery stage — a student-facing evidence hierarchy, not a percentage.
//
//   Untouched → Learning → Practised → Secure → Proven → Fading
//
// Each stage is defined by evidence a student could verify, and every result
// carries the reasons and the one thing that would move it on. Only a topic's
// FIRST independent trusted attempt on each distinct question counts, so
// repeating a familiar question can never create mastery. Transfer is judged
// from question metadata: a success only counts as transfer when its family
// (and, for unfamiliar, its context) is new relative to earlier work.
// ---------------------------------------------------------------------------

import { independentAttempt, questionContexts, questionFamilies, trustedAssessmentAttempt } from "./learning-evidence";
import type { Attempt, Id, Question } from "./types";

export type MasteryStage = "untouched" | "learning" | "practised" | "secure" | "proven" | "fading";
export type EvidenceKind = "repeat" | "same-pattern" | "near-transfer" | "unfamiliar";

export const STAGE_LABEL: Record<MasteryStage, string> = {
  untouched: "Untouched",
  learning: "Learning",
  practised: "Practised",
  secure: "Secure",
  proven: "Proven",
  fading: "Fading",
};

export const STAGE_MEANING: Record<MasteryStage, string> = {
  untouched: "No marked answers or reviews yet.",
  learning: "Some evidence, but not enough different questions or not yet accurate.",
  practised: "Enough different questions answered unaided, but not yet shown on anything new.",
  secure: "Unaided success on questions in a new pattern, but not yet after a delay.",
  proven: "Unaided success on a new kind of question at least a week after you first showed it.",
  fading: "Was secure, but the last evidence is old enough that it needs refreshing.",
};

export const MIN_DISTINCT_QUESTIONS = 3;
export const MIN_MARKS = 8;
export const PRACTISED_ACCURACY = 0.6;
export const SECURE_ACCURACY = 0.7;
export const PROVEN_DELAY_DAYS = 7;
export const FADING_AFTER_DAYS = 42;
const DAY = 86_400_000;

export interface MasteryStageResult {
  topicId: Id;
  stage: MasteryStage;
  /** Why the topic is in this stage, in plain sentences. */
  reasons: string[];
  /** The single thing that would move it forward; null at Proven. */
  next: string | null;
  evidence: {
    distinctQuestions: number;
    independentQuestions: number;
    marks: number;
    accuracy: number | null;
    novel: number;
    unfamiliar: number;
    daysSinceLast: number | null;
    repeatsIgnored: number;
  };
}

export interface MasteryStageInput {
  topicId: Id;
  attempts: readonly Attempt[];
  questions: readonly Question[];
  /** Cards for this topic have been reviewed, even if no question was answered. */
  cardsReviewed?: boolean;
  now?: Date;
}

export function classifyEvidence(question: Question, earlier: readonly Question[], seenIds: ReadonlySet<Id>): EvidenceKind {
  if (seenIds.has(question.id)) return "repeat";
  // The first question defines the baseline; nothing is "new" relative to nothing.
  if (earlier.length === 0) return "same-pattern";
  const families = new Set(earlier.flatMap(questionFamilies));
  const contexts = new Set(earlier.flatMap(questionContexts));
  const newFamily = !questionFamilies(question).some((family) => families.has(family));
  if (!newFamily) return "same-pattern";
  const newContext = !questionContexts(question).some((context) => contexts.has(context));
  return newContext ? "unfamiliar" : "near-transfer";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function masteryStage(input: MasteryStageInput): MasteryStageResult {
  const now = (input.now ?? new Date()).getTime();
  const byId = new Map(input.questions.map((question) => [question.id, question] as const));
  const topicAttempts = input.attempts
    .filter((attempt) => attempt.topicIds.includes(input.topicId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Walk in time order so "new" is judged against what the learner had already met.
  const seen = new Set<Id>();
  const met: Question[] = [];
  const counted = new Map<Id, { attempt: Attempt; kind: EvidenceKind }>();
  let repeatsIgnored = 0;
  for (const attempt of topicAttempts) {
    const question = byId.get(attempt.questionId);
    if (!question) continue;
    const kind = classifyEvidence(question, met, seen);
    const usable = independentAttempt(attempt) && trustedAssessmentAttempt(attempt, question, input.attempts, input.questions);
    if (usable) {
      if (counted.has(question.id)) repeatsIgnored += 1;
      else counted.set(question.id, { attempt, kind });
    }
    if (!seen.has(question.id)) {
      seen.add(question.id);
      met.push(question);
    }
  }

  const rows = [...counted.values()];
  const marks = rows.reduce((sum, row) => sum + row.attempt.max, 0);
  const gained = rows.reduce((sum, row) => sum + row.attempt.awarded, 0);
  const accuracy = marks > 0 ? gained / marks : null;
  const ratio = (row: { attempt: Attempt }) => row.attempt.awarded / row.attempt.max;
  const novelWins = rows.filter((row) => (row.kind === "near-transfer" || row.kind === "unfamiliar") && ratio(row) >= SECURE_ACCURACY);
  const unfamiliarWins = rows.filter((row) => row.kind === "unfamiliar" && ratio(row) >= SECURE_ACCURACY);
  const firstAt = rows.length ? Date.parse(rows[0]!.attempt.createdAt) : null;
  const lastAt = rows.length ? Math.max(...rows.map((row) => Date.parse(row.attempt.createdAt))) : null;
  const daysSinceLast = lastAt === null ? null : Math.max(0, Math.floor((now - lastAt) / DAY));
  const delayedNovel = firstAt !== null && novelWins.some((row) => Date.parse(row.attempt.createdAt) - firstAt >= PROVEN_DELAY_DAYS * DAY);

  const evidence = {
    distinctQuestions: seen.size,
    independentQuestions: rows.length,
    marks,
    accuracy: accuracy === null ? null : Math.round(accuracy * 100) / 100,
    novel: novelWins.length,
    unfamiliar: unfamiliarWins.length,
    daysSinceLast,
    repeatsIgnored,
  };

  const volume = rows.length >= MIN_DISTINCT_QUESTIONS && marks >= MIN_MARKS;
  const accurate = accuracy !== null && accuracy >= PRACTISED_ACCURACY;
  let stage: MasteryStage;
  if (!rows.length && !topicAttempts.length && !input.cardsReviewed) stage = "untouched";
  else if (!volume || !accurate) stage = "learning";
  else if (!novelWins.length || accuracy! < SECURE_ACCURACY) stage = "practised";
  else if (!delayedNovel) stage = "secure";
  else stage = "proven";

  const reasons: string[] = [];
  let next: string | null = null;
  if (stage === "untouched") {
    next = "Answer a first question or review a card on this topic.";
    reasons.push(STAGE_MEANING.untouched);
  } else {
    reasons.push(`${plural(rows.length, "different question")} answered unaided (${marks} marks).`);
    if (repeatsIgnored) reasons.push(`${plural(repeatsIgnored, "repeat")} of the same question ignored.`);
    if (accuracy !== null) reasons.push(`Accuracy on those: ${Math.round(accuracy * 100)}%.`);
    if (novelWins.length) reasons.push(`${plural(novelWins.length, "success")} on a new pattern of question.`);
    if (stage === "learning") next = rows.length < MIN_DISTINCT_QUESTIONS || marks < MIN_MARKS
      ? `Answer ${Math.max(1, MIN_DISTINCT_QUESTIONS - rows.length)} more different question${MIN_DISTINCT_QUESTIONS - rows.length === 1 ? "" : "s"} without hints.`
      : "Raise accuracy on unaided answers before moving on.";
    else if (stage === "practised") next = "Succeed on a question in a pattern you have not seen.";
    else if (stage === "secure") next = `Succeed on another new-pattern question at least ${PROVEN_DELAY_DAYS} days after your first unaided answer.`;
  }

  // Fading overrides only when there was real strength to lose.
  if ((stage === "secure" || stage === "proven") && daysSinceLast !== null && daysSinceLast > FADING_AFTER_DAYS) {
    reasons.push(`Last evidence was ${daysSinceLast} days ago.`);
    return { topicId: input.topicId, stage: "fading", reasons: [STAGE_MEANING.fading, ...reasons], next: "Answer a fresh question to confirm it still holds.", evidence };
  }
  return { topicId: input.topicId, stage, reasons, next, evidence };
}

/** Stage for many topics at once. */
export function masteryStages(input: {
  topicIds: readonly Id[];
  attempts: readonly Attempt[];
  questions: readonly Question[];
  reviewedTopicIds?: ReadonlySet<Id>;
  now?: Date;
}): MasteryStageResult[] {
  return input.topicIds.map((topicId) => masteryStage({
    topicId, attempts: input.attempts, questions: input.questions,
    cardsReviewed: input.reviewedTopicIds?.has(topicId), now: input.now,
  }));
}
