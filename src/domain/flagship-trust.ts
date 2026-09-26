import { classifyDepth, type DepthCategory, FLAGSHIP_SUBJECTS } from "./flagship";
import { humanVerifiedWjecQuestion, verifiedWjecPaperProvenance } from "./physics-content-review";
import type { Id, Question, Topic } from "./types";

const CORE_TRUST_CATEGORIES: readonly DepthCategory[] = ["recall", "application", "transfer"];
const CORE_TRUST_QUESTION_COUNT = 4;

export interface FlagshipStatementTrust {
  specPointId: Id;
  topicId: Id;
  trustedQuestionIds: Id[];
  categories: DepthCategory[];
  meetsCoreTrustBar: boolean;
  missing: string[];
}

export interface FlagshipTrustReadiness {
  subjectId: Id;
  questionsTotal: number;
  trustedQuestions: number;
  reviewQueue: number;
  statementsTotal: number;
  statementsWithTrustedQuestions: number;
  statementsMeetingCoreTrustBar: number;
  trustedStatementShare: number;
  coreTrustShare: number;
  releaseReady: boolean;
  statements: FlagshipStatementTrust[];
}

export interface FlagshipReviewPlanItem {
  questionId: Id;
  subjectId: Id;
  category: DepthCategory;
  specPointIds: Id[];
  score: number;
  newStatementCoverage: number;
  newCoreCategories: number;
  progressTowardCoreCount: number;
}

/**
 * Trust ledger for the four WJEC flagships.
 *
 * Structural depth and authored question volume are useful authoring metrics,
 * but neither may be presented as trusted learner evidence until the exact
 * question version has passed the human verification predicate.
 */
export function flagshipTrustReadiness(input: {
  subjectId: Id;
  topics: readonly Topic[];
  questions: readonly Question[];
  trustedQuestion?: (question: Question) => boolean;
}): FlagshipTrustReadiness {
  const trustedQuestion = input.trustedQuestion ?? humanVerifiedWjecQuestion;
  const topics = input.topics.filter((topic) => topic.subjectId === input.subjectId);
  const questions = input.questions.filter((question) => question.subjectId === input.subjectId);
  const trusted = questions.filter(trustedQuestion);

  const statements: FlagshipStatementTrust[] = topics.flatMap((topic) =>
    (topic.specPoints ?? []).map((point) => {
      const mapped = trusted.filter((question) =>
        question.parts.some((part) => (part.specPointIds ?? []).includes(point.id)),
      );
      const categories = [...new Set(mapped.map(classifyDepth))];
      const missing = [
        ...(mapped.length >= CORE_TRUST_QUESTION_COUNT ? [] : [`${CORE_TRUST_QUESTION_COUNT}-trusted-questions`]),
        ...CORE_TRUST_CATEGORIES.filter((category) => !categories.includes(category)),
      ];
      return {
        specPointId: point.id,
        topicId: topic.id,
        trustedQuestionIds: [...new Set(mapped.map((question) => question.id))],
        categories,
        meetsCoreTrustBar: missing.length === 0,
        missing,
      };
    }),
  );

  const statementsWithTrustedQuestions = statements.filter((row) => row.trustedQuestionIds.length > 0).length;
  const statementsMeetingCoreTrustBar = statements.filter((row) => row.meetsCoreTrustBar).length;
  const statementsTotal = statements.length;
  return {
    subjectId: input.subjectId,
    questionsTotal: questions.length,
    trustedQuestions: trusted.length,
    reviewQueue: questions.length - trusted.length,
    statementsTotal,
    statementsWithTrustedQuestions,
    statementsMeetingCoreTrustBar,
    trustedStatementShare: ratio(statementsWithTrustedQuestions, statementsTotal),
    coreTrustShare: ratio(statementsMeetingCoreTrustBar, statementsTotal),
    releaseReady: statementsTotal > 0 && statementsMeetingCoreTrustBar === statementsTotal &&
      trusted.length === questions.length,
    statements,
  };
}

export function flagshipTrustReadinessSet(input: {
  topics: readonly Topic[];
  questions: readonly Question[];
  trustedQuestion?: (question: Question) => boolean;
}): FlagshipTrustReadiness[] {
  return FLAGSHIP_SUBJECTS.map((flagship) =>
    flagshipTrustReadiness({
      subjectId: flagship.subjectId,
      topics: input.topics,
      questions: input.questions,
      trustedQuestion: input.trustedQuestion,
    }),
  );
}

function mappedSpecPoints(question: Question): Id[] {
  return [...new Set([
    ...(question.specPointIds ?? []),
    ...question.parts.flatMap((part) => part.specPointIds ?? []),
  ])];
}

/**
 * Greedy reviewer queue that maximises trusted statement coverage first, then
 * missing recall/application/transfer categories, then progress toward the
 * four-question core threshold. Selected rows are simulated as trusted so one
 * batch naturally spreads reviewer effort across the specification.
 */
export function buildFlagshipReviewPlan(input: {
  subjectId: Id;
  topics: readonly Topic[];
  questions: readonly Question[];
  limit?: number;
  trustedQuestion?: (question: Question) => boolean;
}): FlagshipReviewPlanItem[] {
  const trustedQuestion = input.trustedQuestion ?? humanVerifiedWjecQuestion;
  const subjectPoints = new Set(
    input.topics
      .filter((topic) => topic.subjectId === input.subjectId)
      .flatMap((topic) => (topic.specPoints ?? []).map((point) => point.id)),
  );
  const subjectQuestions = input.questions.filter((question) => question.subjectId === input.subjectId);
  const trusted = subjectQuestions.filter(trustedQuestion);
  const candidates = subjectQuestions.filter((question) => {
    if (trustedQuestion(question)) return false;
    if (question.source === "past-paper" && !verifiedWjecPaperProvenance(question)) return false;
    if (["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "")) return false;
    return mappedSpecPoints(question).some((id) => subjectPoints.has(id));
  });

  const state = new Map<Id, { count: number; categories: Set<DepthCategory> }>();
  for (const pointId of subjectPoints) state.set(pointId, { count: 0, categories: new Set() });
  for (const question of trusted) {
    const category = classifyDepth(question);
    for (const pointId of mappedSpecPoints(question)) {
      const row = state.get(pointId);
      if (!row) continue;
      row.count++;
      row.categories.add(category);
    }
  }

  const remaining = new Map(candidates.map((question) => [question.id, question] as const));
  const plan: FlagshipReviewPlanItem[] = [];
  const limit = Math.max(0, Math.min(input.limit ?? 20, remaining.size));

  for (let index = 0; index < limit; index++) {
    let best: { question: Question; item: FlagshipReviewPlanItem } | null = null;
    for (const question of remaining.values()) {
      const category = classifyDepth(question);
      const specPointIds = mappedSpecPoints(question).filter((id) => state.has(id));
      let newStatementCoverage = 0;
      let newCoreCategories = 0;
      let progressTowardCoreCount = 0;
      for (const pointId of specPointIds) {
        const row = state.get(pointId)!;
        if (row.count === 0) newStatementCoverage++;
        if (CORE_TRUST_CATEGORIES.includes(category) && !row.categories.has(category)) newCoreCategories++;
        if (row.count < CORE_TRUST_QUESTION_COUNT) progressTowardCoreCount++;
      }
      const score =
        newStatementCoverage * 1000 +
        newCoreCategories * 100 +
        progressTowardCoreCount * 10 +
        specPointIds.length;
      const item: FlagshipReviewPlanItem = {
        questionId: question.id,
        subjectId: question.subjectId,
        category,
        specPointIds,
        score,
        newStatementCoverage,
        newCoreCategories,
        progressTowardCoreCount,
      };
      if (!best || item.score > best.item.score ||
        (item.score === best.item.score && item.questionId.localeCompare(best.item.questionId) < 0)) {
        best = { question, item };
      }
    }
    if (!best) break;
    plan.push(best.item);
    remaining.delete(best.question.id);
    for (const pointId of best.item.specPointIds) {
      const row = state.get(pointId);
      if (!row) continue;
      row.count++;
      row.categories.add(best.item.category);
    }
  }
  return plan;
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : 0;
}
