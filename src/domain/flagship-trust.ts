import { classifyDepth, type DepthCategory, FLAGSHIP_SUBJECTS } from "./flagship";
import { humanVerifiedWjecQuestion } from "./physics-content-review";
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
  statements: FlagshipStatementTrust[];
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

function ratio(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1000) / 1000 : 0;
}
