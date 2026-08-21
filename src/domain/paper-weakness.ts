import type { Attempt, Id, Mistake, Paper, Question } from "./types";

export interface PaperWeaknessTopic {
  topicId: Id;
  marksLost: number;
  marksAvailable: number;
  accuracy: number;
  questionCount: number;
  missedPoints: string[];
  mistakeCount: number;
  openMistakeCount: number;
}

export interface PaperWeaknessQuestion {
  questionId: Id;
  label: string;
  stem: string;
  marksLost: number;
  marksAvailable: number;
  accuracy: number;
  missedPoints: string[];
  topicIds: Id[];
}

export interface PaperWeaknessCause {
  label: string;
  marksLost: number;
}

export interface PaperWeaknessRecommendation {
  topicId: Id;
  reason: string;
}

export interface PaperWeaknessAnalysis {
  paperId: Id;
  title: string;
  subjectId: Id;
  attempts: number;
  marksGained: number;
  marksAvailable: number;
  marksLost: number;
  accuracy: number | null;
  topics: PaperWeaknessTopic[];
  questions: PaperWeaknessQuestion[];
  causes: PaperWeaknessCause[];
  commands: PaperWeaknessCause[];
  recommendations: PaperWeaknessRecommendation[];
  headline: string;
}

interface TopicAccumulator {
  gained: number;
  available: number;
  questionIds: Set<Id>;
  missedPoints: string[];
  mistakeCount: number;
  openMistakeCount: number;
}

interface QuestionAccumulator {
  questionId: Id;
  label: string;
  stem: string;
  gained: number;
  available: number;
  missedPoints: string[];
  topicIds: Id[];
}

function rounded(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function unique(values: string[], limit = 6): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function addTopic(
  topics: Map<Id, TopicAccumulator>,
  topicIds: Id[],
  attempt: Attempt,
  missedPoints: string[],
): void {
  const ids = [...new Set(topicIds)];
  if (!ids.length) return;
  const share = 1 / ids.length;
  for (const topicId of ids) {
    const row = topics.get(topicId) ?? {
      gained: 0,
      available: 0,
      questionIds: new Set<Id>(),
      missedPoints: [],
      mistakeCount: 0,
      openMistakeCount: 0,
    };
    row.gained += attempt.awarded * share;
    row.available += attempt.max * share;
    row.questionIds.add(attempt.questionId);
    row.missedPoints.push(...missedPoints);
    topics.set(topicId, row);
  }
}

/**
 * Analyse one paper sitting, not the learner's all-time history. Callers can
 * pass paperRunId to keep a resit separate from earlier attempts on the same
 * questions. Missing paperRunId is treated as no evidence for a run-scoped
 * report rather than silently mixing historical practice into the result.
 */
export function analysePaperWeakness(input: {
  paper: Pick<Paper, "id" | "title" | "subjectId" | "questionIds">;
  attempts: Attempt[];
  questions: Question[];
  mistakes?: Mistake[];
  paperRunId?: Id;
}): PaperWeaknessAnalysis {
  const questionIds = new Set(input.paper.questionIds);
  const questionsById = new Map(input.questions.map((question) => [question.id, question] as const));
  const relevantAttempts = input.attempts.filter(
    (attempt) =>
      attempt.mode === "paper" &&
      questionIds.has(attempt.questionId) &&
      (!input.paperRunId || attempt.paperRunId === input.paperRunId),
  );
  const attemptsById = new Map(relevantAttempts.map((attempt) => [attempt.id, attempt] as const));
  const topics = new Map<Id, TopicAccumulator>();
  const questions = new Map<Id, QuestionAccumulator>();

  for (const attempt of relevantAttempts) {
    const question = questionsById.get(attempt.questionId);
    const topicIds = question?.topicIds.length ? question.topicIds : attempt.topicIds;
    const missedPoints = attempt.marked.flatMap((part) => part.missedPoints);
    addTopic(topics, topicIds, attempt, missedPoints);

    const row = questions.get(attempt.questionId) ?? {
      questionId: attempt.questionId,
      label: question?.paperQuestionNumber ? `Question ${question.paperQuestionNumber}` : `Question ${attempt.questionId}`,
      stem: question?.stem ?? "",
      gained: 0,
      available: 0,
      missedPoints: [],
      topicIds,
    };
    row.gained += attempt.awarded;
    row.available += attempt.max;
    row.missedPoints.push(...missedPoints);
    questions.set(attempt.questionId, row);
  }

  const paperMistakes = (input.mistakes ?? []).filter(
    (mistake) => mistake.attemptId && attemptsById.has(mistake.attemptId),
  );
  for (const mistake of paperMistakes) {
    const topic = topics.get(mistake.topicId);
    if (!topic) continue;
    topic.mistakeCount += 1;
    if (!mistake.resolved) topic.openMistakeCount += 1;
  }

  const topicRows: PaperWeaknessTopic[] = [...topics.entries()]
    .map(([topicId, row]) => ({
      topicId,
      marksLost: rounded(Math.max(0, row.available - row.gained)),
      marksAvailable: rounded(row.available),
      accuracy: row.available ? rounded(row.gained / row.available, 3) : 0,
      questionCount: row.questionIds.size,
      missedPoints: unique(row.missedPoints),
      mistakeCount: row.mistakeCount,
      openMistakeCount: row.openMistakeCount,
    }))
    .sort((a, b) => b.marksLost - a.marksLost || a.accuracy - b.accuracy);

  const questionRows: PaperWeaknessQuestion[] = [...questions.values()]
    .map((row) => ({
      questionId: row.questionId,
      label: row.label,
      stem: row.stem,
      marksLost: rounded(Math.max(0, row.available - row.gained)),
      marksAvailable: rounded(row.available),
      accuracy: row.available ? rounded(row.gained / row.available, 3) : 0,
      missedPoints: unique(row.missedPoints),
      topicIds: row.topicIds,
    }))
    .sort((a, b) => b.marksLost - a.marksLost || a.accuracy - b.accuracy);

  const causes = new Map<string, number>();
  const commands = new Map<string, number>();
  for (const mistake of paperMistakes) {
    causes.set(mistake.category, (causes.get(mistake.category) ?? 0) + mistake.marksLost);
    if (mistake.command) commands.set(mistake.command, (commands.get(mistake.command) ?? 0) + mistake.marksLost);
  }
  const causeRows = (rows: Map<string, number>): PaperWeaknessCause[] =>
    [...rows.entries()]
      .map(([label, marksLost]) => ({ label, marksLost: rounded(marksLost) }))
      .sort((a, b) => b.marksLost - a.marksLost);

  const marksGained = rounded(relevantAttempts.reduce((sum, attempt) => sum + attempt.awarded, 0));
  const marksAvailable = rounded(relevantAttempts.reduce((sum, attempt) => sum + attempt.max, 0));
  const marksLost = rounded(Math.max(0, marksAvailable - marksGained));
  const accuracy = marksAvailable ? rounded(marksGained / marksAvailable, 3) : null;
  const recommendations = topicRows
    .filter((topic) => topic.marksLost > 0)
    .slice(0, 3)
    .map((topic) => ({
      topicId: topic.topicId,
      reason:
        topic.accuracy < 0.6
          ? `${topic.marksLost} mark(s) lost at ${Math.round(topic.accuracy * 100)}% accuracy — relearn the core points, then retest a similar question.`
          : `${topic.marksLost} mark(s) lost — practise the mark-scheme wording and timed application for this topic.`,
    }));

  let headline: string;
  if (!relevantAttempts.length) {
    headline = "No marked answers from this paper sitting yet.";
  } else if (!marksLost) {
    headline = "No dropped marks were recorded on this paper sitting.";
  } else {
    headline = `This paper exposed ${marksLost} recoverable mark(s) across ${topicRows.filter((topic) => topic.marksLost > 0).length} weak topic(s).`;
  }

  return {
    paperId: input.paper.id,
    title: input.paper.title,
    subjectId: input.paper.subjectId,
    attempts: relevantAttempts.length,
    marksGained,
    marksAvailable,
    marksLost,
    accuracy,
    topics: topicRows,
    questions: questionRows,
    causes: causeRows(causes),
    commands: causeRows(commands),
    recommendations,
    headline,
  };
}
