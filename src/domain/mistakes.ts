import { matchMisconception } from "./misconception-library";
import { createCard } from "./scheduling";
import type { Attempt, Card, Id, Misconception, Mistake, Question } from "./types";

// ---------------------------------------------------------------------------
// Mistake tracking closes the loop: a dropped mark becomes a classified
// mistake, a mistake becomes a flashcard, and the card comes back until it is
// answered reliably. Nothing a student gets wrong is allowed to just scroll
// off the screen.
// ---------------------------------------------------------------------------

export type MistakeCategory = Mistake["category"];

const CATEGORY_HINTS: { category: MistakeCategory; patterns: RegExp[] }[] = [
  { category: "arithmetic", patterns: [/\bsig(?:nificant)? ?fig/i, /\bunit(s)?\b/i, /\brounding\b/i, /\bcalculat/i] },
  { category: "method", patterns: [/\bmethod\b/i, /\bderiv/i, /\bshow that\b/i, /\bequation\b/i, /\bsubstitut/i] },
  { category: "interpretation", patterns: [/\bgraph\b/i, /\bdata\b/i, /\btable\b/i, /\bconclude\b/i, /\bevaluat/i] },
  { category: "communication", patterns: [/\bexplain\b/i, /\bdescribe\b/i, /\bstate\b/i, /\bcompare\b/i] },
  { category: "recall", patterns: [/\bdefin/i, /\bname\b/i, /\bidentify\b/i, /\brecall\b/i] },
];

/** Best-effort classification from the question stem and the missed points. */
export function classifyMistake(questionStem: string, missedPoints: string[]): MistakeCategory {
  const haystack = `${questionStem} ${missedPoints.join(" ")}`;
  for (const { category, patterns } of CATEGORY_HINTS) {
    if (patterns.some((p) => p.test(haystack))) return category;
  }
  return "unclassified";
}

export interface MistakeDraft {
  mistake: Mistake;
  card: Card;
}

const COMMAND_WORD_RE = /\b(state|describe|explain|calculate|suggest|compare|evaluate|discuss|justify|deduce|predict|outline|show that)\b/i;
export function commandWordOf(parts: Array<{ prompt: string }>): ReturnType<typeof classifyMistake> extends never ? never : string {
  // legacy shim handled in assessment.ts — kept here only for the fallback below
  return "" as unknown as string;
}
function detectCommandWord(prompt: string): import("./types").CommandWord {
  const m = prompt.match(COMMAND_WORD_RE);
  if (!m) return "other";
  const w = m[1].toLowerCase();
  if (w === "show that") return "show that";
  return w as import("./types").CommandWord;
}
const MISCONCEPTION_RE: Array<{ tag: import("./types").MisconceptionTag; re: RegExp }> = [
  { tag: "units", re: /unit|kJ|J\b|m s-1|mol dm/i },
  { tag: "significant-figures", re: /sig fig|significant|decimal/i },
  { tag: "graph-reading", re: /graph|gradient|intercept|area under/i },
  { tag: "method-skipped", re: /method|working|step/i },
  { tag: "terminology", re: /terminolog|term|define/i },
  { tag: "rearrangement", re: /rearrang|subject of|transpose/i },
  { tag: "substitution-slips", re: /substitut|into the equation|plug in/i },
  { tag: "conceptual", re: /concept|misconception|principle|because.*not/i },
];
function detectMisconception(missed: string[]): import("./types").MisconceptionTag {
  const hay = missed.join(" ");
  for (const { tag, re } of MISCONCEPTION_RE) if (re.test(hay)) return tag;
  return "other";
}

export interface WorkingStep {
  text: string;
  expects?: string;
  marks?: number;
}

/**
 * Multi-step working analysis: locate the first step where the student's
 * working diverges from the expected mark-scheme progression. Offline heuristic
 * — compares textual overlap step-by-step; AI path (src/ai/tasks.ts) upgrades
 * it with symbolic checking when a provider is present.
 */
export function firstErrorStep(working: string[], expectedSteps: string[]): { index: number | null; reason: string } {
  if (!working.length || !expectedSteps.length) return { index: null, reason: "No working provided" };
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+\-×÷^/=²³\. ]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < expectedSteps.length; i++) {
    const exp = expectedSteps[i];
    const got = working[i] ?? "";
    if (!got.trim()) return { index: i, reason: `Step ${i + 1} missing: expected "${exp.slice(0, 80)}"` };
    const expTokens = new Set(norm(exp).split(/\s+/).filter(Boolean));
    const gotTokens = new Set(norm(got).split(/\s+/).filter(Boolean));
    let overlap = 0;
    for (const t of expTokens) if (gotTokens.has(t)) overlap++;
    const cov = expTokens.size ? overlap / expTokens.size : 0;
    if (cov < 0.35) return { index: i, reason: `Step ${i + 1} diverges: "${got.slice(0, 80)}" does not match expected "${exp.slice(0, 80)}"` };
  }
  return { index: null, reason: "No divergence detected in provided steps" };
}

export function remediationFor(mistake: Pick<Mistake, "misconception" | "ao" | "command" | "category" | "topicId">): string {
  const bits: string[] = [];
  if (mistake.misconception && mistake.misconception !== "other") bits.push(`Misconception: ${mistake.misconception}.`);
  if (mistake.ao) bits.push(`AO: ${mistake.ao}.`);
  if (mistake.command && mistake.command !== "other") bits.push(`Command: "${mistake.command}" — answer the verb directly.`);
  const categoryAdvice: Record<string, string> = {
    arithmetic: "Check units and significant figures on the final line.",
    method: "Write the method first, then substitute numbers.",
    interpretation: "Annotate the graph/data before calculating.",
    communication: "Use the exact technical term from the spec point.",
    recall: "Revisit the flashcard for this statement today.",
  };
  if (mistake.category in categoryAdvice) bits.push(categoryAdvice[mistake.category]);
  return bits.join(" ") || "Revisit the topic summary and retry a similar question.";
}
function timingFor(attempt: Attempt, partId: string, marks: number): Mistake["timing"] {
  if (!attempt.elapsedMs || !attempt.marked.length) return "unknown";
  const perPartMs = attempt.elapsedMs / attempt.marked.length;
  const budget = marks * 90_000;
  if (perPartMs < budget * 0.5) return "rushed";
  if (perPartMs > budget * 2) return "slow";
  void partId;
  return "ok";
}

/**
 * Turn every dropped mark in an attempt into a mistake plus a card. Parts that
 * scored full marks produce nothing — the point is signal, not noise.
 */
export function mistakesFromAttempt(
  attempt: Attempt,
  question: Question,
  idFactory: () => string = () => crypto.randomUUID(),
  now: Date = new Date(),
  misconceptions: readonly Misconception[] = [],
): MistakeDraft[] {
  const drafts: MistakeDraft[] = [];
  const topicId = question.topicIds[0] ?? attempt.topicIds[0];
  if (!topicId) return drafts;

  for (const marked of attempt.marked) {
    if (marked.awarded >= marked.max) continue;
    const part = question.parts.find((p) => p.id === marked.partId);
    const prompt = part ? `${question.stem}\n\n${part.label} ${part.prompt}` : question.stem;
    const mistakeId = idFactory();

    const marksLost = marked.max - marked.awarded;
    const ao = part?.aos?.[0];
    const studentAnswer = attempt.answers[marked.partId] ?? "";
    const misconceptionMatch = misconceptions.length
      ? matchMisconception(misconceptions, marked.missedPoints.join("; "), studentAnswer)
      : null;
    const mistake: Mistake = {
      id: mistakeId,
      userId: attempt.userId,
      subjectId: attempt.subjectId,
      topicId,
      questionId: question.id,
      attemptId: attempt.id,
      partId: part?.id,
      point: marked.missedPoints[0],
      command: detectCommandWord(part?.prompt ?? question.stem),
      misconception: detectMisconception(marked.missedPoints),
      ...(misconceptionMatch ? { misconceptionEntryId: misconceptionMatch.entry.id } : {}),
      ao,
      difficultyAtLoss: question.difficulty,
      marksLost,
      secondsSpent: attempt.elapsedMs ? Math.round(attempt.elapsedMs / Math.max(1, attempt.marked.length) / 1000) : undefined,
      timing: timingFor(attempt, marked.partId, marked.max),
      description: marked.missedPoints.length
        ? `Dropped ${marksLost} mark(s): ${marked.missedPoints.slice(0, 2).join("; ")}`
        : `Dropped ${marksLost} mark(s) on "${part?.label ?? "this question"}"`,
      category: classifyMistake(question.stem, marked.missedPoints),
      resolved: false,
      createdAt: now.toISOString(),
    };

    const card = createCard(
      {
        id: idFactory(),
        userId: attempt.userId,
        subjectId: attempt.subjectId,
        topicId,
        kind: "mistake",
        origin: "mistake",
        tags: ["mistake", mistake.category],
        sourceMistakeId: mistakeId,
        front: prompt,
        back: part?.modelAnswer ?? marked.missedPoints.join("; "),
      },
      now,
    );
    mistake.cardId = card.id;
    drafts.push({ mistake, card });
  }

  return drafts;
}

/** A mistake is repaired once its card has been recalled well twice running. */
export function shouldResolve(card: Card): boolean {
  return card.reps >= 2 && card.stability >= 7 && card.lapses === 0;
}

export type RetestStatus = "resolved" | "still-open" | "not-applicable";

export interface RetestEvaluation {
  mistakeId: Id;
  status: RetestStatus;
  awarded: number;
  max: number;
  point: string | null;
  pointRelearned: boolean;
  feedback: string;
}

/**
 * A targeted retest closes the original mistake only when the student earns
 * every mark on the affected part and the exact lost point is credited.
 * Partial recovery stays attached to the same mistake so the loop does not
 * manufacture a second mistake for the same gap.
 */
export function evaluateMistakeRetest(
  mistake: Mistake,
  question: Question,
  attempt: Attempt,
): RetestEvaluation {
  const point = mistake.point ?? null;
  const notApplicable = (feedback: string): RetestEvaluation => ({
    mistakeId: mistake.id,
    status: "not-applicable",
    awarded: 0,
    max: 0,
    point,
    pointRelearned: false,
    feedback,
  });

  if (
    attempt.questionId !== question.id ||
    (mistake.questionId && mistake.questionId !== question.id) ||
    (attempt.retestMistakeId && attempt.retestMistakeId !== mistake.id)
  ) {
    return notApplicable("This attempt is not linked to the question that created the mistake.");
  }

  const marked = mistake.partId
    ? attempt.marked.find((part) => part.partId === mistake.partId)
    : attempt.marked.length === 1
      ? attempt.marked[0]
      : undefined;
  if (!marked) {
    return notApplicable("The affected part was not included in this retest.");
  }

  const pointRelearned = point ? marked.creditedPoints.includes(point) : marked.awarded >= marked.max;
  const fullPart = marked.awarded >= marked.max;
  const resolved = fullPart && pointRelearned;

  return {
    mistakeId: mistake.id,
    status: resolved ? "resolved" : "still-open",
    awarded: marked.awarded,
    max: marked.max,
    point,
    pointRelearned,
    feedback: resolved
      ? `Retest earned ${marked.awarded}/${marked.max} and recovered the missed point${point ? `: ${point}` : "."}`
      : `Retest earned ${marked.awarded}/${marked.max}. The original mistake stays open until the affected part is complete and the missed point is credited.`,
  };
}

/** Persist the state transition for one targeted retest. */
export function applyRetestToMistake(
  mistake: Mistake,
  evaluation: RetestEvaluation,
  attempt: Attempt,
): Mistake {
  if (evaluation.status === "not-applicable") return mistake;

  const updated: Mistake = {
    ...mistake,
    retestCount: (mistake.retestCount ?? 0) + 1,
    lastRetestAttemptId: attempt.id,
    lastRetestedAt: attempt.createdAt,
  };
  if (evaluation.status === "resolved") {
    updated.resolved = true;
    updated.resolvedAt = attempt.createdAt;
  }
  return updated;
}

export interface MistakePattern {
  category: MistakeCategory;
  count: number;
  topicIds: Id[];
  /** Shown verbatim in the analytics view. */
  insight: string;
}

const PATTERN_INSIGHT: Record<MistakeCategory, string> = {
  arithmetic: "Marks are going on units, significant figures and slips — not on understanding. Slow the final line down and check units every time.",
  method: "You know the content but the route through the question is breaking down. Practise writing the method before touching numbers.",
  interpretation: "Reading data and graphs is where marks are leaking. Annotate the stimulus before you start answering.",
  communication: "The physics/chemistry/biology is right but the wording is not earning marks. Use the command word's verb explicitly.",
  recall: "Straight recall is the gap. This is exactly what spaced repetition fixes — keep the daily cards clear.",
  unclassified: "A mixed set of dropped marks with no single pattern yet.",
};

export function mistakePatterns(mistakes: Mistake[]): MistakePattern[] {
  const byCategory = new Map<MistakeCategory, Mistake[]>();
  for (const m of mistakes) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }
  return [...byCategory.entries()]
    .map(([category, list]) => ({
      category,
      count: list.length,
      topicIds: [...new Set(list.map((m) => m.topicId))],
      insight: PATTERN_INSIGHT[category],
    }))
    .sort((a, b) => b.count - a.count);
}
// --- auto-loop: mistake -> next-session wiring ---------------------------------

/**
 * Derive a lightweight next-up queue from open mistakes so the app can
 * automatically surface the highest-value mistake cards without the student
 * having to curate a manual session. Returns up to maxCards cardIds in
 * priority order (most marks-lost first, then most recent).
 */
export function nextMistakeLoop(mistakes: Mistake[], maxCards = 12): Id[] {
  const open = mistakes.filter((m) => !m.resolved && m.cardId);
  if (!open.length) return [];
  open.sort((a, b) => (b.marksLost - a.marksLost) || b.createdAt.localeCompare(a.createdAt));
  return open.slice(0, maxCards).map((m) => m.cardId as Id);
}

