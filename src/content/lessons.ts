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
  /** The role this step plays in the explanation. */
  kind: "overview" | "core" | "trap" | "misconception";
  /** Short heading shown above the teaching text. */
  title: string;
  /** The authored teaching text the student reads. */
  body: string;
  /** Short, ordered chunks that turn a dense point into a guided explanation. */
  explanationSteps: string[];
  /** One sentence to repeat after reading the step. */
  takeaway: string;
  /** Optional link to the specification wording for this idea. */
  examLink?: string;
  /** Optional check question — the student must answer before moving on. */
  check?: {
    question: string;
    options: string[];
    correctIndex: number;
    /** Immediate feedback shown after the learner chooses an answer. */
    explanation: string;
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

/** A small, roadmap-sized lesson that focuses on one specification point. */
export interface RoadmapLesson extends Lesson {
  /** The full requirement this checkpoint teaches, used in the roadmap card. */
  focus: string;
  /** One-based position within the parent topic's checkpoints. */
  checkpointIndex: number;
  checkpointTotal: number;
}

export interface RoadmapLessonEntry {
  topic: Topic;
  lesson: RoadmapLesson;
}

/** Build a full lesson for a topic from its authored data. Deterministic. */
export function buildLesson(topic: Topic): Lesson | null {
  if (!topic.keyPoints.length) return null;

  const steps: LessonStep[] = [];

  // Step 0: orient — what the topic is about, from the authored summary.
  steps.push({
    id: `lesson:${topic.id}:0`,
    kind: "overview",
    title: "Start with the big picture",
    body: topic.summary,
    explanationSteps: [
      `Name the topic: ${topic.title}. The summary above is your map of what belongs together.`,
      "Next, learn one key idea at a time — each one builds the answer you will eventually write.",
      "At the end, explain the topic once without looking. That is how you know it has moved beyond recognition.",
    ],
    takeaway: `By the end, you should be able to explain ${topic.title.toLowerCase()} in your own words.`,
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
      kind: "core",
      title: pointTitle(point, `Key idea ${i + 1}`),
      body: point,
      explanationSteps: explainPoint(point),
      takeaway: `Remember: ${sentence(point)}`,
      ...(topic.specPoints?.[i]?.text ? { examLink: topic.specPoints[i].text } : {}),
      check: {
        question,
        options,
        correctIndex: options.indexOf(answer),
        explanation: `The idea to keep is: ${sentence(answer)} Say it once in your own words, then connect it to the question before moving on.`,
      },
    });
  });

  // Closing steps: the traps. Each common error is worth a step so the
  // student meets the traps *before* the exam does. Where there are enough
  // key points to stand as distractors, the trap is an active check — "which
  // of these would the examiner penalise?" — rather than passive reading.
  topic.commonErrors.forEach((error, i) => {
    const body = `Common trap: ${error}`;
    const correction = topic.keyPoints[Math.min(i, topic.keyPoints.length - 1)];
    if (topic.keyPoints.length >= 3) {
      const options = shuffleStable([error, ...topic.keyPoints.slice(0, 3)], topic.id, 1000 + i);
      steps.push({
        id: `lesson:${topic.id}:err:${i}`,
        kind: "trap",
        title: "Avoid this common trap",
        body,
        explanationSteps: [
          `Spot the risky wording: ${error}`,
          `Replace it with the precise idea: ${correction}`,
          "Before you submit an answer, check that the corrected wording is explicit — do not leave the examiner to infer it.",
        ],
        takeaway: `Check your answer for this trap: ${error}`,
        check: {
          question: `Examiners penalise one of these in ${topic.title.toLowerCase()} — which is the trap to avoid?`,
          options,
          correctIndex: options.indexOf(error),
          explanation: `Avoid this wording: ${error}. A safer answer makes the key idea explicit: ${correction}`,
        },
      });
    } else {
      steps.push({
        id: `lesson:${topic.id}:err:${i}`,
        kind: "trap",
        title: "Avoid this common trap",
        body,
        explanationSteps: [
          `Spot the risky wording: ${error}`,
          `Replace it with the precise idea: ${correction}`,
          "Before you submit an answer, check that the corrected wording is explicit.",
        ],
        takeaway: `Check your answer for this trap: ${error}`,
      });
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
      kind: "misconception",
      title: "Correct a common misunderstanding",
      body: `${misconception.explanation}\n\nExaminer's eye: ${misconception.example} — ${misconception.correction}`,
      explanationSteps: [
        `The tempting wrong idea: ${misconception.statement}`,
        `Why it fails: ${misconception.explanation}`,
        `What to say instead: ${misconception.correction}`,
      ],
      takeaway: `Use the corrected idea: ${misconception.correction}`,
      check: {
        question: `Which of these is the wrong belief, not what the examiner rewards?`,
        options,
        correctIndex: options.indexOf(misconception.statement),
        explanation: `That statement is the misconception. The examiner rewards this correction: ${misconception.correction}`,
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
): { correct: number; total: number; missed: { body: string; answer: string; explanation: string }[] } {
  const checks = lesson.steps.filter((s) => s.check);
  const correct = checks.filter((s) => checked[s.id] === s.check!.correctIndex).length;
  const missed = checks
    .filter((s) => checked[s.id] !== s.check!.correctIndex)
    .map((s) => ({
      body: s.body,
      answer: s.check!.options[s.check!.correctIndex],
      explanation: s.check!.explanation,
    }));
  return { correct, total: checks.length, missed };
}

/** Keep generated headings short enough to scan while retaining the authored wording. */
function pointTitle(point: string, fallback: string): string {
  const clause = firstClause(point);
  if (!clause) return fallback;
  return clause.length <= 72 ? clause : `${clause.slice(0, 69).trimEnd()}…`;
}

/** A compact sentence used in takeaways without changing the authored fact. */
function sentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return clean ? `${clean}.` : text;
}

/**
 * Turn one dense authored key point into an ordered explanation. Separators
 * are deliberately conservative: each chunk is still the author's wording,
 * so this helper can improve readability without inventing subject facts.
 */
function explainPoint(point: string): string[] {
  const clean = point.replace(/\s+/g, " ").trim();
  const colon = clean.indexOf(":");
  const colonParts = colon > 18 && clean.length - colon > 12
    ? [clean.slice(0, colon), clean.slice(colon + 1)]
    : [];
  const parts = colonParts.length
    ? colonParts
    : clean
        .split(/\s*(?:;|—|→)\s*|\s+(?:then|therefore)\s+/i)
        .map((part) => part.trim())
        .filter(Boolean);

  if (parts.length > 1) return parts.map((part) => sentence(part));

  return [
    "Say the rule in your own words before trying to memorise the wording.",
    "Ask yourself why this is true, or what changes because of it.",
    "Use the exact idea in a question before you move on.",
  ];
}

/** The first meaningful clause is a useful, novice-friendly heading. */
function firstClause(text: string): string {
  const cut = text.search(/[:;—→]|\s+(?:because|which|so|therefore)\s+/i);
  return (cut > 12 ? text.slice(0, cut) : text).replace(/[.!?]+$/, "").trim();
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

/** Remove duplicate answer choices while preserving authored order. */
function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean || seen.has(clean)) return false;
    seen.add(clean);
    return true;
  });
}

/** Build a check directly from one specification requirement. */
function checkFromSpecPoint(
  topic: Topic,
  specPoint: NonNullable<Topic["specPoints"]>[number],
  index: number,
): NonNullable<LessonStep["check"]> {
  const options = shuffleStable(
    uniqueStrings([
      specPoint.text,
      ...(topic.specPoints ?? []).filter((point) => point.id !== specPoint.id).map((point) => point.text),
      ...topic.keyPoints,
    ]).slice(0, 4),
    topic.id,
    3000 + index,
  );
  return {
    question: `Which statement matches this ${topic.title.toLowerCase()} checkpoint?`,
    options,
    correctIndex: options.indexOf(specPoint.text),
    explanation: `This checkpoint asks you to know: ${sentence(specPoint.text)} Connect it to the wider topic before moving on.`,
  };
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

/**
 * Expand the flat topic curriculum into a complete learning route.
 *
 * A topic is a useful chapter heading, but its specification points are the
 * actual checklist of things a student must know. The roadmap therefore gives
 * each spec point its own short lesson, while retaining the authored topic
 * lesson as the source of explanations and common traps. This makes a long
 * syllabus feel like a sequence of small, finishable steps rather than one
 * intimidating card per chapter.
 */
export function buildRoadmapLessons(topics: Topic[]): RoadmapLessonEntry[] {
  return topics.flatMap((topic) => {
    const base = buildLesson(topic);
    if (!base) return [];

    const specPoints = topic.specPoints?.filter((point) => point.text.trim().length > 0) ?? [];
    if (!specPoints.length) {
      return [
        {
          topic,
          lesson: {
            ...base,
            focus: topic.summary,
            checkpointIndex: 1,
            checkpointTotal: 1,
          },
        },
      ];
    }

    const coreSteps = base.steps.filter((step) => step.kind === "core");
    const misconceptions = misconceptionsForTopic(topic.id);

    return specPoints.map((specPoint, index) => {
      const checkpointIndex = index + 1;
      const lessonId = `${base.id}:checkpoint:${specPoint.id}`;
      const focusTitle = pointTitle(specPoint.text, `Checkpoint ${checkpointIndex}`);
      const sourceStep = coreSteps[index] ?? coreSteps[Math.max(0, coreSteps.length - 1)];
      const sourceBody = sourceStep?.body && sourceStep.body !== specPoint.text ? sourceStep.body : null;
      const examLink = [specPoint.ref ? `Spec ${specPoint.ref}` : null, specPoint.text].filter(Boolean).join(" — ");
      const steps: LessonStep[] = [
        {
          id: `${lessonId}:overview`,
          kind: "overview",
          title: "Know the target",
          body: `This checkpoint covers one requirement from ${topic.title}: ${specPoint.text}`,
          explanationSteps: [
            `Start with the requirement in plain English: ${specPoint.text}`,
            `Link it to the wider topic: ${topic.title}.`,
            "You will finish by saying the point back without looking.",
          ],
          takeaway: `I can explain ${specPoint.text.toLowerCase()}.`,
          examLink,
        },
        {
          id: `${lessonId}:core`,
          kind: "core",
          title: focusTitle,
          body: sourceBody ? `${specPoint.text}\n\nConnect it to this core idea: ${sourceBody}` : specPoint.text,
          explanationSteps: [
            `Translate the checkpoint into a sentence you would use in an answer: ${specPoint.text}`,
            ...(sourceStep?.explanationSteps?.slice(0, 2) ?? explainPoint(specPoint.text).slice(0, 2)),
            "Say the complete idea once, including the condition or consequence the question asks for.",
          ],
          takeaway: `Remember: ${sentence(specPoint.text)}`,
          examLink,
          check: checkFromSpecPoint(topic, specPoint, index),
        },
        {
          id: `${lessonId}:apply`,
          kind: "core",
          title: "Use it in an exam answer",
          body: `When a question tests this checkpoint, start with the precise requirement: ${specPoint.text}`,
          explanationSteps: [
            "Underline the command word so you answer the task, not just the topic.",
            `Use the checkpoint wording: ${specPoint.text}`,
            "Add the relevant mechanism, comparison, calculation or evidence if the question asks for it.",
          ],
          takeaway: `Exam habit: begin with ${sentence(specPoint.text)}`,
        },
      ];

      const error = topic.commonErrors[index % Math.max(1, topic.commonErrors.length)];
      if (error) {
        const trapOptions = shuffleStable(
          uniqueStrings([error, specPoint.text, ...topic.keyPoints]),
          topic.id,
          4000 + index,
        );
        steps.push({
          id: `${lessonId}:trap`,
          kind: "trap",
          title: "Avoid a common exam trap",
          body: `Common trap: ${error}`,
          explanationSteps: [
            `Spot the risky wording: ${error}`,
            `Replace it with the precise checkpoint: ${specPoint.text}`,
            "Before you submit, check that the corrected wording is explicit.",
          ],
          takeaway: `Check your answer for this trap: ${error}`,
          check: {
            question: `Which wording should you avoid when answering ${topic.title.toLowerCase()}?`,
            options: trapOptions,
            correctIndex: trapOptions.indexOf(error),
            explanation: `Avoid this wording: ${error}. Keep the requirement precise: ${specPoint.text}`,
          },
        });
      }

      const misconception = misconceptions[index];
      if (misconception) {
        const options = shuffleStable(
          uniqueStrings([misconception.statement, specPoint.text, ...topic.keyPoints]),
          topic.id,
          5000 + index,
        );
        steps.push({
          id: `${lessonId}:misconception`,
          kind: "misconception",
          title: "Correct a common misunderstanding",
          body: `${misconception.explanation}\n\nExaminer's eye: ${misconception.example} — ${misconception.correction}`,
          explanationSteps: [
            `The tempting wrong idea: ${misconception.statement}`,
            `Why it fails: ${misconception.explanation}`,
            `What to say instead: ${misconception.correction}`,
          ],
          takeaway: `Use the corrected idea: ${misconception.correction}`,
          check: {
            question: "Which statement is the misconception, not what the examiner rewards?",
            options,
            correctIndex: options.indexOf(misconception.statement),
            explanation: `That statement is the misconception. The examiner rewards: ${misconception.correction}`,
          },
        });
      }

      return {
        topic,
        lesson: {
          id: lessonId,
          topicId: topic.id,
          subjectId: topic.subjectId,
          title: focusTitle,
          intro: `Checkpoint ${checkpointIndex} of ${specPoints.length} for ${topic.title}: read the explanation, apply it, and pass the quick checks.`,
          steps,
          focus: specPoint.text,
          checkpointIndex,
          checkpointTotal: specPoints.length,
        },
      };
    });
  });
}

/** A suggested learning order: curriculum order (units/topics are ordered). */
export function lessonOrder(topics: Topic[]): Topic[] {
  return [...topics];
}

// Re-export for callers that want misconception context inside a lesson step.
export { misconceptionsForTopic };
