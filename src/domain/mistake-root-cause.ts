import { matchMisconception } from "./misconception-library";
import { remediatePoint } from "./remediation";
import type {
  Attempt,
  Id,
  Misconception,
  MisconceptionTag,
  Mistake,
  Question,
  Topic,
} from "./types";

/** The kind of evidence behind a ranked diagnosis. */
export type RootCauseKind = "misconception" | "timing" | "command-word" | "knowledge" | "technique" | "mixed";
export type RootCauseConfidence = "early-signal" | "emerging" | "established";
export type RootCauseQuality = "no-data" | "early-signal" | "actionable";

export interface MistakeRootCause {
  id: string;
  kind: RootCauseKind;
  label: string;
  marksLost: number;
  occurrences: number;
  /** Distinct marked attempts supporting the pattern. */
  attemptCount: number;
  shareOfLostMarks: number;
  confidence: RootCauseConfidence;
  /** A bounded score used only to order causes; it is not a probability. */
  score: number;
  topicIds: Id[];
  evidence: string[];
  nextStep: string;
  source: "authored" | "answer-analysis" | "learner-signal" | "timing";
  misconceptionId?: Id;
}

export interface MistakeRootCauseReport {
  analysedMistakes: number;
  totalMarksLost: number;
  uniqueAttempts: number;
  quality: RootCauseQuality;
  rootCauses: MistakeRootCause[];
}

export interface MistakeRootCauseInput {
  mistakes: readonly Mistake[];
  attempts?: readonly Attempt[];
  questions?: readonly Question[];
  topics?: readonly Topic[];
  misconceptions?: readonly Misconception[];
  /** Progress uses unresolved mistakes; callers can opt into the full history. */
  includeResolved?: boolean;
}

interface CauseSignal {
  id: string;
  kind: RootCauseKind;
  label: string;
  nextStep: string;
  source: MistakeRootCause["source"];
  misconceptionId?: Id;
}

interface CauseAccumulator extends CauseSignal {
  marksLost: number;
  mistakes: Mistake[];
  attemptIds: Set<Id>;
  topicIds: Set<Id>;
  evidence: string[];
}

type SpecificMisconceptionTag = Exclude<MisconceptionTag, "other">;

const TAG_DETAILS: Record<SpecificMisconceptionTag, Omit<CauseSignal, "id" | "source">> = {
  units: {
    kind: "technique",
    label: "Unit handling",
    nextStep: "Write the unit beside every value, then check that the final unit answers exactly what was asked.",
  },
  "significant-figures": {
    kind: "technique",
    label: "Precision and significant figures",
    nextStep: "Keep the full value through the working and round only on the final line to the requested precision.",
  },
  rearrangement: {
    kind: "misconception",
    label: "Rearranging equations",
    nextStep: "Apply the opposite operation to both sides one line at a time before substituting numbers.",
  },
  "substitution-slips": {
    kind: "technique",
    label: "Substitution slips",
    nextStep: "Write the formula with the numbers substituted before evaluating it; this separates method from arithmetic.",
  },
  "graph-reading": {
    kind: "technique",
    label: "Reading graphs or data",
    nextStep: "Annotate the axis or table first and quote the reading in your answer before calculating.",
  },
  "method-skipped": {
    kind: "technique",
    label: "Skipping the visible method",
    nextStep: "Lay out the method line by line before calculating; each visible step gives the examiner something to credit.",
  },
  "misread-command": {
    kind: "command-word",
    label: "Not answering the command word",
    nextStep: "Underline the command word, turn it into a checklist, and make the first sentence obey that verb.",
  },
  terminology: {
    kind: "technique",
    label: "Exam terminology",
    nextStep: "Use the exact technical term from the mark-scheme point, then explain it in one precise sentence.",
  },
  conceptual: {
    kind: "misconception",
    label: "The underlying concept",
    nextStep: "Explain the concept aloud without the question in front of you, then retry a fresh application question.",
  },
};

const CATEGORY_DETAILS: Record<Mistake["category"], Omit<CauseSignal, "id" | "source">> = {
  recall: {
    kind: "knowledge",
    label: "Recall gap",
    nextStep: "Review the exact statement on a card, cover it, and retrieve it again before attempting another question.",
  },
  method: {
    kind: "technique",
    label: "Choosing or setting up the method",
    nextStep: "Name the method before touching the numbers, then practise it on a similar question with the working visible.",
  },
  arithmetic: {
    kind: "technique",
    label: "Arithmetic or precision slips",
    nextStep: "Recalculate the final line independently and check signs, units and rounding before submitting.",
  },
  interpretation: {
    kind: "technique",
    label: "Interpreting the question or data",
    nextStep: "Annotate the stimulus and restate what the question is asking before choosing a calculation or conclusion.",
  },
  communication: {
    kind: "command-word",
    label: "Exam wording",
    nextStep: "Use the command word as a checklist and include the technical term the mark-scheme point requires.",
  },
  unclassified: {
    kind: "mixed",
    label: "No single cause yet",
    nextStep: "Mark a few more questions with working shown; the next answers will make the underlying pattern clearer.",
  },
};

const TIMING_DETAILS: Record<"rushed" | "slow", Omit<CauseSignal, "id" | "source">> = {
  rushed: {
    kind: "timing",
    label: "Rushing before the answer is secure",
    nextStep: "Leave a short final-check window: verify the command word, one key step and the final unit before moving on.",
  },
  slow: {
    kind: "timing",
    label: "Over-investing time in one part",
    nextStep: "Use the marks to set a time budget, move on when it expires, and return only if time remains.",
  },
};

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function shorten(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function answerFor(mistake: Mistake, attempts: Map<Id, Attempt>): string {
  const attempt = mistake.attemptId ? attempts.get(mistake.attemptId) : undefined;
  if (!attempt) return "";
  if (mistake.partId && attempt.answers[mistake.partId]) return attempt.answers[mistake.partId];
  return Object.values(attempt.answers).find((answer) => answer.trim()) ?? "";
}

function evidenceFor(mistake: Mistake, answer: string): string {
  const point = mistake.point?.trim() || mistake.description.trim();
  const answerEvidence = answer.trim();
  if (answerEvidence) return `Missed: ${shorten(point)} · Answer: ${shorten(answerEvidence, 120)}`;
  return `Missed: ${shorten(point)}`;
}

function candidatesFor(mistake: Mistake, entries: readonly Misconception[]): Misconception[] {
  const topicEntries = entries.filter((entry) => entry.topicIds.includes(mistake.topicId));
  const subjectEntries = entries.filter((entry) => entry.subjectId === mistake.subjectId);
  const scoped = topicEntries.length ? topicEntries : subjectEntries.length ? subjectEntries : [...entries];
  if (!mistake.misconception || mistake.misconception === "other") return scoped;
  const tagged = scoped.filter((entry) => entry.tag === mistake.misconception);
  return tagged.length ? tagged : scoped;
}

function librarySignal(
  mistake: Mistake,
  answer: string,
  entries: readonly Misconception[],
): CauseSignal | null {
  const candidates = candidatesFor(mistake, entries);
  if (!candidates.length) return null;
  const match = matchMisconception(candidates, mistake.point ?? mistake.description, answer);
  if (!match) return null;
  return {
    id: `misconception:${match.entry.id}`,
    kind: "misconception",
    label: match.entry.statement,
    nextStep: match.entry.correction,
    source: "authored",
    misconceptionId: match.entry.id,
  };
}

function primarySignal(
  mistake: Mistake,
  answer: string,
  question: Question | undefined,
  topic: Topic | undefined,
  entries: readonly Misconception[],
): CauseSignal {
  const candidates = candidatesFor(mistake, entries);
  const part = question?.parts.find((candidate) => candidate.id === mistake.partId);

  // The answer-aware remediation path can locate the first incorrect working
  // step, authored common errors, or a library misconception. That is the
  // strongest available explanation of why this particular mark was lost.
  if (part && (answer.trim() || mistake.point?.trim())) {
    const action = remediatePoint(
      part,
      answer,
      mistake.point ?? mistake.description,
      topic,
      undefined,
      undefined,
      candidates,
    );
    if (action.misconception !== "Mark-scheme point missed" && action.confidence >= 0.5) {
      return {
        id: action.misconceptionEntry
          ? `misconception:${action.misconceptionEntry.id}`
          : `answer-analysis:${normalise(action.misconception)}`,
        kind: action.misconceptionEntry ? "misconception" : "technique",
        label: action.misconceptionEntry?.statement ?? action.misconception,
        nextStep: action.action,
        source: action.misconceptionEntry ? "authored" : "answer-analysis",
        ...(action.misconceptionEntry ? { misconceptionId: action.misconceptionEntry.id } : {}),
      };
    }
  }

  const matched = librarySignal(mistake, answer, candidates);
  if (matched) return matched;

  const tag = mistake.misconception;
  if (tag && tag !== "other") {
    const detail = TAG_DETAILS[tag];
    return { id: `tag:${tag}`, ...detail, source: "learner-signal" };
  }

  const detail = CATEGORY_DETAILS[mistake.category];
  return { id: `category:${mistake.category}`, ...detail, source: "learner-signal" };
}

function addEvidence(accumulator: CauseAccumulator, evidence: string): void {
  if (evidence && !accumulator.evidence.includes(evidence) && accumulator.evidence.length < 3) {
    accumulator.evidence.push(evidence);
  }
}

function addCause(
  causes: Map<string, CauseAccumulator>,
  signal: CauseSignal,
  mistake: Mistake,
  evidence: string,
): void {
  const current = causes.get(signal.id) ?? {
    ...signal,
    marksLost: 0,
    mistakes: [],
    attemptIds: new Set<Id>(),
    topicIds: new Set<Id>(),
    evidence: [],
  };
  current.marksLost += Math.max(0, mistake.marksLost);
  current.mistakes.push(mistake);
  if (mistake.attemptId) current.attemptIds.add(mistake.attemptId);
  current.topicIds.add(mistake.topicId);
  addEvidence(current, evidence);
  causes.set(signal.id, current);
}

function confidenceFor(occurrences: number, attemptCount: number): RootCauseConfidence {
  // A repeated mark loss inside one attempt is not enough to call a stable
  // root cause. Missing attempt ids stay deliberately conservative.
  if (attemptCount >= 2 && occurrences >= 3) return "established";
  if (attemptCount >= 2 && occurrences >= 2) return "emerging";
  return "early-signal";
}

function scoreFor(marksLost: number, occurrences: number, attemptCount: number): number {
  const repeatBoost = 1 + Math.min(0.9, Math.max(0, occurrences - 1) * 0.25);
  const spreadBoost = 1 + Math.min(0.3, Math.max(0, attemptCount - 1) * 0.1);
  return Number((marksLost * repeatBoost * spreadBoost).toFixed(2));
}

/**
 * Turn open mistakes into a ranked, answer-aware explanation of what is
 * causing the marks to disappear. The output is deterministic and bounded:
 * authored explanations are preferred, then answer analysis, then the
 * captured learner signal. Timing is kept as a separate contributing cause.
 */
export function buildMistakeRootCauseReport({
  mistakes,
  attempts = [],
  questions = [],
  topics = [],
  misconceptions = [],
  includeResolved = false,
}: MistakeRootCauseInput): MistakeRootCauseReport {
  const activeMistakes = mistakes.filter((mistake) => includeResolved || !mistake.resolved);
  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt] as const));
  const questionsById = new Map(questions.map((question) => [question.id, question] as const));
  const topicsById = new Map(topics.map((topic) => [topic.id, topic] as const));
  const causes = new Map<string, CauseAccumulator>();
  const allAttemptIds = new Set<Id>();

  for (const mistake of activeMistakes) {
    const answer = answerFor(mistake, attemptsById);
    const evidence = evidenceFor(mistake, answer);
    const signal = primarySignal(
      mistake,
      answer,
      mistake.questionId ? questionsById.get(mistake.questionId) : undefined,
      topicsById.get(mistake.topicId),
      misconceptions,
    );
    addCause(causes, signal, mistake, evidence);
    if (mistake.attemptId) allAttemptIds.add(mistake.attemptId);

    // Timing only becomes a diagnosis when the marking data actually says it
    // was rushed or slow; a command word alone is not evidence of a failure.
    if (mistake.timing === "rushed" || mistake.timing === "slow") {
      addCause(
        causes,
        {
          id: `timing:${mistake.timing}`,
          ...TIMING_DETAILS[mistake.timing],
          source: "timing",
        },
        mistake,
        evidence,
      );
    }

    // mistakesFromAttempt records the prompt's command for every part. Only
    // promote it to a root cause when the classification says wording is the
    // problem, avoiding false alarms on ordinary "calculate" questions.
    if (
      mistake.command &&
      mistake.command !== "other" &&
      (mistake.misconception === "misread-command" || mistake.category === "communication")
    ) {
      addCause(
        causes,
        {
          id: `command:${mistake.command}`,
          kind: "command-word",
          label: `Not answering “${mistake.command}” directly`,
          nextStep: `Underline “${mistake.command}” before writing and check that the response performs that verb, not a neighbouring one.`,
          source: "learner-signal",
        },
        mistake,
        evidence,
      );
    }
  }

  const totalMarksLost = activeMistakes.reduce((total, mistake) => total + Math.max(0, mistake.marksLost), 0);
  const rootCauses = [...causes.values()]
    .map((cause): MistakeRootCause => {
      const attemptCount = cause.attemptIds.size;
      const occurrences = cause.mistakes.length;
      return {
        id: cause.id,
        kind: cause.kind,
        label: cause.label,
        marksLost: cause.marksLost,
        occurrences,
        attemptCount,
        shareOfLostMarks: totalMarksLost ? cause.marksLost / totalMarksLost : 0,
        confidence: confidenceFor(occurrences, attemptCount),
        score: scoreFor(cause.marksLost, occurrences, attemptCount),
        topicIds: [...cause.topicIds],
        evidence: cause.evidence,
        nextStep: cause.nextStep,
        source: cause.source,
        ...(cause.misconceptionId ? { misconceptionId: cause.misconceptionId } : {}),
      };
    })
    .sort((a, b) => (b.score - a.score) || (b.marksLost - a.marksLost) || (b.occurrences - a.occurrences));

  const hasActionableCause = rootCauses.some(
    (cause) => cause.confidence !== "early-signal" && cause.marksLost >= 2,
  );
  return {
    analysedMistakes: activeMistakes.length,
    totalMarksLost,
    uniqueAttempts: allAttemptIds.size,
    quality: activeMistakes.length === 0 ? "no-data" : hasActionableCause ? "actionable" : "early-signal",
    rootCauses,
  };
}
