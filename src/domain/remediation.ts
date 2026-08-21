// ---------------------------------------------------------------------------
// Misconception-specific remediation.
//
// The rubric says what was missed; working analysis says where the working
// first went wrong. This module says WHY and WHAT TO DO NEXT: it matches the
// missed mark-scheme points (and the failing step) against the topic's
// authored `commonErrors`, and turns the best match into a concrete,
// examiner-voice remediation action — restudy the key point, fix the specific
// error, then retry a similar question.
//
// Fully deterministic: no AI, no network, so it works offline exactly like
// the rubric does.
// ---------------------------------------------------------------------------

import { tokenise } from "./marking";
import { diagnoseExpressionDifference } from "./maths-equivalence";
import { matchMisconception } from "./misconception-library";
import { firstIncorrectStep } from "./working-analysis";
import type { Attempt, MarkedPart, Misconception, Mistake, Question, QuestionPart, Topic } from "./types";

export interface RemediationAction {
  /** Human label of the misconception, e.g. "Sign slip in expansion". */
  misconception: string;
  /** Why we believe this: the answer/working evidence we matched on. */
  evidence: string;
  /** 0–1 confidence, based on how strong the evidence match was. */
  confidence: number;
  /** What the student should do next, in examiner voice. */
  action: string;
  /** Which key point of the topic to restudy, when we can name one. */
  targetKeyPoint?: string;
  /** The full library entry this action is drawn from, when one matched. */
  misconceptionEntry?: Misconception;
}

export interface PartRemediation {
  partId: string;
  actions: RemediationAction[];
}

export interface RemediationPlan {
  parts: PartRemediation[];
  /** The single most important action across all parts (for the header). */
  headline: RemediationAction | null;
}

/** Token overlap of an error description with the evidence text, 0–1. */
function errorCoverage(error: string, evidence: string): number {
  const wanted = [...tokenise(error)];
  if (!wanted.length) return 0;
  const given = tokenise(evidence);
  const hits = wanted.filter((w) => given.has(w)).length;
  return hits / wanted.length;
}

/**
 * Score an authored common-error description against the context: how much of
 * it appears in the missed mark-scheme point (what the examiner wanted) and in
 * the student's own answer (what the student actually did). Both matter — the
 * error has to explain the gap, so we take the better of the two signals.
 */
function scoreError(
  error: string,
  missedPoint: string,
  studentAnswer: string,
): number {
  const vsPoint = errorCoverage(error, missedPoint);
  const vsAnswer = errorCoverage(error, studentAnswer);
  return Math.max(vsPoint, vsAnswer);
}

const ACTION_BY_ERROR_HINT: Array<{ hint: RegExp; action: string }> = [
  {
    hint: /\b(sign|minus|negative|subtract)\b/i,
    action:
      "Recheck every sign as you write each line — put the negative with the term it belongs to, then re-expand the original to confirm.",
  },
  {
    hint: /\b(rearrang|formula|subject|transpos)\b/i,
    action:
      "Rewrite the formula in words, then rearrange step by step (opposite operation on each side) before substituting numbers.",
  },
  {
    hint: /\b(unit)\b/i,
    action:
      "Write the units on every value before you calculate, then check the final unit matches what the question asked for.",
  },
  {
    hint: /\b(round|significant|decimal)\b/i,
    action:
      "Carry the full value through your working and round only at the final answer — to the precision the question specifies.",
  },
  {
    hint: /\b(skip|omit|step|method|working)\b/i,
    action:
      "Lay the working out line by line — an examiner awards each visible step, not the jump to a final number.",
  },
  {
    hint: /\b(graph|read|intercept|gradient)\b/i,
    action:
      "Read the graph twice: once from the axis, once back — and quote the point you read so the mark is visible.",
  },
  {
    hint: /\b(term|expand|bracket|factor)\b/i,
    action:
      "Expand brackets one pair at a time and collect like terms before moving on — then check by re-factorising your result.",
  },
  {
    hint: /\b(substitut|value|plug)\b/i,
    action:
      "Write the substitution in full (formula with the numbers in) before evaluating — it isolates arithmetic slips from method.",
  },
];

function genericAction(missedPoint: string, answer?: string): RemediationAction {
  return {
    misconception: "Mark-scheme point missed",
    evidence: answer?.trim()
      ? `Your answer — "${answer.trim()}" — did not demonstrate the required point: "${missedPoint}".`
      : `The scheme wanted: "${missedPoint}".`,
    confidence: 0.4,
    action:
      "Restate the missing point explicitly in your own words, then check it against the scheme before moving on.",
  };
}

const DIAGNOSIS_ACTION: Record<
  Exclude<ReturnType<typeof diagnoseExpressionDifference>, "unrelated">,
  { misconception: string; action: string }
> = {
  "sign-slip": {
    misconception: "Sign slip in the working",
    action:
      "Recheck the sign of every term in that line against the previous line — one flipped sign changes the whole answer.",
  },
  "coefficient-error": {
    misconception: "Arithmetic slip in the working",
    action:
      "Recompute that step with the numbers written out in full — the method is right, but a value is wrong.",
  },
  "method-error": {
    misconception: "Method error in the working",
    action:
      "Restudy the method for this topic, then redo that step — the term structure doesn't match what the question needs.",
  },
};

/**
 * Build a remediation action for one missed point, using topic common errors.
 * When the topic's authored errors don't explain the gap but the first wrong
 * step's expression provably differs from the expected step's, the symbolic
 * diagnosis names the class of error (sign slip, arithmetic slip, method).
 */
export function remediatePoint(
  part: QuestionPart,
  answer: string,
  missedPoint: string,
  topic?: Topic,
  firstWrongStep?: string,
  expectedStep?: string,
  misconceptions: readonly Misconception[] = [],
): RemediationAction {
  const evidencePool = [firstWrongStep, answer].filter(
    (s): s is string => Boolean(s && s.trim()),
  );
  const errors = topic?.commonErrors ?? [];

  // The library is the richest source: when a known misconception matches,
  // its full explanation and correction replace the generic restudy action.
  const libraryMatch = misconceptions.length
    ? matchMisconception(misconceptions, missedPoint, evidencePool.join(" "))
    : null;
  if (libraryMatch) {
    return {
      misconception: libraryMatch.entry.statement,
      evidence: `Your answer matches a known misconception: ${libraryMatch.entry.statement} For example, ${libraryMatch.entry.example}`,
      confidence: Math.min(0.95, 0.6 + libraryMatch.score * 0.35),
      action: libraryMatch.entry.correction,
      misconceptionEntry: libraryMatch.entry,
    };
  }

  let best: { error: string; score: number } | null = null;
  for (const error of errors) {
    const score = scoreError(error, missedPoint, evidencePool.join(" "));
    if (!best || score > best.score) best = { error, score };
  }

  if (best && best.score >= 0.5) {
    const hint = ACTION_BY_ERROR_HINT.find((h) => h.hint.test(best.error));
    const action =
      hint?.action ??
      "Restudy the concept this error points to, then redo the question from scratch and check each line against the scheme.";
    const targetKeyPoint = topic?.keyPoints.find((kp) => {
      const wanted = [...tokenise(best.error)].filter((w) => w.length > 3);
      return wanted.length && wanted.some((w) => tokenise(kp).has(w));
    });
    return {
      misconception: best.error,
      evidence: `Your working — "${firstWrongStep || answer}" — matches the classic error: ${best.error}.`,
      confidence: Math.min(0.95, 0.5 + best.score * 0.4),
      action,
      ...(targetKeyPoint ? { targetKeyPoint } : {}),
    };
  }

  // No authored error matched — can we still name what went wrong from the
  // algebra itself? Compare the failing step against what the model expected.
  if (firstWrongStep && expectedStep) {
    const kind = diagnoseExpressionDifference(firstWrongStep, expectedStep);
    if (kind !== "unrelated") {
      const d = DIAGNOSIS_ACTION[kind];
      return {
        misconception: d.misconception,
        evidence: `Your working — "${firstWrongStep}" — should read "${expectedStep}".`,
        confidence: 0.6,
        action: d.action,
      };
    }
  }

  return genericAction(missedPoint, answer);
}

/**
 * Plan remediation for a whole part: rubric misses + first incorrect step +
 * topic common errors → ordered actions.
 */
export function remediatePart(
  part: QuestionPart,
  answer: string,
  marked: Pick<MarkedPart, "partId" | "missedPoints">,
  topic?: Topic,
  misconceptions: readonly Misconception[] = [],
): PartRemediation {
  if (!marked.missedPoints.length) return { partId: part.id, actions: [] };

  const analysis = firstIncorrectStep(part, answer);
  const firstWrongStep = analysis.firstIncorrect?.studentStep;
  const expectedStep = analysis.firstIncorrect?.expected;

  const actions: RemediationAction[] = [];
  for (const missed of marked.missedPoints) {
    actions.push(remediatePoint(part, answer, missed, topic, firstWrongStep, expectedStep, misconceptions));
  }
  // Deduplicate identical misconceptions, keeping the strongest evidence.
  const seen = new Map<string, RemediationAction>();
  for (const a of actions) {
    const key = a.misconception.toLowerCase();
    const prev = seen.get(key);
    if (!prev || a.confidence > prev.confidence) seen.set(key, a);
  }
  return { partId: part.id, actions: [...seen.values()] };
}

/** Plan remediation for a whole question, per part. */
export function planRemediation(
  question: {
    parts: QuestionPart[];
  },
  answers: Record<string, string>,
  marked: Array<{ partId: string; missedPoints: string[] }>,
  topic?: Topic,
  misconceptions: readonly Misconception[] = [],
): RemediationPlan {
  const parts: PartRemediation[] = question.parts
    .map((part) => {
      const m = marked.find((mm) => mm.partId === part.id);
      if (!m || !m.missedPoints.length) return null;
      return remediatePart(part, answers[part.id] ?? "", m, topic, misconceptions);
    })
    .filter((p): p is PartRemediation => p !== null && p.actions.length > 0);

  const all = parts.flatMap((p) => p.actions);
  const headline = all.length
    ? [...all].sort((a, b) => b.confidence - a.confidence)[0]
    : null;

  return { parts, headline };
}

/**
 * Rebuild the best remediation action for one persisted mistake. The original
 * attempt supplies the student's evidence; the mistake's point narrows the
 * plan so a retest addresses this gap rather than the whole question.
 */
export function remediationForMistake(
  mistake: Pick<Mistake, "partId" | "point">,
  question: Pick<Question, "parts">,
  originalAttempt?: Pick<Attempt, "answers" | "marked">,
  topic?: Topic,
): RemediationAction | null {
  const part =
    question.parts.find((candidate) => candidate.id === mistake.partId) ??
    (question.parts.length === 1 ? question.parts[0] : undefined);
  if (!part) return null;

  const originalMarked = originalAttempt?.marked.find((marked) => marked.partId === part.id);
  const missedPoints = mistake.point
    ? [mistake.point]
    : originalMarked?.missedPoints ?? [];
  if (!missedPoints.length) return null;

  const answer = originalAttempt?.answers[part.id] ?? "";
  return remediatePart(part, answer, { partId: part.id, missedPoints }, topic).actions[0] ?? null;
}
