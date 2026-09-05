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
// A lesson is a short sequence of steps: read a point, retrieve it from memory,
// then answer one check question to move on. Steps are derived deterministically from the topic's
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
  /** Whether the explanation should be read as an ordered process or a concept. */
  explanationMode?: "concept" | "process";
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
    const pointExplanation = explainPoint(point);
    const { question, answer, distractors } = checkFromKeyPoint(topic, point, i);
    // Shuffle first, then record where the answer landed — recording the
    // index before shuffling would point at whatever option ended up first.
    const options = shuffleStable([answer, ...distractors], topic.id, i);
    steps.push({
      id: `lesson:${topic.id}:${i + 1}`,
      kind: "core",
      title: pointTitle(point, `Key idea ${i + 1}`),
      body: point,
      explanationSteps: pointExplanation.steps,
      explanationMode: pointExplanation.mode,
      takeaway: `Remember: ${sentence(point)}`,
      ...(topic.specPoints?.[i]?.text ? { examLink: topic.specPoints[i].text } : {}),
      check: {
        question,
        options,
        correctIndex: options.indexOf(answer),
        explanation: checkExplanation(pointExplanation, answer),
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

type ExplanationMode = "concept" | "process";

interface PointExplanation {
  mode: ExplanationMode;
  steps: string[];
}

interface ProcessClause {
  text: string;
  /** The connector immediately before this clause, if the author supplied one. */
  connector?: string;
}

/**
 * Verbs that normally describe a change, mechanism or exam procedure. This is
 * intentionally a small, conservative vocabulary: the helper may rearrange
 * punctuation, but it must never invent a scientific or mathematical fact.
 */
const PROCESS_ACTIONS = /\b(?:adds?|allows?|applies?|binds?|breaks?|carries?|causes?|changes?|checks?|chooses?|combines?|compares?|concludes?|converts?|decreases?|denatur(?:e|es|ed|ation)|detects?|diffuses?|divides?|drives?|enters?|exits?|falls?|flows?|forms?|generates?|halves?|holds?|identifies?|increases?|integrates?|joins?|leads?|limits?|loads?|measures?|moves?|names?|needs?|opens?|pairs?|pumps?|produces?|provides?|reaches?|releases?|removes?|requires?|retains?|returns?|rises?|separates?|shifts?|solves?|speeds?|splits?|state(?:s|d)?|stretches?|substitutes?|travels?|unloads?|uses?|writes?|yields?)\b/i;

/**
 * Turn one dense authored key point into a content-bearing explanation.
 *
 * The old fallback asked students to explain a rule without giving them the
 * rule's mechanism. Here, authored clauses are kept intact and labelled in
 * order. A process point therefore reads as a chain (condition → change →
 * result), while a definition still gets a concrete meaning and an exam use.
 */
function explainPoint(point: string): PointExplanation {
  const clean = point.replace(/\s+/g, " ").trim();
  const clauses = splitProcessClauses(clean);

  if (isProcessPoint(clean, clauses)) {
    return {
      mode: "process",
      steps: clauses.length > 1 ? formatProcessClauses(clauses) : processFallback(clean),
    };
  }

  return {
    mode: "concept",
    steps: conceptExplanation(clean),
  };
}

/** Split authored punctuation and causal connectors without changing words. */
function splitProcessClauses(text: string): ProcessClause[] {
  if (!text) return [];

  // A colon in an authored point is normally a heading followed by its
  // mechanism (for example, "Faraday: induced EMF ..."). Treat it like the
  // other visible process separators, but avoid short time/ratio labels.
  const marked = splitMarkedText(text);
  return marked
    .flatMap(expandTopLevelColon)
    .flatMap(expandProcessClause)
    .filter((clause) => clause.text.length > 0);
}

function expandTopLevelColon(clause: ProcessClause): ProcessClause[] {
  const colon = topLevelIndexOf(clause.text, ":");
  if (colon <= 18 || clause.text.length - colon <= 12) return [clause];
  return [
    { text: clause.text.slice(0, colon).trim(), connector: clause.connector },
    { text: clause.text.slice(colon + 1).trim(), connector: "colon" },
  ];
}

function splitMarkedText(text: string): ProcessClause[] {
  const marker = /(;|—|→|⇒|->|\s+then\s+|\s+therefore\s+|\s+so\s+(?!that\b)|\s+because\s+|\s+since\s+|\s+which\s+(?:means|causes)\s+)/gi;
  const clauses: ProcessClause[] = [];
  let cursor = 0;
  let connector: string | undefined;

  for (const match of text.matchAll(marker)) {
    const matchIndex = match.index ?? cursor;
    if (isInsideBalancedGroup(text, matchIndex)) continue;
    const chunk = text.slice(cursor, matchIndex).trim();
    if (chunk) clauses.push({ text: chunk, connector });
    connector = match[0].trim().toLowerCase();
    cursor = matchIndex + match[0].length;
  }

  const tail = text.slice(cursor).trim();
  if (tail) clauses.push({ text: tail, connector });
  return clauses.length ? clauses : [{ text: text.trim() }];
}

/** Expand comma-separated steps and independent clauses when they are real actions. */
function expandProcessClause(clause: ProcessClause): ProcessClause[] {
  const text = clause.text.replace(/\s+/g, " ").trim();
  if (!text || !PROCESS_ACTIONS.test(text)) return [{ ...clause, text }];

  const commaParts = splitTopLevelCommas(text)
    .map((part) => part.replace(/^(?:and|then)\s+/i, "").trim())
    .filter(Boolean);
  const parts = commaParts.length > 1 ? commaParts : [text];
  return parts.flatMap((part, index) =>
    splitIndependentAnd({
      text: part,
      connector: index === 0 ? clause.connector : "comma",
    }),
  );
}

function splitIndependentAnd(clause: ProcessClause): ProcessClause[] {
  const boundaries = [...clause.text.matchAll(/\s+and\s+/gi)].filter((boundary) =>
    !isInsideBalancedGroup(clause.text, boundary.index ?? 0),
  );
  if (!boundaries.length) return [clause];

  const pieces: ProcessClause[] = [];
  let cursor = 0;
  let connector = clause.connector;
  for (const boundary of boundaries) {
    const index = boundary.index ?? cursor;
    const left = clause.text.slice(cursor, index).trim();
    const right = clause.text.slice(index + boundary[0].length).trim();
    const firstRightWord = right.match(/^[A-Za-z][A-Za-z-]*/)?.[0] ?? "";
    const actionMatch = left.match(PROCESS_ACTIONS);
    const sharedSubject = actionMatch?.index && actionMatch.index > 0
      ? left.slice(0, actionMatch.index).trim()
      : "";
    const rightStartsAction = PROCESS_ACTIONS.test(firstRightWord);
    const independent =
      left.length > 0 &&
      right.length > 0 &&
      PROCESS_ACTIONS.test(left) &&
      PROCESS_ACTIONS.test(right) &&
      (!rightStartsAction || sharedSubject.length > 0);

    if (independent) {
      pieces.push({ text: left, connector });
      connector = "and";
      cursor = index + boundary[0].length;
      // Authors often omit a repeated subject in a compact process point:
      // "condensation forms a bond and releases water". Carry that subject
      // forward so the split remains a complete explanation rather than an
      // orphaned verb fragment.
      if (rightStartsAction && sharedSubject) {
        pieces.push({ text: `${sharedSubject} ${right}`, connector });
        return pieces;
      }
    }
  }

  const tail = clause.text.slice(cursor).trim();
  if (tail) pieces.push({ text: tail, connector });
  return pieces.length ? pieces : [clause];
}

/** Return a separator index only when it is outside brackets and inline maths. */
function topLevelIndexOf(text: string, separator: string): number {
  let depth = 0;
  let inMath = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "$" && text[index - 1] !== "\\") {
      inMath = !inMath;
      continue;
    }
    if (inMath) continue;
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(separator, index)) return index;
  }
  return -1;
}

/** Whether a candidate separator sits inside brackets or inline maths. */
function isInsideBalancedGroup(text: string, index: number): boolean {
  let depth = 0;
  let inMath = false;
  for (let cursor = 0; cursor < index; cursor += 1) {
    const character = text[cursor];
    if (character === "$" && text[cursor - 1] !== "\\") {
      inMath = !inMath;
      continue;
    }
    if (inMath) continue;
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}") depth = Math.max(0, depth - 1);
  }
  return inMath || depth > 0;
}

/** Split commas that separate authored clauses, not commas inside notation. */
function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "," || isInsideBalancedGroup(text, index)) continue;
    parts.push(text.slice(cursor, index));
    cursor = index + 1;
  }
  parts.push(text.slice(cursor));
  return parts;
}

function isProcessPoint(text: string, clauses: ProcessClause[]): boolean {
  if (clauses.length > 1) return true;
  // A comma-separated chain such as "condition, mechanism and outcome" is a
  // process even when the author did not use an arrow or semicolon.
  const hasTopLevelComma = splitTopLevelCommas(text).length > 1;
  const hasTopLevelMarker = splitMarkedText(text).length > 1;
  return (
    hasTopLevelMarker ||
    (PROCESS_ACTIONS.test(text) && hasTopLevelComma) ||
    (PROCESS_ACTIONS.test(text) && /\b(?:to|from|into|when|if|as|until)\b/i.test(text))
  );
}

function formatProcessClauses(clauses: ProcessClause[]): string[] {
  const total = clauses.length;
  return clauses.map((clause, index) => {
    const text = clause.text.replace(/^(?:and|then)\s+/i, "").replace(/[,:;]+$/, "").trim();
    const connector = clause.connector ?? "";
    const label = processLabel(text, connector, index, total);
    const arrowStage =
      connector === "→" &&
      index > 0 &&
      !/^[a-z]+\s+(?:is|are|was|were|has|have|needs?|uses?|forms?|changes?|moves?|goes?)\b/i.test(text) &&
      !/[=<>]/.test(text) &&
      text.split(/\s+/).length <= 5;
    const listRequirement =
      connector === "comma" &&
      !PROCESS_ACTIONS.test(text) &&
      !/[=<>]/.test(text) &&
      text.split(/\s+/).length <= 5;
    const readable = arrowStage
      ? `the next stage is ${text}`
      : listRequirement
        ? `also required: ${text}`
        : text;
    return `${label}: ${sentence(readable)}`;
  });
}

function processLabel(text: string, connector: string, index: number, total: number): string {
  const lower = text.toLowerCase();
  if (index === 0 && /^(?:when|if|above|below|at|under|after|before|once|as|during|without)\b/.test(lower)) {
    return "Condition";
  }
  if (/\b(?:because|since)\b/.test(connector)) return "Why";
  if (/\b(?:therefore|so|leading|resulting|causing|which)\b/.test(connector)) return "Result";
  if (/\bthen\b/.test(connector)) return "Next";
  if (index === 0) return "Start";
  if (index === total - 1 && total >= 3 && /\b(?:denatur\w*|produces?|releases?|returns?|concludes?|yields?|outcome|result)\b/i.test(lower)) {
    return "Result";
  }
  return total === 2 ? "Next" : `Step ${index + 1}`;
}

/** Use the first authored action to make a useful fallback for a one-clause process. */
function processFallback(text: string): string[] {
  const usesToConvert = text.match(/^(.+?)\s+uses\s+(.+?)\s+to\s+convert\s+(.+?)\s+into\s+(.+?)[.!?]?$/i);
  if (usesToConvert) {
    const [, subject, resource, input, output] = usesToConvert;
    return [
      `Start: ${sentence(subject)}`,
      `Input: ${sentence(`${resource} acts on ${input}`)}`,
      `Change: ${sentence(`${subject} uses ${resource} to convert ${input}`)}`,
      `Result: the output is ${sentence(output).toLowerCase()}`,
    ];
  }

  const converts = text.match(/^(.+?)\s+converts?\s+(.+?)\s+into\s+(.+?)[.!?]?$/i);
  if (converts) {
    const [, subject, input, output] = converts;
    return [
      `Start: ${sentence(subject)}`,
      `Input: ${sentence(input)}`,
      `Change: ${sentence(`${subject} converts ${input} into ${output}`)}`,
      `Result: the output is ${sentence(output).toLowerCase()}`,
    ];
  }

  const action = text.match(PROCESS_ACTIONS);
  if (action?.index && action.index > 0) {
    const subject = text.slice(0, action.index).trim();
    const change = text.slice(action.index).trim();
    return [
      `Start: ${sentence(subject)}`,
      `Change: ${sentence(`${subject} ${change}`)}`,
      `Result: ${sentence(text)}`,
    ];
  }
  return [
    `Process: ${sentence(text)}`,
    "Mechanism: keep the condition and the change together as you explain it.",
    `Result: ${sentence(text)}`,
  ];
}

function conceptExplanation(text: string): string[] {
  const authoredText = sentence(text);
  return [
    `Core idea: ${sentence(text)}`,
    "Notice the relationship: keep the condition, comparison or cause attached to the key term.",
    `Apply it: use the idea above — ${authoredText} — to explain a new example, not just to repeat the definition.`,
  ];
}

function checkExplanation(explanation: PointExplanation, answer: string): string {
  if (explanation.mode === "process") {
    return `Follow the process in order: ${explanation.steps.join(" → ")} Say it once in your own words, then connect it to the question before moving on.`;
  }
  return `The idea to keep is: ${sentence(answer)} Say it once in your own words, then connect it to the question before moving on.`;
}

/** The first meaningful clause is a useful, novice-friendly heading. */
function firstClause(text: string): string {
  const marker = /[:;—→⇒]|\s+(?:because|which|so|therefore)\s+/gi;
  for (const match of text.matchAll(marker)) {
    const cut = match.index ?? -1;
    if (cut > 12 && !isInsideBalancedGroup(text, cut)) {
      return text.slice(0, cut).replace(/[.!?]+$/, "").trim();
    }
  }
  return text.replace(/[.!?]+$/, "").trim();
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
  const pointExplanation = explainPoint(specPoint.text);
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
    explanation:
      pointExplanation.mode === "process"
        ? `Follow this checkpoint in order: ${pointExplanation.steps.join(" → ")} Connect it to the wider topic before moving on.`
        : `This checkpoint asks you to know: ${sentence(specPoint.text)} Connect it to the wider topic before moving on.`,
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
      const checkpointExplanation = explainPoint(specPoint.text);
      const sourceExplanation = sourceStep?.explanationSteps ?? [];
      const isProcess = sourceStep?.explanationMode === "process" || checkpointExplanation.mode === "process";
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
            ...(sourceExplanation.length ? sourceExplanation.slice(0, 3) : checkpointExplanation.steps.slice(0, 3)),
            "Say the complete idea once, including the condition or consequence the question asks for.",
          ],
          explanationMode: isProcess ? "process" : "concept",
          takeaway: `Remember: ${sentence(specPoint.text)}`,
          examLink,
          check: checkFromSpecPoint(topic, specPoint, index),
        },
        {
          id: `${lessonId}:apply`,
          kind: "core",
          title: "Use it in an exam answer",
          body: `When a question tests this checkpoint, start with the precise requirement: ${specPoint.text}`,
          explanationSteps: isProcess
            ? [
                "Read the process from its starting condition to the final result; keep every change in order.",
                ...checkpointExplanation.steps.slice(0, 3),
                "Finish by stating the result or consequence in the context of the question.",
              ]
            : [
                "Underline the command word so you answer the task, not just the topic.",
                `Use the checkpoint wording: ${specPoint.text}`,
                "Add the relevant mechanism, comparison, calculation or evidence if the question asks for it.",
              ],
          explanationMode: isProcess ? "process" : "concept",
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
