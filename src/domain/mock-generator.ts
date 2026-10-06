// ---------------------------------------------------------------------------
// Bespoke mock-paper generation.
//
// An uploaded paper measures a student against a fixed instrument. Seneca
// and revise-style apps go further: assemble a *fresh* paper from the
// question bank that aims at the topics this student is actually losing
// marks on. This module performs that assembly and deliberately stays pure
// so the same result can drive the Past papers UI, tests and a future
// calendar action without putting generation state in React.
//
// Honesty rules:
//   — only trusted content is eligible (the same gate every planner uses);
//   — weakness comes from measured evidence only: mastery, trusted recent
//     accuracy and open mistakes. An unmeasured topic gets a neutral prior,
//     never a guess;
//   — a question sat recently is deprioritised, not banned: a mock should
//     measure fresh transfer where supply allows, but a thin bank may still
//     need a known item;
//   — when the bank cannot fill the target, the shortfall is reported and
//     the paper tops up honestly — never padded with untrusted filler.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { trustworthyAttempt } from "./learning-evidence";
import type { Attempt, Id, Mistake, Paper, Question, Topic, TopicMastery } from "./types";

/** Attempts newer than this are treated as "sat recently" and deprioritised. */
export const MOCK_RECENT_WINDOW_DAYS = 21;
/** 0 = even coverage of the syllabus, 1 = pure weakness targeting. */
export const MOCK_DEFAULT_FOCUS = 0.65;
/** Smallest sensible paper; below this a mock is not worth sitting. */
export const MOCK_MIN_MARKS = 10;
/** Reading time added on top of per-mark pacing. */
export const MOCK_READING_MINUTES = 5;
/** Average working minutes per mark (GCSE-style pacing). */
export const MOCK_TIME_PER_MARK_MINUTES = 1.2;

export type MockEvidenceKind = "mastery" | "accuracy" | "mistakes" | "none";

export interface MockTopicAllocation {
  topicId: Id;
  title: string;
  unitId: Id;
  /** Marks aimed at this topic. Multi-topic questions split their marks. */
  marks: number;
  /** 0–1 measured weakness (1 = weakest); 0.5 is the neutral prior. */
  weakness: number;
  evidence: MockEvidenceKind;
  openMistakes: number;
  questionIds: Id[];
  rationale: string;
}

export interface MockPick {
  questionId: Id;
  topicIds: Id[];
  marks: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Why this question earned its place, in one sentence. */
  reason: string;
}

export interface GeneratedMock {
  subjectId: Id;
  title: string;
  questionIds: Id[];
  totalMarks: number;
  targetMarks: number;
  estimatedMinutes: number;
  /** Marks-weighted average difficulty of the selected questions. */
  averageDifficulty: number | null;
  focus: number;
  topics: MockTopicAllocation[];
  picks: MockPick[];
  /** Honest accounting of what the bank could not provide. */
  notes: string[];
  /** One-line summary for the panel header. */
  headline: string;
}

export interface MockGeneratorInput {
  subjectId: Id;
  /** The whole question bank; the generator filters by subject itself. */
  questions: Question[];
  topics: Topic[];
  mastery: TopicMastery[];
  attempts: Attempt[];
  mistakes?: Mistake[];
  targetMarks: number;
  /** 0 = even coverage, 1 = pure weakness. Defaults to MOCK_DEFAULT_FOCUS. */
  focus?: number;
  /** Optional expected topic mix of the next paper (see ./topic-forecast). When
   *  present, the mark budget also leans toward topics the next paper is
   *  predicted to sample, so a bespoke mock doubles as a predicted-paper drill. */
  forecastShares?: Map<Id, number>;
  /** 0–1 pull of the forecast mix on the budget, applied within the focus share. */
  forecastWeight?: number;
  /** Questions to leave out — the UI passes questions from earlier bespoke mocks. */
  excludeQuestionIds?: Id[];
  now?: Date;
}

interface TopicEvidence {
  weakness: number;
  /** The measured value weakness was derived from (mastery or accuracy). */
  measured: number | null;
  evidence: MockEvidenceKind;
  openMistakes: number;
  attempts: number;
}

interface TopicBudget {
  topicId: Id;
  remaining: number;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function percentage(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

/**
 * Weakness for one topic from measured evidence only. Mastery leads when it
 * exists; trusted recent accuracy is the fallback; open mistakes lift the
 * estimate (capped); a topic with nothing measured sits at the neutral 0.5
 * prior so an unmeasured syllabus still gets even coverage, not a guess.
 */
function topicEvidence(input: {
  masteryRow: TopicMastery | undefined;
  attempts: Attempt[];
  openMistakes: number;
}): TopicEvidence {
  const masteryRow = input.masteryRow;
  if (masteryRow && masteryRow.attempts > 0) {
    const mastery = clamp01(masteryRow.mastery);
    return {
      weakness: clamp01(1 - mastery + Math.min(0.2, input.openMistakes * 0.05)),
      measured: mastery,
      evidence: "mastery",
      openMistakes: input.openMistakes,
      attempts: masteryRow.attempts,
    };
  }
  const scorable = input.attempts.filter((attempt) => attempt.max > 0);
  if (scorable.length) {
    const available = scorable.reduce((sum, attempt) => sum + attempt.max, 0);
    const awarded = scorable.reduce((sum, attempt) => sum + attempt.awarded, 0);
    const accuracy = awarded / available;
    return {
      weakness: clamp01(1 - accuracy + Math.min(0.2, input.openMistakes * 0.05)),
      measured: accuracy,
      evidence: "accuracy",
      openMistakes: input.openMistakes,
      attempts: scorable.length,
    };
  }
  if (input.openMistakes > 0) {
    return {
      weakness: clamp01(0.5 + Math.min(0.3, input.openMistakes * 0.1)),
      measured: null,
      evidence: "mistakes",
      openMistakes: input.openMistakes,
      attempts: 0,
    };
  }
  return { weakness: 0.5, measured: null, evidence: "none", openMistakes: 0, attempts: 0 };
}

function evidenceRationale(input: {
  title: string;
  evidence: MockEvidenceKind;
  measured: number | null;
  openMistakes: number;
}): string {
  if (input.evidence === "mastery") {
    return `Mastery is ${percentage(input.measured ?? 0)} — ${input.openMistakes > 0 ? `${input.openMistakes} open mistake${input.openMistakes === 1 ? "" : "s"} and ` : ""}the mock aims its share of marks here.`;
  }
  if (input.evidence === "accuracy") {
    return `Recent accuracy is ${percentage(input.measured ?? 0)} — marks are being lost on ${input.title}, so the paper samples it.`;
  }
  if (input.evidence === "mistakes") {
    return `${input.openMistakes} open mistake${input.openMistakes === 1 ? "" : "s"} with no measured accuracy yet — the paper probes them on fresh questions.`;
  }
  return "No measured evidence yet — covered evenly so the mock establishes a baseline.";
}

/**
 * Assemble a bespoke mock paper for one subject.
 *
 * Marks are split between a question's mapped topics, so a 6-mark question
 * tagged with two topics contributes 3 marks to each budget. Selection is
 * greedy per topic in descending allocation: fresh (unattempted) questions
 * win, recently sat questions lose credit, and the question whose marks land
 * closest to the remaining budget is taken. When weak-topic supply runs out
 * the paper tops up from the widest remaining questions and says so.
 */
export function generateMockPaper(input: MockGeneratorInput): GeneratedMock {
  const now = input.now ?? new Date();
  const focus = clamp01(input.focus ?? MOCK_DEFAULT_FOCUS);
  const targetMarks = Math.max(0, Math.round(input.targetMarks));
  const exclude = new Set(input.excludeQuestionIds ?? []);
  const mistakes = input.mistakes ?? [];
  const topicById = new Map(input.topics.map((topic) => [topic.id, topic] as const));
  const masteryById = new Map(input.mastery.map((row) => [row.topicId, row] as const));
  const questionById = new Map(input.questions.map((question) => [question.id, question] as const));

  // Eligible bank: trusted content, real marks, at least one known topic,
  // not excluded by the caller (e.g. an earlier bespoke mock).
  const bank = input.questions.filter(
    (question) =>
      question.subjectId === input.subjectId &&
      trustedAssessmentContent(question) &&
      question.totalMarks > 0 &&
      question.topicIds.some((topicId) => topicById.has(topicId)) &&
      !exclude.has(question.id),
  );
  const bankById = new Map(bank.map((question) => [question.id, question] as const));

  // Trusted attempts by question, for freshness and accuracy evidence.
  const trustedAttempts = new Map<Id, Attempt[]>();
  for (const attempt of input.attempts) {
    if (!trustworthyAttempt(attempt) || attempt.subjectId !== input.subjectId) continue;
    const question = questionById.get(attempt.questionId);
    if (!question || !trustedAssessmentContent(question)) continue;
    const rows = trustedAttempts.get(attempt.questionId) ?? [];
    rows.push(attempt);
    trustedAttempts.set(attempt.questionId, rows);
  }

  const recentDay = Math.floor(now.getTime() / 86_400_000) - MOCK_RECENT_WINDOW_DAYS;
  const satRecently = (questionId: Id): boolean => {
    const attempts = trustedAttempts.get(questionId) ?? [];
    return attempts.some((attempt) => {
      const time = Date.parse(attempt.createdAt);
      return Number.isFinite(time) && time / 86_400_000 >= recentDay;
    });
  };
  const recentlySatCount = bank.filter((question) => satRecently(question.id)).length;

  const attemptsOnTopic = (topicId: Id): Attempt[] => {
    const rows: Attempt[] = [];
    for (const [questionId, attempts] of trustedAttempts) {
      if (questionById.get(questionId)?.topicIds.includes(topicId)) rows.push(...attempts);
    }
    return rows;
  };

  // Per-topic weakness from measured evidence.
  const evidence = new Map<Id, TopicEvidence>();
  for (const topic of input.topics) {
    if (topic.subjectId !== input.subjectId) continue;
    evidence.set(
      topic.id,
      topicEvidence({
        masteryRow: masteryById.get(topic.id),
        attempts: attemptsOnTopic(topic.id),
        openMistakes: mistakes.filter(
          (mistake) => mistake.subjectId === input.subjectId && mistake.topicId === topic.id && !mistake.resolved,
        ).length,
      }),
    );
  }

  // Mark allocation: a linear blend of even coverage, weakness targeting and
  // (optionally) the forecast mix for the next paper. The forecast pull is
  // applied inside the weakness share so focus remains the main lever.
  const topics = [...evidence.keys()];
  const forecastPull = clamp01(input.forecastWeight ?? 0);
  const forecast = input.forecastShares;
  const weights = new Map<Id, number>();
  let totalWeight = 0;
  for (const topicId of topics) {
    const weakness = evidence.get(topicId)!.weakness;
    const base = (1 - focus) / Math.max(1, topics.length) + focus * weakness;
    const forecastShare = forecast?.get(topicId);
    const forecastTilt =
      forecast && forecastShare != null && forecastPull > 0
        ? forecastPull * (forecastShare / (forecast.size ? 1 / forecast.size : 1) - 1)
        : 0;
    // Blend: (1−pull)·base + pull·(base·forecastTiltFactor), floored at a
    // small positive share so a forecast-unlikely topic still gets coverage.
    const weight = Math.max(0.01, (1 - forecastPull) * base + forecastPull * base * Math.max(0.1, 1 + forecastTilt));
    weights.set(topicId, weight);
    totalWeight += weight;
  }
  const budgets = new Map<Id, TopicBudget>();
  for (const topicId of topics) {
    const weight = weights.get(topicId)!;
    budgets.set(topicId, {
      topicId,
      remaining: totalWeight > 0 ? (targetMarks * weight) / totalWeight : 0,
    });
  }

  const selected = new Set<Id>();
  const pickReasons = new Map<Id, string>();
  const topicQuestionIds = new Map<Id, Id[]>();
  for (const topicId of topics) topicQuestionIds.set(topicId, []);
  const coveredSpecPoints = new Set<Id>();
  const coveredTopics = new Set<Id>();

  // Count items the trust gate removed, so the UI can be honest about supply.
  let untrustedCount = 0;
  for (const question of input.questions) {
    if (question.subjectId === input.subjectId && !trustedAssessmentContent(question)) untrustedCount += 1;
  }

  interface Scored {
    question: Question;
    score: number;
    reason: string;
  }

  /** Rank one question against the budgets it would draw from. */
  const scoreQuestion = (question: Question, remainingTotal: number): Scored | null => {
    const mapped = [...new Set(question.topicIds)].filter((topicId) => budgets.has(topicId));
    if (!mapped.length) return null;
    const attempts = trustedAttempts.get(question.id) ?? [];
    const attemptCount = attempts.length;

    // Freshness: an unattempted question is the cleanest measurement; one
    // sat recently mostly re-tests memory of itself.
    let freshness = 3;
    if (satRecently(question.id)) freshness = -2;
    else if (attemptCount > 0) freshness = 1;

    // Variety: reward questions that open new spec points and topics.
    let variety = 0;
    for (const specPointId of question.specPointIds ?? []) {
      if (!coveredSpecPoints.has(specPointId)) variety += 0.5;
    }
    for (const topicId of mapped) {
      if (!coveredTopics.has(topicId)) variety += 0.5;
    }

    // Trust: verified content outranks merely checked content.
    const trust = question.verification === "verified" ? 0.5 : question.verification === "checked" ? 0.25 : 0;

    // Fit: the question whose marks land closest to what is left wins.
    const share = question.totalMarks / mapped.length;
    const fitPenalty = Math.abs(Math.min(remainingTotal, question.totalMarks) - share) * 0.05;

    const score = freshness + variety + trust - fitPenalty;
    const reasons: string[] = [];
    if (attemptCount === 0) reasons.push("unattempted, so it measures fresh transfer");
    else if (satRecently(question.id)) reasons.push("sat recently — kept only because the bank is thin here");
    else reasons.push(`sat ${attemptCount} time${attemptCount === 1 ? "" : "s"} before, but not recently`);
    if (mapped.length > 1) reasons.push(`tests ${mapped.length} topics at once`);
    if (question.verification === "verified") reasons.push("verified content");
    return { question, score, reason: reasons.join("; ") };
  };

  const take = (question: Question, reason: string): void => {
    selected.add(question.id);
    pickReasons.set(question.id, reason);
    const mapped = [...new Set(question.topicIds)].filter((topicId) => budgets.has(topicId));
    const share = question.totalMarks / mapped.length;
    for (const topicId of mapped) {
      const budget = budgets.get(topicId)!;
      budget.remaining -= share;
      topicQuestionIds.get(topicId)!.push(question.id);
    }
    for (const specPointId of question.specPointIds ?? []) coveredSpecPoints.add(specPointId);
    for (const topicId of mapped) coveredTopics.add(topicId);
  };

  const sumOfMarks = (): number => {
    let sum = 0;
    for (const id of selected) sum += bankById.get(id)?.totalMarks ?? 0;
    return sum;
  };
  const remainingTotal = (): number =>
    [...budgets.values()].reduce((sum, budget) => sum + Math.max(0, budget.remaining), 0);

  // Pass 1 — fill each topic's budget, weakest first, until supply runs out.
  const order = [...topics].sort((a, b) => budgets.get(b)!.remaining - budgets.get(a)!.remaining);
  for (const topicId of order) {
    for (;;) {
      const budget = budgets.get(topicId)!;
      if (budget.remaining < 1) break;
      let best: Scored | null = null;
      for (const question of bank) {
        if (selected.has(question.id) || !question.topicIds.includes(topicId)) continue;
        const scored = scoreQuestion(question, budget.remaining);
        if (scored && (!best || scored.score > best.score)) best = scored;
      }
      if (!best) break;
      take(best.question, best.reason);
    }
  }

  // Pass 2 — top up toward the target from the widest remaining questions,
  // so a thin weak-topic bank still yields a sit-able paper.
  let toppedUp = 0;
  for (;;) {
    if (targetMarks - sumOfMarks() < 1) break;
    let best: Scored | null = null;
    for (const question of bank) {
      if (selected.has(question.id)) continue;
      const scored = scoreQuestion(question, remainingTotal());
      if (scored && (!best || scored.score > best.score)) best = scored;
    }
    if (!best) break;
    take(best.question, best.reason);
    toppedUp += 1;
  }

  // Assemble per-topic allocations, largest mark share first.
  const allocations: MockTopicAllocation[] = [...topicQuestionIds.entries()]
    .filter(([, ids]) => ids.length > 0)
    .map(([topicId, ids]) => {
      const topic = topicById.get(topicId)!;
      const evidenceRow = evidence.get(topicId)!;
      const marks = round(
        ids.reduce((sum, id) => {
          const question = bankById.get(id)!;
          const mappedCount = [...new Set(question.topicIds)].filter((t) => budgets.has(t)).length;
          return sum + question.totalMarks / Math.max(1, mappedCount);
        }, 0),
      );
      return {
        topicId,
        title: topic.title,
        unitId: topic.unitId,
        marks,
        weakness: round(evidenceRow.weakness, 2),
        evidence: evidenceRow.evidence,
        openMistakes: evidenceRow.openMistakes,
        questionIds: ids,
        rationale: evidenceRationale({
          title: topic.title,
          evidence: evidenceRow.evidence,
          measured: evidenceRow.measured,
          openMistakes: evidenceRow.openMistakes,
        }),
      };
    })
    .sort((a, b) => b.marks - a.marks || b.weakness - a.weakness || a.title.localeCompare(b.title));

  const picks: MockPick[] = [...selected].map((questionId) => {
    const question = bankById.get(questionId)!;
    return {
      questionId,
      topicIds: question.topicIds,
      marks: question.totalMarks,
      difficulty: question.difficulty,
      reason: pickReasons.get(questionId) ?? "selected to complete the paper",
    };
  });

  const totalMarks = round(sumOfMarks());
  const difficultyMarks = picks.reduce((sum, pick) => sum + pick.difficulty * pick.marks, 0);
  const averageDifficulty = totalMarks > 0 ? round(difficultyMarks / totalMarks, 1) : null;
  const estimatedMinutes = Math.round(MOCK_READING_MINUTES + totalMarks * MOCK_TIME_PER_MARK_MINUTES);

  const notes: string[] = [];
  if (toppedUp > 0) {
    notes.push(
      `The bank could not fill every weak-topic budget, so ${toppedUp} broader question${toppedUp === 1 ? "" : "s"} top${toppedUp === 1 ? "s" : ""} up the paper.`,
    );
  }
  if (recentlySatCount > 0) {
    notes.push(
      `${recentlySatCount} question${recentlySatCount === 1 ? "" : "s"} sat in the last ${MOCK_RECENT_WINDOW_DAYS} days ${recentlySatCount === 1 ? "was" : "were"} deprioritised so the mock measures fresh transfer.`,
    );
  }
  if (untrustedCount > 0) {
    notes.push(`${untrustedCount} question${untrustedCount === 1 ? "" : "s"} in this subject is not trusted content yet and was left out.`);
  }
  if (![...evidence.values()].some((row) => row.evidence !== "none")) {
    notes.push("No measured evidence exists for this subject yet — the paper covers the syllabus evenly to establish a baseline.");
  }
  if (totalMarks < MOCK_MIN_MARKS && totalMarks < targetMarks && bank.length > 0) {
    notes.push(`Only ${totalMarks} of the ${targetMarks}-mark target could be assembled — below the ${MOCK_MIN_MARKS}-mark minimum for a useful mock.`);
  }

  const lead = allocations[0];
  const measured = allocations.filter((allocation) => allocation.evidence !== "none");
  const shortfall = totalMarks < targetMarks;
  const headline = lead
    ? shortfall
      ? `Only ${totalMarks} of the ${targetMarks}-mark target could be assembled — add more questions to this subject's bank.`
      : `${totalMarks} marks across ${allocations.length} topic${allocations.length === 1 ? "" : "s"}${measured.length ? `, aimed at ${lead.title} first` : ", spread evenly as a baseline"}.`
    : "No eligible questions in this subject's bank yet.";

  return {
    subjectId: input.subjectId,
    title: `Bespoke mock · ${now.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
    questionIds: [...selected],
    totalMarks,
    targetMarks,
    estimatedMinutes,
    averageDifficulty,
    focus,
    topics: allocations,
    picks,
    notes,
    headline,
  };
}

/** Persist a generated mock as a paper, tagged so the UI can tell it apart. */
export function buildGeneratedPaper(mock: GeneratedMock, userId: Id, id?: Id): Paper {
  return {
    id: id ?? crypto.randomUUID(),
    userId,
    subjectId: mock.subjectId,
    title: mock.title,
    totalMarks: mock.totalMarks,
    questionIds: mock.questionIds,
    status: "extracted",
    createdAt: new Date().toISOString(),
    generated: {
      focus: mock.focus,
      targetMarks: mock.targetMarks,
      topicIds: mock.topics.map((topic) => topic.topicId),
    },
  };
}
