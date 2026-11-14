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
import { misconceptionsForTopic } from "@/content/misconceptions";
import { teachingFor, type CheckpointTeaching } from "@/content/teaching";

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
  /** The observable capability this step is meant to build. */
  objective?: string;
  /** A small, answer-hidden application so the learner must use the idea. */
  application?: LessonApplication;
  /** Exam-writing move to practise for this step, when one is identifiable. */
  examTechnique?: string;
  /** One sentence to repeat after reading the step. */
  takeaway: string;
  /** Optional link to the specification wording for this idea. */
  examLink?: string;
  /**
   * The one thing this step asks the student to do. Unset keeps the original
   * shape (a typed recall, then any check and application). Authored lessons
   * set it, so each step has a single task that fits its role:
   *   "check"  answer the check question; no typed recall of text still on screen
   *   "worked" reveal the worked example a step at a time
   *   "apply"  write an answer, then compare it with the model and checklist
   *   "reveal" say what you already know, then show the step's points
   *   "read"   nothing to retrieve (an outline with no key point on it)
   */
  task?: "check" | "worked" | "apply" | "reveal" | "read";
  /** The final answer of a "worked" step, shown after its last step. */
  workedAnswer?: string;
  /** Optional check question — the student must answer before moving on. */
  check?: {
    question: string;
    options: string[];
    correctIndex: number;
    /** Immediate feedback shown after the learner chooses an answer. */
    explanation: string;
  };
}

export interface LessonApplication {
  /** Prompt shown before the learner reveals the model response. */
  prompt: string;
  /** Authored answer assembled from the same curriculum evidence as the step. */
  modelAnswer: string;
  /** Short checklist for self-marking, not a second hidden mark scheme. */
  successCriteria: string[];
  /** The command word or answer shape the learner should practise. */
  commandWord?: string;
}

export interface Lesson {
  id: Id;
  topicId: Id;
  subjectId: Id;
  title: string;
  /** Short intro shown before the first step. */
  intro: string;
  steps: LessonStep[];
  /** Explicit success criteria shown before the student starts. */
  learningObjectives?: string[];
  /** Honest, bounded estimate for a complete guided pass. */
  estimatedMinutes?: number;
  /** What to carry away, when the lesson says so itself; otherwise the core steps' takeaways. */
  recap?: string[];
  /**
   * True when no teaching has been written for this checkpoint: the steps are
   * assembled from the specification wording, so the page must say it is an
   * outline rather than present it as teaching.
   */
  outline?: boolean;
  /**
   * Set on every lesson taught from src/content/teaching. That teaching is
   * written by Revise and no teacher has reviewed it (there is no review
   * path for lessons yet), so the lesson page and roadmap say so. Nothing
   * may set another value until a real review is recorded.
   */
  teachingReview?: "not-teacher-reviewed";
  /** Deterministic id: `lesson:<topicId>` — re-derivation is idempotent. */
}

/** A small, roadmap-sized lesson that focuses on one specification point. */
export interface RoadmapLesson extends Lesson {
  /** The full requirement this checkpoint teaches, used in the roadmap card. */
  focus: string;
  /** One-based position within the parent topic's checkpoints. */
  checkpointIndex: number;
  checkpointTotal: number;
  /** The specification point this checkpoint teaches; absent for a topic with none. */
  specPointId?: Id;
}

export interface RoadmapLessonEntry {
  topic: Topic;
  lesson: RoadmapLesson;
}

/**
 * Pick the strongest authored source available for a lesson.
 *
 * Most topics have dedicated key points, but the curriculum contract also
 * permits a specification-only topic. Those topics must not disappear from
 * the roadmap: the specification statement is still enough to build a small,
 * honest lesson. A summary is the final safety net for an authored topic that
 * has neither list populated.
 */
function authoredKeyPoints(topic: Topic): string[] {
  const keyPoints = uniqueStrings(topic.keyPoints);
  if (keyPoints.length) return keyPoints;

  const specificationPoints = uniqueStrings(
    (topic.specPoints ?? []).map((point) => point.text),
  );
  if (specificationPoints.length) return specificationPoints;

  const summary = topic.summary.replace(/\s+/g, " ").trim();
  return summary ? [summary] : [];
}

/** Build a full lesson for a topic from its authored data. Deterministic. */
export function buildLesson(topic: Topic): Lesson | null {
  const keyPoints = authoredKeyPoints(topic);
  if (!keyPoints.length) return null;

  const steps: LessonStep[] = [];
  const learningObjectives = buildLearningObjectives(topic);
  const estimatedMinutes = estimateLessonMinutes(topic);

  // Step 0: orient — what the topic is about, from the authored summary.
  steps.push({
    id: `lesson:${topic.id}:0`,
    kind: "overview",
    title: "Start with the big picture",
    body: topic.summary,
    objective: `See how ${topic.title.toLowerCase()} fits together before learning the individual details.`,
    explanationSteps: [
      `Name the topic: ${topic.title}. The summary above is your map of what belongs together.`,
      "Next, learn one key idea at a time — each one builds the answer you will eventually write.",
      "You will retrieve the idea, apply it to an exam-style prompt, and then check the wording before moving on.",
    ],
    takeaway: `By the end, you should be able to explain ${topic.title.toLowerCase()} in your own words.`,
  });

  // One teaching step per key point, each closed by a check question built
  // from the point itself (the colon split used by seed cards keeps the
  // question and answer consistent with the cards the student will meet).
  keyPoints.forEach((point, i) => {
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
      objective: objectiveForPoint(point, false),
      explanationSteps: pointExplanation.steps,
      explanationMode: pointExplanation.mode,
      application: buildApplication(topic, point, pointExplanation, undefined, "understand"),
      examTechnique: examTechniqueFor(point),
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
    const correction = keyPoints[Math.min(i, keyPoints.length - 1)];
    if (keyPoints.length >= 3) {
      const options = shuffleStable([error, ...keyPoints.slice(0, 3)], topic.id, 1000 + i);
      steps.push({
        id: `lesson:${topic.id}:err:${i}`,
        kind: "trap",
        title: "Avoid this common trap",
        body,
        objective: `Spot and correct this recurring error: ${error}`,
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
        objective: `Spot and correct this recurring error: ${error}`,
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
      [misconception.statement, ...keyPoints.slice(0, 3)],
      topic.id,
      2000 + i,
    );
    steps.push({
      id: `lesson:${topic.id}:mc:${i}`,
      kind: "misconception",
      title: "Correct a common misunderstanding",
      body: `${misconception.explanation}\n\nExaminer's eye: ${misconception.example} — ${misconception.correction}`,
      objective: `Replace the tempting wrong idea with the explanation an examiner can credit.`,
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
    intro: buildLessonIntro(topic, learningObjectives, estimatedMinutes),
    steps,
    learningObjectives,
    estimatedMinutes,
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
      // A step whose task is its check is remembered by the question asked.
      body: s.task === "check" ? s.check!.question : s.body,
      answer: s.check!.options[s.check!.correctIndex],
      explanation: s.check!.explanation,
    }));
  return { correct, total: checks.length, missed };
}

/** Keep generated headings short enough to scan while retaining the authored wording. */
function pointTitle(point: string, fallback: string): string {
  const clause = firstClause(point);
  if (!clause) return fallback;
  if (clause.length <= 72) return clause;
  // Cut at a word, not through one ("…into perpendicu…").
  const cut = clause.slice(0, 70);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut.slice(0, 69)).replace(/[\s,;:(]+$/, "")}…`;
}

const NOT_A_VERB = new Set(["sin", "cos", "tan", "log", "exp"]);

/**
 * A specification statement is a verb phrase ("distinguish scalars from…"),
 * so as a lesson title it starts with a capital. Only a plain lower-case
 * first word is changed: "pH", "mRNA" and symbols are left as written.
 */
function statementTitle(point: string, fallback: string): string {
  const title = pointTitle(point, fallback);
  const first = /^[a-z]{3,}(?=[\s,])/.exec(title)?.[0];
  return first && !NOT_A_VERB.has(first) ? title.charAt(0).toUpperCase() + title.slice(1) : title;
}

/** A compact sentence used in takeaways without changing the authored fact. */
function sentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return clean ? `${clean}.` : text;
}

const COMMAND_WORDS = [
  "show that",
  "state",
  "describe",
  "explain",
  "compare",
  "calculate",
  "suggest",
  "evaluate",
  "discuss",
  "justify",
  "deduce",
  "predict",
  "outline",
  "distinguish",
  "identify",
  "interpret",
  "relate",
  "apply",
  "derive",
  "demonstrate",
  "use",
] as const;

/**
 * Turn the authored requirements into success criteria the learner can see
 * before starting. The wording is deliberately conservative: it reframes the
 * source, but never adds a new scientific or mathematical claim.
 */
function buildLearningObjectives(topic: Topic): string[] {
  const requirements = [
    ...(topic.specPoints ?? []).map((point) => objectiveForPoint(point.text, true)),
    ...authoredKeyPoints(topic).map((point) => objectiveForPoint(point, false)),
  ];
  return uniqueStrings(requirements).slice(0, 5);
}

function objectiveForPoint(text: string, specStatement: boolean): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  if (!clean) return "Explain the idea clearly and use it in context.";
  const lower = clean.charAt(0).toLowerCase() + clean.slice(1);
  if (/^be able to\b/i.test(clean)) return `${clean}.`;
  // Spec statements are verb phrases ("define capacitance…", "recall…",
  // "analyse…"); the command-word list missed most of those verbs, so 143 of
  // 450 WJEC objectives read "Explain that define …" (thirty-first pass).
  // A spec statement with a lower-case start is a verb phrase, as in
  // takeawayForPoint. Authored key points are sentences ("suvat applies…",
  // "sin²θ + cos²θ = 1…"), so only the command-word test applies to them.
  if ((specStatement && /^[a-z]/.test(clean)) || STARTS_WITH_COMMAND_WORD.test(clean)) {
    return `Be able to ${lower}.`;
  }
  return `Explain that ${lower}.`;
}

const STARTS_WITH_COMMAND_WORD = new RegExp(`^(?:${COMMAND_WORDS.map((word) => word.replace(" ", "\\s+")).join("|")})\\b`, "i");

function estimateLessonMinutes(topic: Topic): number {
  const core = Math.max(1, authoredKeyPoints(topic).length);
  const support = Math.min(4, topic.commonErrors.length) + Math.min(3, misconceptionsForTopic(topic.id).length);
  return Math.max(8, Math.min(20, 5 + Math.ceil(core * 1.5) + support));
}

function buildLessonIntro(topic: Topic, objectives: string[], minutes: number): string {
  const firstObjective = objectives[0] ?? `explain ${topic.title.toLowerCase()} in your own words`;
  return [
    `In about ${minutes} minutes, you will build a usable understanding of ${topic.title}.`,
    `Success looks like this: ${firstObjective}`,
    "The rhythm is understand → retrieve → apply → check. Try the answer before revealing the model response.",
  ].join("\n\n");
}

type ApplicationPurpose = "understand" | "exam";

/** Build an answer-hidden application from authored evidence only. */
function buildApplication(
  topic: Topic,
  point: string,
  explanation: PointExplanation,
  specPoint?: NonNullable<Topic["specPoints"]>[number],
  purpose: ApplicationPurpose = "understand",
  supportingExplanation: string[] = [],
): LessonApplication {
  const commandWord = commandWordForText(specPoint?.text ?? point);
  // Keep the checkpoint explanation as the spine even when a related key
  // point is available. Supporting evidence enriches the answer; it must not
  // replace the requirement and accidentally turn the model answer into a
  // response to a different question.
  const modelLines = uniqueStrings([...explanation.steps, ...supportingExplanation]).slice(0, 6);
  const modelAnswer = modelLines.map(stripExplanationLabel).join("\n");
  const successCriteria = uniqueStrings(
    modelLines.map(stripExplanationLabel).concat(
      explanation.mode === "process"
        ? ["Keep the starting condition, each change and the final result in the correct order."]
        : ["State the idea precisely, then link it to the condition, comparison or consequence in the question."],
    ),
  ).slice(0, 5);

  const prompt = purpose === "exam"
    ? `Write a complete answer for this checkpoint: ${sentence(point)} Include the key term and the link that makes the claim convincing.`
    : explanation.mode === "process"
      ? `Without looking back, teach ${topic.title.toLowerCase()} by walking through this process: ${sentence(point)} Include the starting condition, the changes and the result.`
      : `Use this idea in a new ${topic.title.toLowerCase()} question. Write one sentence that states the idea and one that links it to a condition or consequence: ${pointTitle(point, "the key idea")}.`;

  return {
    prompt,
    modelAnswer,
    successCriteria,
    ...(commandWord ? { commandWord } : {}),
  };
}

function stripExplanationLabel(text: string): string {
  return text.replace(/^(?:Start|Condition|Input|Change|Next|Step \d+|Result|Why|Process|Mechanism|Core idea|Notice the relationship|Apply it|also required):\s*/i, "").trim();
}

function commandWordForText(text: string): string | undefined {
  const clean = text.trim().toLowerCase();
  return COMMAND_WORDS.find((word) => new RegExp(`^${word.replace(" ", "\\s+")}\\b`, "i").test(clean));
}

function examTechniqueFor(text: string): string {
  switch (commandWordForText(text)) {
    case "state":
      return "State means be exact and concise: give the fact the question asks for, without an unnecessary explanation.";
    case "describe":
      return "Describe means report the relevant features or sequence. Do not replace observations with an unsupported reason.";
    case "explain":
      return "Explain means make the link explicit: connect the cause, mechanism or evidence to the result with because or therefore.";
    case "compare":
      return "Compare both sides and make the relationship explicit using words such as whereas, higher, lower or similar.";
    case "calculate":
      return "Calculate means show the method, substitute carefully, give the result and include a unit where one applies.";
    case "evaluate":
      return "Evaluate the evidence or limitation, balance the strongest points, then finish with a clear judgement.";
    case "justify":
      return "Justify the claim with an explicit reason; do not leave the examiner to infer why your choice follows.";
    case "show that":
      return "Show the working that leads to the stated result, then make the final result visible and unambiguous.";
    case "distinguish":
      return "Distinguish the two ideas by naming the feature that separates them; do not describe only one side.";
    case "identify":
      return "Identify the exact feature or value requested before adding any explanation.";
    case "interpret":
      return "Interpret the evidence first, then link the pattern to the relevant idea or conclusion.";
    case "relate":
      return "Relate the named feature to its function or consequence; make the connection explicit.";
    case "apply":
      return "Apply the rule to the new context, showing which details in the question trigger it.";
    case "derive":
      return "Derive the result in clear steps so each transformation can be checked.";
    case "demonstrate":
      return "Demonstrate the claim with the relevant evidence or working, then state what it shows.";
    case "use":
      return "Use the given information, not a memorised answer, and make the link to the question explicit.";
    default:
      return "Use the exact subject vocabulary from the explanation and answer the command word before adding extra detail.";
  }
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
  return authoredKeyPoints(topic)
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

function meaningfulTerms(text: string): string[] {
  const stopWords = new Set([
    "and", "the", "for", "from", "with", "including", "into", "this", "that", "when", "where", "how", "what", "why",
    "describe", "explain", "state", "compare", "calculate", "identify", "interpret", "distinguish", "outline", "use", "apply",
  ]);
  return [...new Set(
    text
      .toLowerCase()
      .replace(/\$[^$]+\$/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !stopWords.has(word)),
  )];
}

function relatedTerm(left: string, right: string): boolean {
  if (left === right) return true;
  const singularLeft = left.endsWith("s") ? left.slice(0, -1) : left;
  const singularRight = right.endsWith("s") ? right.slice(0, -1) : right;
  return singularLeft === singularRight || singularLeft.startsWith(singularRight) || singularRight.startsWith(singularLeft);
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

/** Build lessons for every topic with at least one authored source field. */
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

    const misconceptions = misconceptionsForTopic(topic.id);

    return specPoints.map((specPoint, index) => {
      const checkpointIndex = index + 1;
      const lessonId = `${base.id}:checkpoint:${specPoint.id}`;
      const focusTitle = statementTitle(specPoint.text, `Checkpoint ${checkpointIndex}`);
      const teaching = teachingFor(specPoint.id);
      if (teaching) {
        return {
          topic,
          lesson: authoredCheckpointLesson({ topic, specPoint, teaching, lessonId, focusTitle, checkpointIndex, checkpointTotal: specPoints.length }),
        };
      }
      return {
        topic,
        lesson: outlineCheckpointLesson({
          topic,
          specPoint,
          lessonId,
          focusTitle,
          checkpointIndex,
          checkpointTotal: specPoints.length,
          misconceptions,
        }),
      };
    });
  });
}

/** How many of a requirement's meaningful terms a piece of authored text shares. */
function relevanceTo(requirement: string, text: string): number {
  const target = meaningfulTerms(requirement);
  const candidate = meaningfulTerms(text);
  return target.reduce((total, term) => total + (candidate.some((word) => relatedTerm(word, term)) ? 1 : 0), 0);
}

/** The authored items that bear on a requirement (two shared terms, or every term of a short one), best first. */
function bearingOn<T>(requirement: string, items: readonly T[], text: (item: T) => string): T[] {
  const needed = Math.min(2, meaningfulTerms(requirement).length);
  if (!needed) return [];
  return items
    .map((item, index) => ({ item, index, score: relevanceTo(requirement, text(item)) }))
    .filter((row) => row.score >= needed)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}

/**
 * A checkpoint Revise has written no teaching for. It used to be built from
 * the specification wording alone and dressed as a full lesson: a "model
 * answer" that was the statement plus stock phrases ("keep the condition,
 * comparison or cause attached to the key term"), a check that asked which
 * statement was this checkpoint's title, and a trap and a misconception
 * attached by list position (in WJEC Chemistry the trap shared no word with
 * its point in 77 of 108 lessons). It now shows only what Revise has:
 *   - what the specification asks, and the topic's authored key points that
 *     bear on it, after the student has said what they already know;
 *   - the usual mistake and the misconception, only when one bears on this
 *     point, as a decision rather than printed above the question;
 * and the summary hands on to an exam question on the point.
 */
function outlineCheckpointLesson(input: {
  topic: Topic;
  specPoint: NonNullable<Topic["specPoints"]>[number];
  lessonId: string;
  focusTitle: string;
  checkpointIndex: number;
  checkpointTotal: number;
  misconceptions: ReturnType<typeof misconceptionsForTopic>;
}): RoadmapLesson {
  const { topic, specPoint, lessonId, focusTitle, checkpointIndex, checkpointTotal, misconceptions } = input;
  const requirement = specPoint.text;
  const objective = objectiveForPoint(requirement, true);
  const keyPoints = uniqueStrings(topic.keyPoints);
  const bearing = bearingOn(requirement, keyPoints, (point) => point).slice(0, 3);
  const trap = bearingOn(requirement, topic.commonErrors, (error) => error)[0];
  const misconception = bearingOn(requirement, misconceptions, (m) => `${m.statement} ${m.correction}`)[0];

  const steps: LessonStep[] = [
    {
      id: `${lessonId}:core`,
      kind: "core",
      title: focusTitle,
      // The requirement is said once, with its reference; the title and the
      // success criteria above already name it.
      body: bearing.length
        ? `What the specification asks${specPoint.ref ? ` (${specPoint.ref})` : ""}: ${sentence(requirement)}`
        : `What the specification asks${specPoint.ref ? ` (${specPoint.ref})` : ""}: ${sentence(requirement)}\n\nRevise has no teaching or key point written for this yet. Learn it from your notes or textbook, then try a question on it.`,
      explanationSteps: bearing,
      explanationMode: "concept",
      takeaway: bearing[0] ?? sentence(requirement),
      task: bearing.length ? "reveal" : "read",
    },
  ];

  if (trap) {
    // True statements from the topic beside the mistake: the ones on this point first.
    const truths = uniqueStrings([...bearing, ...keyPoints]).filter((point) => point !== trap).slice(0, 3);
    if (truths.length) {
      const options = shuffleStable([trap, ...truths], topic.id, 4000 + checkpointIndex);
      steps.push({
        id: `${lessonId}:trap`,
        kind: "trap",
        title: "Spot the usual mistake",
        body: `One of these is a mistake examiners often see in ${topic.title}. The others are key points. Decide which is the mistake before you read on.`,
        explanationSteps: [],
        takeaway: `Watch for: ${trap}`,
        check: {
          question: "Which of these is the mistake?",
          options,
          correctIndex: options.indexOf(trap),
          explanation: `That is the usual mistake. The other options are key points from ${topic.title}.`,
        },
        task: "check",
      });
    }
  }

  if (misconception) {
    const options = shuffleStable(
      uniqueStrings([misconception.statement, misconception.correction, ...bearing]).slice(0, 4),
      topic.id,
      5000 + checkpointIndex,
    );
    steps.push({
      id: `${lessonId}:misconception`,
      kind: "misconception",
      title: "Spot the misconception",
      body: "One of these is a common misunderstanding. Decide which before you read on.",
      explanationSteps: [],
      takeaway: `Say instead: ${misconception.correction}`,
      check: {
        question: "Which of these is the misconception?",
        options,
        correctIndex: options.indexOf(misconception.statement),
        explanation: `${misconception.explanation} What is credited instead: ${misconception.correction}`,
      },
      task: "check",
    });
  }

  const minutes = Math.max(3, 2 + bearing.length + (steps.length - 1) * 2);
  const parts = [
    "what the specification asks",
    ...(bearing.length ? ["the key points Revise has on it"] : []),
    ...(steps.length > 1 ? ["the usual mistake"] : []),
  ];
  return {
    id: lessonId,
    topicId: topic.id,
    subjectId: topic.subjectId,
    title: focusTitle,
    intro: `Checkpoint ${checkpointIndex} of ${checkpointTotal}. ${topic.title}, about ${minutes} minutes: ${parts.join(", ")}, then a question to try.`,
    steps,
    learningObjectives: [objective],
    estimatedMinutes: minutes,
    recap: [
      ...(bearing.length ? bearing.slice(0, 2) : [sentence(requirement)]),
      ...(trap ? [`Watch for: ${trap}`] : []),
    ],
    focus: requirement,
    checkpointIndex,
    checkpointTotal,
    specPointId: specPoint.id,
    outline: true,
  };
}

/**
 * A checkpoint taught from authored content (src/content/teaching): the
 * explanation, a worked example, a check on the physics itself, an exam-style
 * task with a real model answer, and the trap that belongs to this point.
 */
function authoredCheckpointLesson(input: {
  topic: Topic;
  specPoint: { id: string; text: string; ref?: string };
  teaching: CheckpointTeaching;
  lessonId: string;
  focusTitle: string;
  checkpointIndex: number;
  checkpointTotal: number;
}): RoadmapLesson {
  const { topic, specPoint, teaching, lessonId, focusTitle, checkpointIndex, checkpointTotal } = input;
  const examLink = [specPoint.ref ? `Spec ${specPoint.ref}` : null, specPoint.text].filter(Boolean).join(" — ");
  const objective = objectiveForPoint(specPoint.text, true);
  // Each step has one task. The lesson used to open on a screen that only
  // restated the specification point (five times) and asked for it to be
  // "recalled" before anything had been taught, and every later step asked
  // for the same typed "key idea" beside its real task. Now: the idea and a
  // check on it, a worked example a step at a time, then an exam question to
  // answer before the model is shown.
  const steps: LessonStep[] = [
    {
      id: `${lessonId}:core`,
      kind: "core",
      title: focusTitle,
      body: teaching.explain[0]!,
      explanationSteps: teaching.explain.slice(1),
      explanationMode: "concept",
      takeaway: teaching.explain[0]!,
      examLink,
      check: teaching.check,
      task: "check",
    },
    {
      id: `${lessonId}:worked`,
      kind: "core",
      title: "Worked example",
      body: teaching.worked.prompt,
      explanationSteps: teaching.worked.steps,
      explanationMode: "process",
      takeaway: `Answer: ${teaching.worked.answer}`,
      task: "worked",
      workedAnswer: teaching.worked.answer,
    },
    {
      id: `${lessonId}:apply`,
      kind: "core",
      title: "Now you: an exam question",
      body: teaching.apply.prompt,
      explanationSteps: [],
      application: {
        prompt: teaching.apply.prompt,
        modelAnswer: teaching.apply.modelAnswer,
        successCriteria: teaching.apply.successCriteria,
      },
      examTechnique: examTechniqueFor(teaching.apply.prompt),
      takeaway: teaching.apply.successCriteria.join("; "),
      task: "apply",
    },
  ];
  if (teaching.trap) {
    const options = shuffleStable([teaching.trap.right, teaching.trap.wrong], specPoint.id, 4000 + checkpointIndex);
    steps.push({
      id: `${lessonId}:trap`,
      kind: "trap",
      title: "Spot the usual mistake",
      // The answer is not printed above the question any more: the student
      // decides first, and the explanation follows the choice.
      body: "One of these is the mistake examiners see most on this point. Decide which is right before you read on.",
      explanationSteps: [],
      takeaway: teaching.trap.right,
      check: {
        question: "Which of these is the correct approach?",
        options,
        correctIndex: options.indexOf(teaching.trap.right),
        explanation: `${teaching.trap.right} The other option is the usual mistake.`,
      },
      task: "check",
    });
  }
  const minutes = Math.max(8, Math.min(15, 3 + teaching.explain.length + teaching.worked.steps.length + (teaching.trap ? 1 : 0)));
  return {
    id: lessonId,
    topicId: topic.id,
    subjectId: topic.subjectId,
    title: focusTitle,
    intro: `Checkpoint ${checkpointIndex} of ${checkpointTotal}. ${topic.title}, about ${minutes} minutes: the idea, a worked example, then an exam question you answer before seeing the model.`,
    steps,
    learningObjectives: [objective],
    estimatedMinutes: minutes,
    recap: [teaching.explain[0]!, ...(teaching.trap ? [`Watch for: ${teaching.trap.right}`] : [])],
    focus: specPoint.text,
    checkpointIndex,
    checkpointTotal,
    specPointId: specPoint.id,
    teachingReview: "not-teacher-reviewed",
  };
}

/** The roadmap entry a deep link opens: the named checkpoint, else the topic's first, else none (-1). */
export function roadmapLessonIndex(lessons: readonly RoadmapLessonEntry[], topicId?: string, checkpointId?: string): number {
  if (!topicId) return -1;
  if (checkpointId) {
    const exact = lessons.findIndex((entry) => entry.topic.id === topicId && entry.lesson.specPointId === checkpointId);
    if (exact >= 0) return exact;
  }
  return lessons.findIndex((entry) => entry.topic.id === topicId);
}

/** A suggested learning order: curriculum order (units/topics are ordered). */
export function lessonOrder(topics: Topic[]): Topic[] {
  return [...topics];
}

// Re-export for callers that want misconception context inside a lesson step.
export { misconceptionsForTopic };
