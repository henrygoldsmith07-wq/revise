import { classifyDepth, type DepthCategory, FLAGSHIP_SUBJECTS, questionDepthBySpecPoint } from "./flagship";
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
  statementReviewSlotDeficit: number;
  releaseQuestionsTotal: number;
  trustedReleaseQuestions: number;
  releaseReviewQueue: number;
  releaseStatementsMeetingCoreTrustBar: number;
  releaseCoreTrustShare: number;
  releaseStatementReviewSlotDeficit: number;
  releaseReady: boolean;
  statements: FlagshipStatementTrust[];
}

export interface FlagshipReviewPlanItem {
  questionId: Id;
  subjectId: Id;
  category: DepthCategory;
  depthCategories: DepthCategory[];
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
  releaseQuestion?: (question: Question) => boolean;
}): FlagshipTrustReadiness {
  const trustedQuestion = input.trustedQuestion ?? humanVerifiedWjecQuestion;
  const releaseQuestion = input.releaseQuestion ?? (() => true);
  const topics = input.topics.filter((topic) => topic.subjectId === input.subjectId);
  const questions = input.questions.filter((question) => question.subjectId === input.subjectId);
  const trusted = questions.filter(trustedQuestion);
  const releaseQuestions = questions.filter(releaseQuestion);
  const trustedReleaseQuestions = releaseQuestions.filter(trustedQuestion);
  const depthByQuestion = new Map(
    questions.map((question) => [question.id, questionDepthBySpecPoint(question)] as const),
  );

  const statementTrust = (trustedQuestions: readonly Question[]): FlagshipStatementTrust[] => topics.flatMap((topic) =>
    (topic.specPoints ?? []).map((point) => {
      const mapped = trustedQuestions.filter((question) =>
        depthByQuestion.get(question.id)?.has(point.id),
      );
      const categories = [...new Set(mapped.flatMap((question) =>
        [...(depthByQuestion.get(question.id)?.get(point.id) ?? [])],
      ))];
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
  const statements = statementTrust(trusted);
  const releaseStatements = statementTrust(trustedReleaseQuestions);

  const statementsWithTrustedQuestions = statements.filter((row) => row.trustedQuestionIds.length > 0).length;
  const statementsMeetingCoreTrustBar = statements.filter((row) => row.meetsCoreTrustBar).length;
  const releaseStatementsMeetingCoreTrustBar = releaseStatements.filter((row) => row.meetsCoreTrustBar).length;
  const statementsTotal = statements.length;
  const slotDeficit = (rows: readonly FlagshipStatementTrust[]) => rows.reduce((total, row) => {
    const countDeficit = Math.max(0, CORE_TRUST_QUESTION_COUNT - row.trustedQuestionIds.length);
    const categoryDeficit = CORE_TRUST_CATEGORIES.filter((category) => !row.categories.includes(category)).length;
    return total + Math.max(countDeficit, categoryDeficit);
  }, 0);
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
    statementReviewSlotDeficit: slotDeficit(statements),
    releaseQuestionsTotal: releaseQuestions.length,
    trustedReleaseQuestions: trustedReleaseQuestions.length,
    releaseReviewQueue: releaseQuestions.length - trustedReleaseQuestions.length,
    releaseStatementsMeetingCoreTrustBar,
    releaseCoreTrustShare: ratio(releaseStatementsMeetingCoreTrustBar, statementsTotal),
    releaseStatementReviewSlotDeficit: slotDeficit(releaseStatements),
    releaseReady: releaseQuestions.length > 0 && trustedReleaseQuestions.length === releaseQuestions.length &&
      releaseStatementsMeetingCoreTrustBar === statementsTotal,
    statements,
  };
}

export function flagshipTrustReadinessSet(input: {
  topics: readonly Topic[];
  questions: readonly Question[];
  trustedQuestion?: (question: Question) => boolean;
  releaseQuestion?: (question: Question) => boolean;
}): FlagshipTrustReadiness[] {
  return FLAGSHIP_SUBJECTS.map((flagship) =>
    flagshipTrustReadiness({
      subjectId: flagship.subjectId,
      topics: input.topics,
      questions: input.questions,
      trustedQuestion: input.trustedQuestion,
      releaseQuestion: input.releaseQuestion,
    }),
  );
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
  preferredQuestion?: (question: Question) => boolean;
}): FlagshipReviewPlanItem[] {
  const trustedQuestion = input.trustedQuestion ?? humanVerifiedWjecQuestion;
  const preferredQuestion = input.preferredQuestion ?? (() => false);
  const subjectPoints = new Set(
    input.topics
      .filter((topic) => topic.subjectId === input.subjectId)
      .flatMap((topic) => (topic.specPoints ?? []).map((point) => point.id)),
  );
  const subjectQuestions = input.questions.filter((question) => question.subjectId === input.subjectId);
  const depthByQuestion = new Map(
    subjectQuestions.map((question) => [question.id, questionDepthBySpecPoint(question)] as const),
  );
  const trusted = subjectQuestions.filter(trustedQuestion);
  const candidates = subjectQuestions.filter((question) => {
    if (trustedQuestion(question)) return false;
    if (question.source === "past-paper" && !verifiedWjecPaperProvenance(question)) return false;
    if (["retired", "rejected", "needs_changes"].includes(question.validation?.stage ?? "")) return false;
    return [...(depthByQuestion.get(question.id)?.keys() ?? [])].some((id) => subjectPoints.has(id));
  });

  const state = new Map<Id, { count: number; categories: Set<DepthCategory> }>();
  for (const pointId of subjectPoints) state.set(pointId, { count: 0, categories: new Set() });
  for (const question of trusted) {
    const depthByPoint = depthByQuestion.get(question.id) ?? new Map();
    for (const [pointId, categories] of depthByPoint) {
      const row = state.get(pointId);
      if (!row) continue;
      row.count++;
      for (const category of categories) row.categories.add(category);
    }
  }

  const remaining = new Map(candidates.map((question) => [question.id, question] as const));
  const plan: FlagshipReviewPlanItem[] = [];
  const limit = Math.max(0, Math.min(input.limit ?? 20, remaining.size));

  for (let index = 0; index < limit; index++) {
    let best: { question: Question; item: FlagshipReviewPlanItem } | null = null;
    for (const question of remaining.values()) {
      const category = classifyDepth(question);
      const depthByPoint = depthByQuestion.get(question.id) ?? new Map();
      const specPointIds = [...depthByPoint.keys()].filter((id) => state.has(id));
      const depthCategories = [...new Set(
        specPointIds.flatMap((pointId) => [...(depthByPoint.get(pointId) ?? [])]),
      )];
      let newStatementCoverage = 0;
      let newCoreCategories = 0;
      let progressTowardCoreCount = 0;
      for (const pointId of specPointIds) {
        const row = state.get(pointId)!;
        if (row.count === 0) newStatementCoverage++;
        for (const pointCategory of depthByPoint.get(pointId) ?? []) {
          if (CORE_TRUST_CATEGORIES.includes(pointCategory) && !row.categories.has(pointCategory)) {
            newCoreCategories++;
          }
        }
        if (row.count < CORE_TRUST_QUESTION_COUNT) progressTowardCoreCount++;
      }
      const score =
        (preferredQuestion(question) ? 1_000_000 : 0) +
        newStatementCoverage * 1000 +
        newCoreCategories * 100 +
        progressTowardCoreCount * 10 +
        specPointIds.length;
      const item: FlagshipReviewPlanItem = {
        questionId: question.id,
        subjectId: question.subjectId,
        category,
        depthCategories,
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
    const bestDepthByPoint = depthByQuestion.get(best.question.id) ?? new Map();
    for (const pointId of best.item.specPointIds) {
      const row = state.get(pointId);
      if (!row) continue;
      row.count++;
      for (const category of bestDepthByPoint.get(pointId) ?? []) row.categories.add(category);
    }
  }
  return plan;
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : 0;
}
