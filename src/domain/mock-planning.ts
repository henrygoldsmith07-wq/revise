// ---------------------------------------------------------------------------
// Mock preparation planning.
//
// A paper is more useful than a single score: its questions reveal the exact
// parts of the syllabus that the next sitting will sample. This module turns
// that coverage into a small, explainable preparation route. It deliberately
// stays pure so the same result can drive the Past papers UI, tests and a
// future calendar action without putting paper-specific state in React.
// ---------------------------------------------------------------------------

import type { Attempt, Id, Mistake, Paper, Question, Topic, TopicMastery } from "./types";

export type MockTopicNeed = "learn" | "practise" | "refresh";
export type MockPlanActivity = "learn" | "practice" | "recall" | "paper";

export interface MockTopicCoverage {
  topicId: Id;
  title: string;
  unitId: Id;
  /** Number of distinct questions in the paper that test this topic. */
  questionCount: number;
  /** Marks allocated to this topic. Multi-topic questions are split evenly. */
  marks: number;
  /** Share of the paper's mapped marks, from 0 to 1. */
  markShare: number;
  /** Current topic mastery, or null before there is any measured evidence. */
  mastery: number | null;
  /** Accuracy on attempts for this paper's questions, or null when unattempted. */
  accuracy: number | null;
  attempts: number;
  openMistakes: number;
  /** Why this topic was placed at its current priority. */
  rationale: string;
  need: MockTopicNeed;
  /** Larger values are more urgent within this paper. */
  priorityScore: number;
}

export interface MockPlanStep {
  id: Id;
  order: number;
  activity: MockPlanActivity;
  title: string;
  topicId?: Id;
  minutes: number;
  rationale: string;
}

export interface MockStudyPlan {
  paperId: Id;
  paperTitle: string;
  subjectId: Id;
  questionCount: number;
  totalMarks: number;
  mappedMarks: number;
  unmappedQuestionCount: number;
  topics: MockTopicCoverage[];
  steps: MockPlanStep[];
  /** Short explanation suitable for the plan header. */
  summary: string;
}

export interface MockStudyPlanInput {
  paper: Pick<Paper, "id" | "title" | "subjectId" | "questionIds" | "totalMarks">;
  questions: Question[];
  topics: Topic[];
  mastery: TopicMastery[];
  attempts: Attempt[];
  mistakes?: Mistake[];
}

interface TopicAccumulator {
  topicId: Id;
  questionIds: Set<Id>;
  marks: number;
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

function uniqueTopicIds(question: Question, topicById: Map<Id, Topic>): Id[] {
  return [...new Set(question.topicIds)].filter((topicId) => topicById.has(topicId));
}

function topicNeed(input: {
  mastery: number | null;
  accuracy: number | null;
  attempts: number;
  openMistakes: number;
}): MockTopicNeed {
  if (
    input.attempts === 0 ||
    input.mastery == null ||
    input.mastery < 0.58 ||
    (input.accuracy != null && input.accuracy < 0.58)
  ) {
    return "learn";
  }
  if (
    input.openMistakes > 0 ||
    input.mastery < 0.78 ||
    (input.accuracy != null && input.accuracy < 0.78)
  ) {
    return "practise";
  }
  return "refresh";
}

function topicRationale(input: {
  title: string;
  need: MockTopicNeed;
  mastery: number | null;
  accuracy: number | null;
  attempts: number;
  openMistakes: number;
}): string {
  if (input.need === "learn") {
    return input.attempts === 0 || input.mastery == null
      ? "No measured evidence yet — learn the written checkpoint before attempting the mock question."
      : `Current mastery is ${percentage(input.mastery)} — rebuild the core idea, then test it in an exam question.`;
  }
  if (input.need === "practise") {
    if (input.openMistakes > 0) {
      return `${input.openMistakes} open mistake${input.openMistakes === 1 ? "" : "s"} remain${input.openMistakes === 1 ? "s" : ""} — practise this topic and retest the correction.`;
    }
    return input.accuracy != null
      ? `${percentage(input.accuracy)} accuracy across ${input.attempts} attempt${input.attempts === 1 ? "" : "s"} — practise the mark-scheme wording under pressure.`
      : `The mock tests ${input.title.toLowerCase()} — practise a short set before sitting the full paper.`;
  }
  return `This topic is currently secure${input.mastery != null ? ` at ${percentage(input.mastery)} mastery` : ""} — keep it warm with one retrieval check.`;
}

/**
 * Build a topic-aware preparation route for one extracted mock/paper.
 *
 * Marks are divided between a question's mapped topics so a 6-mark question
 * tagged with two topics contributes 3 marks to each rather than inflating the
 * paper total. Unknown topic ids are left out of the actionable plan and are
 * reported as `unmappedQuestionCount` so the UI can be honest about coverage.
 */
export function buildMockStudyPlan(input: MockStudyPlanInput): MockStudyPlan {
  const topicById = new Map(input.topics.map((topic) => [topic.id, topic] as const));
  const questionById = new Map(input.questions.map((question) => [question.id, question] as const));
  const masteryById = new Map(input.mastery.map((row) => [row.topicId, row] as const));
  const paperQuestions = input.paper.questionIds
    .map((questionId) => questionById.get(questionId))
    .filter((question): question is Question => Boolean(question));

  const accumulators = new Map<Id, TopicAccumulator>();
  let unmappedQuestionCount = 0;
  for (const question of paperQuestions) {
    const topicIds = uniqueTopicIds(question, topicById);
    if (!topicIds.length) {
      unmappedQuestionCount += 1;
      continue;
    }
    const marks = Math.max(0, question.totalMarks);
    const share = marks / topicIds.length;
    for (const topicId of topicIds) {
      const row = accumulators.get(topicId) ?? { topicId, questionIds: new Set<Id>(), marks: 0 };
      row.questionIds.add(question.id);
      row.marks += share;
      accumulators.set(topicId, row);
    }
  }

  const mappedMarks = [...accumulators.values()].reduce((sum, row) => sum + row.marks, 0);
  const mistakes = input.mistakes ?? [];
  const topics: MockTopicCoverage[] = [...accumulators.values()]
    .map((row) => {
      const topic = topicById.get(row.topicId)!;
      const topicQuestionIds = row.questionIds;
      const topicAttempts = input.attempts.filter(
        (attempt) =>
          (topicQuestionIds.has(attempt.questionId) || attempt.topicIds.includes(row.topicId)) &&
          attempt.subjectId === input.paper.subjectId,
      );
      const scorable = topicAttempts.filter((attempt) => attempt.max > 0);
      const available = scorable.reduce((sum, attempt) => sum + attempt.max, 0);
      const awarded = scorable.reduce((sum, attempt) => sum + attempt.awarded, 0);
      const accuracy = available > 0 ? clamp01(awarded / available) : null;
      const masteryRow = masteryById.get(row.topicId);
      const mastery = masteryRow?.attempts && masteryRow.attempts > 0 ? clamp01(masteryRow.mastery) : null;
      const openMistakes = mistakes.filter(
        (mistake) =>
          mistake.subjectId === input.paper.subjectId &&
          mistake.topicId === row.topicId &&
          !mistake.resolved &&
          (!mistake.questionId || topicQuestionIds.has(mistake.questionId)),
      ).length;
      const need = topicNeed({ mastery, accuracy, attempts: scorable.length, openMistakes });
      const evidence = mastery ?? accuracy ?? 0;
      const weakness = 1 - evidence;
      const mistakeBoost = Math.min(0.35, openMistakes * 0.12);
      // Coverage matters, but an unprepared high-mark topic should still
      // outrank a large topic the learner already has secure. Readiness leads
      // the score; mark share breaks ties and keeps high-value gaps visible.
      const priorityScore = round(weakness * 0.55 + row.marks / Math.max(1, mappedMarks) * 0.45 + mistakeBoost, 4);
      return {
        topicId: row.topicId,
        title: topic.title,
        unitId: topic.unitId,
        questionCount: row.questionIds.size,
        marks: round(row.marks),
        markShare: mappedMarks > 0 ? round(row.marks / mappedMarks, 4) : 0,
        mastery,
        accuracy,
        attempts: scorable.length,
        openMistakes,
        rationale: topicRationale({ title: topic.title, need, mastery, accuracy, attempts: scorable.length, openMistakes }),
        need,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || b.marks - a.marks || a.title.localeCompare(b.title));

  const steps: MockPlanStep[] = [];
  let order = 1;
  for (const topic of topics) {
    if (topic.need === "learn") {
      steps.push({
        id: `mock-plan:${input.paper.id}:learn:${topic.topicId}`,
        order: order++,
        activity: "learn",
        title: `Learn ${topic.title}`,
        topicId: topic.topicId,
        minutes: 15,
        rationale: topic.rationale,
      });
    }

    // Retrieval is the bridge between teaching and application. Every topic
    // gets a blank-page recall step, including topics that are already secure;
    // the only difference is whether a written first pass comes before it.
    steps.push({
      id: `mock-plan:${input.paper.id}:recall:${topic.topicId}`,
      order: order++,
      activity: "recall",
      title: `Retrieve ${topic.title}`,
      topicId: topic.topicId,
      minutes: 10,
      rationale:
        topic.need === "refresh"
          ? topic.rationale
          : "Close the notes and write the key idea, condition and mark-scheme wording from memory before practising.",
    });

    if (topic.need !== "refresh") {
      steps.push({
        id: `mock-plan:${input.paper.id}:practice:${topic.topicId}`,
        order: order++,
        activity: "practice",
        title: `Practise ${topic.title}`,
        topicId: topic.topicId,
        minutes: 20,
        rationale: `Use the ${topic.questionCount} mock question${topic.questionCount === 1 ? "" : "s"} covering this topic, then correct any missed mark-scheme points.`,
      });
    }
  }
  if (paperQuestions.length) {
    steps.push({
      id: `mock-plan:${input.paper.id}:paper`,
      order: order++,
      activity: "paper",
      title: `Sit ${input.paper.title}`,
      minutes: 30,
      rationale: "Finish the topic blocks first, then sit the full mock under exam conditions to measure transfer.",
    });
  }

  const lead = topics[0];
  const topicLabel = `${topics.length} tested ${topics.length === 1 ? "topic" : "topics"}`;
  const summary = lead
    ? `${paperQuestions.length} question${paperQuestions.length === 1 ? "" : "s"} cover ${topicLabel}. Start with ${lead.title}, which carries ${Math.round(lead.markShare * 100)}% of the mapped marks.`
    : paperQuestions.length
      ? `${paperQuestions.length} question${paperQuestions.length === 1 ? "" : "s"} are ready, but their topics need mapping before a focused plan can be built.`
      : "Extract this mock's questions first so Revise can build a topic-aware plan.";

  return {
    paperId: input.paper.id,
    paperTitle: input.paper.title,
    subjectId: input.paper.subjectId,
    questionCount: paperQuestions.length,
    totalMarks: input.paper.totalMarks,
    mappedMarks: round(mappedMarks),
    unmappedQuestionCount,
    topics,
    steps,
    summary,
  };
}

/** Topic ids tested by a paper, in the same priority order as its plan. */
export function mockTopicIds(plan: MockStudyPlan): Id[] {
  return plan.topics.map((topic) => topic.topicId);
}
