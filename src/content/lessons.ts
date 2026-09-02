// ---------------------------------------------------------------------------
// Lessons — learning from the very start.
//
// Flashcards are for *retaining* what you already half-know. Lessons are for
// the moment before that: the student opens the app for the first time, knows
// nothing about a topic, and needs a guided path through it. Each lesson is
// derived from the authored curriculum data (summary, key points, common
// errors, misconceptions) so it is real content, offline-first, and can never
// drift from the spec — the same contract the seed cards use.
//
// A lesson is a short sequence of steps: read a point, then answer one check
// question to move on. Steps are derived deterministically from the topic's
// authored data (same contract as seed cards: deterministic ids, no drift).
// ---------------------------------------------------------------------------

import type { Id, Topic } from "@/domain/types";
import { misconceptionsForTopic } from "@/content";

export interface LessonStep {
  id: Id;
  /** The teaching text the student reads. */
  body: string;
  /** Optional check question — the student must answer before moving on. */
  check?: {
    question: string;
    options: string[];
    correctIndex: number;
  };
}

export interface Lesson {
  id: Id;
  topicId: Id;
  subjectId: Id;
  title: string;
  /** Short intro shown before the first step. */
  intro: string;
  steps: LessonStep[];
  /** Deterministic id: `lesson:<topicId>` — re-derivation is idempotent. */
}

/** Build a full lesson for a topic from its authored data. Deterministic. */
export function buildLesson(topic: Topic): Lesson | null {
  if (!topic.keyPoints.length) return null;

  const steps: LessonStep[] = [];

  // Step 0: orient — what the topic is about, from the authored summary.
  steps.push({
    id: `lesson:${topic.id}:0`,
    body: topic.summary,
  });

  // One teaching step per key point, each closed by a check question built
  // from the point itself (the colon split used by seed cards keeps the
  // question and answer consistent with the cards the student will meet).
  topic.keyPoints.forEach((point, i) => {
    const { question, answer, distractors } = checkFromKeyPoint(topic, point, i);
    // Shuffle first, then record where the answer landed — recording the
    // index before shuffling would point at whatever option ended up first.
    const options = shuffleStable([answer, ...distractors], topic.id, i);
    steps.push({
      id: `lesson:${topic.id}:${i + 1}`,
      body: point,
      check: {
        question,
        options,
        correctIndex: options.indexOf(answer),
      },
    });
  });

  // Closing steps: the traps. Each common error is worth a step so the
  // student meets the traps *before* the exam does. Where there are enough
  // key points to stand as distractors, the trap is an active check — "which
  // of these would the examiner penalise?" — rather than passive reading.
  topic.commonErrors.forEach((error, i) => {
    const body = `Common trap: ${error}`;
    if (topic.keyPoints.length >= 3) {
      const options = shuffleStable([error, ...topic.keyPoints.slice(0, 3)], topic.id, 1000 + i);
      steps.push({
        id: `lesson:${topic.id}:err:${i}`,
        body,
        check: {
          question: `Examiners penalise one of these in ${topic.title.toLowerCase()} — which is the trap to avoid?`,
          options,
          correctIndex: options.indexOf(error),
        },
      });
    } else {
      steps.push({ id: `lesson:${topic.id}:err:${i}`, body });
    }
  });

  // Misconception steps: where the authored misconception library covers this
  // topic, meet the wrong belief head-on — what it is, why it fails, and a
  // check against the statements the examiner rewards.
  misconceptionsForTopic(topic.id).forEach((misconception, i) => {
    const options = shuffleStable(
      [misconception.statement, ...topic.keyPoints.slice(0, 3)],
      topic.id,
      2000 + i,
    );
    steps.push({
      id: `lesson:${topic.id}:mc:${i}`,
      body: `${misconception.explanation}\n\nExaminer's eye: ${misconception.example} — ${misconception.correction}`,
      check: {
        question: `Which of these is the wrong belief, not what the examiner rewards?`,
        options,
        correctIndex: options.indexOf(misconception.statement),
      },
    });
  });

  return {
    id: `lesson:${topic.id}`,
    topicId: topic.id,
    subjectId: topic.subjectId,
    title: topic.title,
    intro: `A short lesson on ${topic.title.toLowerCase()} — read each step, answer the checks, and the deck will stick.`,
    steps,
  };
}

/**
 * Score a finished lesson: how many checks were answered, how many correctly,
 * and the missed ones as (step body, correct answer) pairs for the summary
 * recap. Pure so the component stays thin and the logic stays testable.
 */
export function summariseLesson(
  lesson: Lesson,
  checked: Record<string, number>,
): { correct: number; total: number; missed: { body: string; answer: string }[] } {
  const checks = lesson.steps.filter((s) => s.check);
  const correct = checks.filter((s) => checked[s.id] === s.check!.correctIndex).length;
  const missed = checks
    .filter((s) => checked[s.id] !== s.check!.correctIndex)
    .map((s) => ({ body: s.body, answer: s.check!.options[s.check!.correctIndex] }));
  return { correct, total: checks.length, missed };
}

/**
 * Build one check question from a key point. Reuses the seed-card colon
 * convention: "X: Y" becomes "X — what follows?" with Y as the answer.
 */
function checkFromKeyPoint(topic: Topic, point: string, index: number): {
  question: string;
  answer: string;
  distractors: string[];
} {
  const colon = point.indexOf(":");
  if (colon > 12 && colon < point.length - 12) {
    return {
      question: `Complete the statement: ${point.slice(0, colon).trim()} — …`,
      answer: point.slice(colon + 1).trim(),
      distractors: distractorKeyPoints(topic, index),
    };
  }
  return {
    question: `True statement from ${topic.title} — which is it?`,
    answer: point,
    distractors: distractorKeyPoints(topic, index).concat(
      `Nothing in ${topic.title.toLowerCase()} depends on this.`,
    ),
  };
}

/** Other key points from the same topic serve as plausible distractors. */
function distractorKeyPoints(topic: Topic, excludeIndex: number): string[] {
  return topic.keyPoints
    .filter((_, i) => i !== excludeIndex)
    .slice(0, 2)
    .map((p) => (p.length > 80 ? p.slice(0, 77) + "…" : p));
}

/** Deterministic shuffle (no Math.random — same contract as seed cards). */
function shuffleStable(items: string[], topicId: Id, index: number): string[] {
  const arr = [...items];
  let h = 0;
  for (const ch of topicId + index) h = (h * 31 + ch.charCodeAt(0)) | 0;
  for (let i = arr.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) | 0;
    const j = Math.abs(h) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build lessons for a whole set of topics, skipping empty ones. */
export function buildLessons(topics: Topic[]): Lesson[] {
  return topics
    .map(buildLesson)
    .filter((l): l is Lesson => l !== null);
}

/** A suggested learning order: curriculum order (units/topics are ordered). */
export function lessonOrder(topics: Topic[]): Topic[] {
  return [...topics];
}

// Re-export for callers that want misconception context inside a lesson step.
export { misconceptionsForTopic };
