import type { Attempt, Id, IsoInstant, Question, Topic } from "./types";

export type ApplicationEvidence = "unmeasured" | "emerging" | "reliable";

export interface ApplicationMasteryRow {
  topicId: Id;
  subjectId: Id;
  /** Mark-weighted application accuracy; recall-mode and provisional marks are excluded. */
  mastery: number;
  accuracy: number;
  recentAccuracy: number | null;
  marksAwarded: number;
  marksAvailable: number;
  attempts: number;
  questionsAttempted: number;
  averageDifficulty: number | null;
  lastAttemptAt: IsoInstant | null;
  evidence: ApplicationEvidence;
}

export interface ApplicationMasteryInput {
  topics: Topic[];
  questions: Question[];
  attempts: Attempt[];
}

interface Observation {
  awarded: number;
  max: number;
  createdAt: IsoInstant;
  difficulty: Question["difficulty"] | null;
  questionId: Id;
}

interface Accumulator {
  awarded: number;
  max: number;
  observations: Observation[];
}

export function computeApplicationMastery(input: ApplicationMasteryInput): ApplicationMasteryRow[] {
  const topicById = new Map(input.topics.map((topic) => [topic.id, topic]));
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const byTopic = new Map<Id, Accumulator>();

  for (const attempt of input.attempts) {
    if (attempt.mode === "recall" || attempt.max <= 0 || attempt.markEscalation?.status === "pending") continue;
    const topicIds = [...new Set(attempt.topicIds)].filter((topicId) => topicById.has(topicId));
    if (!topicIds.length) continue;
    const share = 1 / topicIds.length;
    const question = questionById.get(attempt.questionId);
    for (const topicId of topicIds) {
      const row = byTopic.get(topicId) ?? { awarded: 0, max: 0, observations: [] };
      row.awarded += attempt.awarded * share;
      row.max += attempt.max * share;
      row.observations.push({
        awarded: attempt.awarded * share,
        max: attempt.max * share,
        createdAt: attempt.createdAt,
        difficulty: question?.difficulty ?? null,
        questionId: attempt.questionId,
      });
      byTopic.set(topicId, row);
    }
  }

  return input.topics.map((topic) => {
    const row = byTopic.get(topic.id);
    const observations = [...(row?.observations ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const marksAvailable = round(row?.max ?? 0);
    const marksAwarded = round(row?.awarded ?? 0);
    const accuracy = marksAvailable ? round(marksAwarded / marksAvailable) : 0;
    const recent = observations.slice(-5);
    const recentMax = recent.reduce((sum, observation) => sum + observation.max, 0);
    const recentAccuracy = recent.length && recentMax ? round(recent.reduce((sum, observation) => sum + observation.awarded, 0) / recentMax) : null;
    const difficultyRows = observations.filter((observation) => observation.difficulty != null);
    const lastAttemptAt = observations.at(-1)?.createdAt ?? null;

    return {
      topicId: topic.id,
      subjectId: topic.subjectId,
      mastery: accuracy,
      accuracy,
      recentAccuracy,
      marksAwarded,
      marksAvailable,
      attempts: observations.length,
      questionsAttempted: new Set(observations.map((observation) => observation.questionId)).size,
      averageDifficulty: difficultyRows.length
        ? round(difficultyRows.reduce((sum, observation) => sum + (observation.difficulty ?? 0), 0) / difficultyRows.length)
        : null,
      lastAttemptAt,
      evidence: observations.length >= 10 ? "reliable" : observations.length ? "emerging" : "unmeasured",
    };
  });
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
