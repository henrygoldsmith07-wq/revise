import { todayIso } from "./scheduling";

import { assertBudgetNotExceeded, clampTargetMinutes, fitToBudget } from "./adaptive-budget";
import { emptyProfile } from "./capability-mastery";
import { deriveCapabilityProfiles } from "./capability-source";
import { readinessStopFor } from "./adaptive-stop";
import { selectLearningAction } from "./learning-action";

import { trustedAssessmentContent } from "./physics-content-review";

import type { Attempt, Id, Question } from "./types";

import type { AdaptiveSessionInput, AdaptiveSessionPlan } from "./adaptive-contract";
import { chooseIntervention, gapExtrasFor, interventionContextFor } from "./adaptive-intervention";
import { buildSteps, learningActionStep, reasonFor } from "./adaptive-sequence";
import { scoreTopic, trustedAdaptiveEvidence } from "./adaptive-scoring";
import { exposureWeights } from "./evidence-weights";
import { topicShares } from "./topic-weight";

/** Build the one best sequence for the next bounded study window. */
export function buildAdaptiveSession(input: AdaptiveSessionInput): AdaptiveSessionPlan | null {
  const nodes = input.capabilityNodes ?? [];
  const now = input.now ?? new Date();
  const today = todayIso(now);
  const targetMinutes = clampTargetMinutes(input.targetMinutes);
  const enrolled = input.subjectIds.length
    ? new Set(input.subjectIds)
    : new Set(input.topics.map((topic) => topic.subjectId));
  const topics = input.topics.filter((topic) => enrolled.has(topic.subjectId));
  if (!topics.length) return null;

  const profiles = deriveCapabilityProfiles({
    recallMastery: input.recallMastery ?? [],
    applicationMastery: input.applicationMastery ?? [],
    attempts: input.attempts,
    questions: input.questions,
    trustedQuestion: trustedAssessmentContent,
  });
  const cardsByTopic = groupBy(input.cards, (card) => card.topicId);
  const logsByTopic = groupBy(input.reviewLogs, (log) => log.topicId);
  const questionsByTopic = new Map<Id, Question[]>();
  for (const question of input.questions) {
    for (const topicId of question.topicIds) {
      const list = questionsByTopic.get(topicId) ?? [];
      list.push(question);
      questionsByTopic.set(topicId, list);
    }
  }
  const trustedEvidence = trustedAdaptiveEvidence({ attempts: input.attempts, mistakes: input.mistakes, questions: input.questions });
  const attemptsByTopic = new Map<Id, Attempt[]>();
  for (const attempt of trustedEvidence.attempts) {
    for (const topicId of attempt.topicIds) {
      const list = attemptsByTopic.get(topicId) ?? [];
      list.push(attempt);
      attemptsByTopic.set(topicId, list);
    }
  }
  const mistakesByTopic = groupBy(trustedEvidence.mistakes.filter((mistake) => !mistake.resolved), (mistake) => mistake.topicId);
  const masteryByTopic = new Map(input.mastery.map((row) => [row.topicId, row] as const));

  // Weight, repeat-recognition and supply are computed once over the whole history.
  const shares = topicShares(topics);
  const topicsPerSubject = new Map<Id, number>();
  for (const topic of topics) topicsPerSubject.set(topic.subjectId, (topicsPerSubject.get(topic.subjectId) ?? 0) + 1);
  const exposure = exposureWeights(input.attempts);
  const attemptedQuestionIds = new Set(input.attempts.map((attempt) => attempt.questionId));

  const proofByTopic = new Map((input.proofLedger?.topics ?? []).map((row) => [row.topicId, row] as const));

  const candidates = topics.map((topic) =>
    scoreTopic(topic, {
      proof: proofByTopic.get(topic.id),
      share: shares.get(topic.id) ?? 0,
      topicsInSubject: topicsPerSubject.get(topic.subjectId) ?? 1,
      exposure,
      attemptedQuestionIds,
      cards: cardsByTopic.get(topic.id) ?? [],
      reviewLogs: logsByTopic.get(topic.id) ?? [],
      questions: questionsByTopic.get(topic.id) ?? [],
      attempts: attemptsByTopic.get(topic.id) ?? [],
      mistakes: mistakesByTopic.get(topic.id) ?? [],
      mastery: masteryByTopic.get(topic.id),
      exams: input.exams,
      profile: profiles[topic.id] ?? emptyProfile(),
      today,
      now,
    }),
  );

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTopic = topics.find((topic) => topic.id === a.topicId);
    const bTopic = topics.find((topic) => topic.id === b.topicId);
    return (aTopic?.order ?? 0) - (bTopic?.order ?? 0) || a.topicId.localeCompare(b.topicId);
  });
  const selected = (input.topicId ? candidates.find((candidate) => candidate.topicId === input.topicId) : undefined) ?? candidates[0];
  if (!selected) return null;

  const topic = topics.find((candidate) => candidate.id === selected.topicId);
  if (!topic) return null;
  const questions = questionsByTopic.get(topic.id) ?? [];
  const mistakes = mistakesByTopic.get(topic.id) ?? [];
  // Keep all exposure history when avoiding a repeated question, while the
  // evidence passed to scoring and action selection remains trust-filtered.
  const attempts = input.attempts.filter((attempt) => attempt.topicIds.includes(topic.id));
  const profile = profiles[topic.id] ?? emptyProfile();
  const stop = readinessStopFor(input.readiness ?? [], topic.subjectId);
  const steps = buildSteps({ topic, selected, cards: cardsByTopic.get(topic.id) ?? [], questions, attempts, mistakes, profile, targetMinutes, stopTopicDone: stop.stop });
  const mapped = questions.some((q) => q.parts.some((p) => p.capabilityIds?.some((id) => nodes.some((n) => n.id === id))));
  const action = mapped ? selectLearningAction({ topicId: topic.id, nodes: nodes,
    questions: input.questions.filter(q => q.subjectId === topic.subjectId),
    attempts: input.attempts.filter(a => a.subjectId === topic.subjectId),
    mistakes, now, remainingMinutes: targetMinutes, interventionOutcomes: input.interventionOutcomes }) : undefined;
  if (mapped) {
    const retrieval = steps.filter((s) => s.kind === "overdue-retrieval" || s.kind === "delayed-retrieval");
    const delayed = retrieval.find((s) => s.kind === "delayed-retrieval");
    steps.splice(0, steps.length, ...retrieval.filter((s) => s.kind !== "delayed-retrieval"),
      ...(action ? [learningActionStep(action, topic.id, topic.subjectId, 0)] : []), ...(delayed ? [{ ...delayed, minutes: 1 }] : []));
    // The capability path replaces the fitted ladder wholesale, so it must be
    // fitted too: retrieval + the selected action + delayed retrieval cannot
    // collectively exceed the advertised session length.
    fitToBudget(steps, targetMinutes);
  }
  const totalMinutes = steps.reduce((sum, step) => sum + step.minutes, 0);
  assertBudgetNotExceeded(steps, targetMinutes, `buildAdaptiveSession:${topic.id}`);
  const startHref = `/adaptive-session?topic=${encodeURIComponent(topic.id)}&start=1`;
  const key = `${today}:${topic.id}`;
  const interventionContext = interventionContextFor({
    topic, selected, profile, questions, attempts, mistakes, share: shares.get(topic.id) ?? 0,
    allAttempts: input.attempts, reviewLogs: input.reviewLogs, now,
  });
  const intervention = chooseIntervention(
    interventionContext, targetMinutes,
    gapExtrasFor({ questions, attempts, daysToExam: selected.evidence.daysToExam, now }),
    totalMinutes,
  );

  return {
    key,
    subjectId: topic.subjectId,
    topicId: topic.id,
    topicTitle: topic.title,
    targetMinutes,
    totalMinutes,
    score: selected.score,
    reason: action?.reason ?? reasonFor(selected, topic.title),
    evidence: selected.evidence,
    steps,
    startHref,
    ...(intervention ? { intervention } : {}),
    ...(mapped ? { learningPolicy: "capability-evidence-v1" as const } : {}),
    ...(stop.stop && stop.reason ? { stoppedEarly: { reason: stop.reason } } : {}),
  };
}

function groupBy<T>(items: T[], key: (item: T) => Id): Map<Id, T[]> {
  const map = new Map<Id, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = map.get(id) ?? [];
    list.push(item);
    map.set(id, list);
  }
  return map;
}
