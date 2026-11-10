// ---------------------------------------------------------------------------
// Adaptive hints — escalating support, and honest evidence for assisted wins.
//
// A hint is not a failure; it is scaffolding. But the tutor must not pretend a
// hint-assisted answer proves what an unaided answer proves. Every hint step
// carries an evidence weight (see ./capability-mastery EVIDENCE_WEIGHT): a
// worked-solution copy is worth a fifth of an independent success, which is
// what stops hint-gaming from inflating mastery.
//
// The ladder is deterministic — built from fields the question already has —
// so it works offline with no model call.
//
// What each rung says comes from the question, not from the top of its
// topic. The ladder used to take the topic's first key point and first common
// error whatever the question tested, so an efficiency calculation was told
// to "think about W = Fs cosθ" and warned about omitting cosθ. It now uses,
// in order of preference:
//   - the specification statement the question's part is tagged with, and
//     the teaching written for that statement (src/content/teaching), passed
//     in as `focus`: the idea, then a worked example of a *different*
//     problem on the same idea, so help arrives before this answer does;
//   - otherwise the topic key point and common error that share most words
//     with the question.
// Only the top rung shows this question's own model answer and credited
// points, and it is reached only by an explicit give-up.
// ---------------------------------------------------------------------------

import type { Id, Question, Topic } from "./types";
import type { HintTier } from "./hint-tiers";

export { HINT_TIERS, hintEvidenceMultiplier, hintEvidenceSource, type HintTier } from "./hint-tiers";

/** A worked example on the same idea as the question, with different numbers. */
export interface HintWorkedExample {
  prompt: string;
  steps: string[];
  answer: string;
}

export interface Hint {
  tier: HintTier;
  /** The support itself, complete on its own and ready to show verbatim. */
  text: string;
  /**
   * The same support in pieces, for a view that can lay it out: short lines
   * of teaching, a worked example of a similar problem, or this question's
   * own solution. Optional; `text` always stands alone.
   */
  detail?: {
    lines?: string[];
    example?: HintWorkedExample;
    /** This question's own answer, part by part (top rung only). */
    solution?: { label: string; modelAnswer: string; points: string[] }[];
    /** The error most often made on this idea, and its correction. */
    trap?: { wrong: string; right: string };
  };
}

/** Teaching for one specification statement, as much of it as a hint uses. */
export interface HintTeaching {
  explain: readonly string[];
  worked: { prompt: string; steps: readonly string[]; answer: string };
  trap?: { wrong: string; right: string };
}

/** What the question's part is tagged as testing. */
export interface HintFocus {
  specPoint?: { id: Id; ref: string; text: string } | null;
  teaching?: HintTeaching | null;
}

const TIER_LABELS: Record<HintTier, string> = {
  cue: "Small cue",
  prompt: "Think about",
  scaffold: "Scaffold",
  "worked-solution": "Worked solution",
};

const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was", "its", "into", "than", "then", "when", "which", "what",
  "each", "only", "does", "have", "has", "not", "but", "can", "will", "between", "about", "after", "before", "per", "use",
  "used", "using", "give", "given", "state", "explain", "describe", "calculate", "show", "find", "determine", "take",
]);

function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-zα-ω][a-zα-ω-]{2,}/g) ?? []) {
    const word = raw.replace(/(?:ing|ed|es|s)$/, "");
    if (word.length >= 3 && !STOP.has(raw) && !STOP.has(word)) out.add(word);
  }
  return out;
}

/** Everything the question says and credits, as words to match teaching against. Never shown. */
function questionWords(question: Question): Set<string> {
  const parts = question.parts ?? [];
  return stems([
    question.stem,
    ...(question.options ?? []),
    ...parts.flatMap((part) => [part.prompt, ...(part.learningClaims ?? []), ...(part.markScheme ?? []), part.modelAnswer ?? ""]),
  ].join(" "));
}

/** Candidates ordered by how many of the question's words each shares; ties keep authored order. */
function byRelevance(candidates: readonly string[], context: Set<string>): string[] {
  return candidates
    .map((text, order) => {
      let shared = 0;
      for (const word of stems(text)) if (context.has(word)) shared += 1;
      return { text, order, shared };
    })
    .sort((a, b) => b.shared - a.shared || a.order - b.order)
    .map((row) => row.text);
}

/**
 * The lines of a taught point that bear most on this question, in the order
 * they were written. A specification point often teaches several things (a
 * slope, then terminal velocity); a question usually needs one or two.
 */
export function teachingLinesFor(question: Question, lines: readonly string[], max = 2): string[] {
  const chosen = new Set(byRelevance(lines, questionWords(question)).slice(0, max));
  return lines.filter((line) => chosen.has(line));
}

/**
 * The specification statement a question tests: the first tagged statement
 * of its first tagged part that one of its topics actually lists. Null for
 * untagged questions (uploaded papers, most reference-tier content).
 */
export function questionSpecPoint(
  question: Pick<Question, "parts" | "topicIds">,
  topicFor: (topicId: Id) => Pick<Topic, "specPoints"> | undefined,
): { id: Id; ref: string; text: string } | null {
  const points = question.topicIds.flatMap((topicId) => topicFor(topicId)?.specPoints ?? []);
  for (const part of question.parts ?? []) {
    for (const id of part.specPointIds ?? []) {
      const point = points.find((candidate) => candidate.id === id && candidate.text.trim());
      if (point) return { id: point.id, ref: point.ref.trim(), text: point.text.trim() };
    }
  }
  return null;
}

export interface TeachingChoice<T extends HintTeaching = HintTeaching> {
  specPoint: { id: Id; ref: string; text: string };
  topicId: Id;
  teaching: T;
  /** False when the question's own tag was overruled by a closer point in the same topic. */
  tagged: boolean;
}

function teachingWords(point: { text: string }, teaching: HintTeaching): Set<string> {
  return stems([point.text, ...teaching.explain, teaching.worked.prompt, ...teaching.worked.steps, teaching.trap?.wrong ?? "", teaching.trap?.right ?? ""].join(" "));
}

/**
 * The taught specification point whose teaching bears on a question.
 *
 * A question's tag is the first candidate, but a tag is not always the point
 * the question turns on: many were filed under their topic's first statement
 * ("recall the key definitions…"), and teaching current and charge to a
 * student stuck on internal resistance is worse than teaching nothing. Each
 * taught point in the question's topics is scored by the words it shares
 * with the question, counting a word for more the fewer of the topic's
 * points use it. The tagged point is kept unless another point is clearly
 * closer; a point that shares too little is not offered at all.
 *
 * `parts` narrows the question to the parts that matter (the ones that lost
 * marks); by default every part counts.
 */
export function chooseTeachingPoint<T extends HintTeaching>(
  question: Pick<Question, "stem" | "parts" | "topicIds" | "options">,
  topicFor: (topicId: Id) => Pick<Topic, "id" | "specPoints"> | undefined,
  teachingFor: (specPointId: Id) => T | undefined,
  parts: readonly Question["parts"][number][] = question.parts ?? [],
): TeachingChoice<T> | null {
  const asked = stems([
    question.stem,
    ...(question.options ?? []),
    ...parts.flatMap((part) => [part.prompt, ...(part.learningClaims ?? []), ...(part.markScheme ?? []), part.modelAnswer ?? ""]),
  ].join(" "));
  const tagged = new Set(parts.flatMap((part) => part.specPointIds ?? []));
  const candidates = question.topicIds.flatMap((topicId) => {
    const topic = topicFor(topicId);
    return (topic?.specPoints ?? []).flatMap((point, index) => {
      const teaching = point.text.trim() ? teachingFor(point.id) : undefined;
      return teaching ? [{ point, topicId: topic!.id, teaching, words: teachingWords(point, teaching), firstOfTopic: index === 0 }] : [];
    });
  });
  if (!candidates.length) return null;
  // A word every point in the topic uses says nothing about which point this is.
  const frequency = new Map<string, number>();
  for (const candidate of candidates) for (const word of candidate.words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const scored = candidates.map((candidate, order) => {
    let score = 0;
    let shared = 0;
    for (const word of candidate.words) {
      if (!asked.has(word)) continue;
      shared += 1;
      score += Math.log(1 + candidates.length / (frequency.get(word) ?? 1));
    }
    return { ...candidate, order, score, shared, isTagged: tagged.has(candidate.point.id) };
  });
  const best = [...scored].sort((a, b) => b.score - a.score || Number(b.isTagged) - Number(a.isTagged) || a.order - b.order)[0]!;
  const own = scored.filter((row) => row.isTagged).sort((a, b) => b.score - a.score || a.order - b.order)[0];
  // The author's tag stands. It is overruled only when another point is
  // plainly closer and the tag is in doubt: its teaching shares next to
  // nothing with the question, or it is the topic's first statement (the one
  // questions were filed under by default) and the other point shares
  // several more of the question's words. An untagged question gets teaching
  // only on plain evidence too.
  const inDoubt = own ? own.shared <= MAX_SHARED_TO_DOUBT || (own.firstOfTopic && best.shared >= own.shared + MIN_EXTRA_SHARED) : true;
  const plainlyCloser = best.shared >= MIN_SHARED_TO_TEACH && (!own || (inDoubt && best.score >= own.score * TAG_ADVANTAGE));
  const chosen = own && !(plainlyCloser && best !== own) ? own : plainlyCloser ? best : null;
  if (!chosen) return null;
  return {
    specPoint: { id: chosen.point.id, ref: chosen.point.ref.trim(), text: chosen.point.text.trim() },
    topicId: chosen.topicId,
    teaching: chosen.teaching,
    tagged: chosen.isTagged,
  };
}

/** Words another point must share with a question before it can stand in for the tag. */
const MIN_SHARED_TO_TEACH = 3;
/** A tagged point sharing more words than this with the question is never doubted. */
const MAX_SHARED_TO_DOUBT = 1;
/** How much closer another point must score before it overrules the tag. */
const TAG_ADVANTAGE = 2;
/** How many more of the question's words it must share than a first-statement tag. */
const MIN_EXTRA_SHARED = 3;

function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Build the hint ladder for a question from its own content. Every tier is
 * derived deterministically: what the question tests yields the cue, the
 * idea behind it yields the prompt, a similar worked example and the shape
 * of a mark-earning answer yield the scaffold, and this question's own
 * worked answer is the top tier.
 */
export function buildHintLadder(
  question: Question,
  topic?: { keyPoints: string[]; commonErrors: string[] },
  focus?: HintFocus,
): Hint[] {
  const hints: Hint[] = [];
  const parts = question.parts ?? [];
  const context = questionWords(question);
  const teaching = focus?.teaching ?? null;
  const specPoint = focus?.specPoint ?? null;
  const firstSentence = question.stem.split(/(?<=[.?!])\s/)[0] ?? question.stem;

  // Cue: which idea this is, without the idea itself.
  hints.push({
    tier: "cue",
    text: specPoint
      ? `This question tests ${specPoint.ref ? `${specPoint.ref}: ` : ""}${sentence(specPoint.text)} Decide which relationship or definition that calls for before you write.`
      : `Re-read this much of the stem only: “${firstSentence.trim()}”`,
  });

  // Prompt: the idea. Authored teaching for the tagged statement when there
  // is some, else the topic key point closest to the question.
  // Shown in the order they were written, so the second line can build on the first.
  const taughtLines = teaching ? teachingLinesFor(question, teaching.explain) : [];
  const keyPoint = topic?.keyPoints.length ? byRelevance(topic.keyPoints, context)[0] : undefined;
  const idea = (teaching ? byRelevance(teaching.explain, context)[0] : undefined) ?? keyPoint;
  if (taughtLines.length) {
    hints.push({ tier: "prompt", text: `Think about: ${taughtLines.join(" ")}`, detail: { lines: taughtLines } });
  } else if (keyPoint) {
    hints.push({ tier: "prompt", text: `Think about: ${keyPoint}` });
  }

  // The scaffold gives the *shape* of a mark-earning answer — part structure,
  // how many credited points to plan, what to avoid — never the credited
  // points themselves. With authored teaching it also carries a worked
  // example of a different problem on the same idea. The question's own mark
  // scheme stays hidden until the worked-solution tier (shown only once the
  // student has given up), so a student cannot reverse-engineer the exact
  // answer from the early rungs.
  const marksTotal = parts.reduce((sum, part) => sum + (part.marks || 0), 0);
  const structure: string[] = [];
  if (parts.length > 1) {
    structure.push(
      `answer in ${parts.length} parts — ${parts.map((part) => (part.label ? `“${part.label}”` : "the next part")).join(", then ")}`,
    );
  }
  structure.push(
    marksTotal > 0
      ? `plan ${marksTotal} distinct point${marksTotal === 1 ? "" : "s"} — one idea per mark, each stated, then linked to the case`
      : "state each idea once, then link it to the case in the question",
  );
  const commonError = topic?.commonErrors?.length ? byRelevance(topic.commonErrors, context)[0] : undefined;
  if (!teaching?.trap && commonError) structure.push(`avoid the classic trap: ${commonError}`);
  // Authored common errors end with their own full stop; don't add a second.
  const scaffoldText = `Structure the answer: ${structure.join("; ").replace(/[.\s]+$/, "")}.`;
  hints.push({
    tier: "scaffold",
    text: scaffoldText,
    ...(teaching
      ? {
          detail: {
            example: { prompt: teaching.worked.prompt, steps: [...teaching.worked.steps], answer: teaching.worked.answer },
            ...(teaching.trap ? { trap: teaching.trap } : {}),
          },
        }
      : {}),
  });

  // The top tier is always reachable, but only after the lower tiers are
  // spent — and in the UI only via an explicit give-up action. It is the
  // point where the credited material may finally be shown.
  const answered = parts.filter((part) => part.markScheme?.length || part.modelAnswer?.trim());
  if (answered.length || idea) {
    const markScheme = parts.find((part) => part.markScheme?.length)?.markScheme;
    const credited = markScheme
      ? `the credited points — ${markScheme.join(" · ")}`
      : idea ? `the topic's key point — ${idea}` : "each point the question asks for";
    hints.push({
      tier: "worked-solution",
      text: `Worked through: ${idea ? `start from “${idea}”, then hit` : "hit"} ${credited} in the order the question asks.`,
      ...(answered.length
        ? {
            detail: {
              solution: answered.map((part) => ({
                label: part.label ?? "",
                modelAnswer: part.modelAnswer?.trim() ?? "",
                points: [...(part.markScheme ?? [])],
              })),
            },
          }
        : {}),
    });
  }

  return hints;
}

/** The next hint after the ones already used, or null when the ladder is spent. */
export function nextHint(ladder: Hint[], usedTiers: HintTier[]): Hint | null {
  const used = new Set(usedTiers);
  return ladder.find((h) => !used.has(h.tier)) ?? null;
}

/** The tier's label, as shown before a hint. */
export function hintTierLabel(tier: HintTier): string {
  return TIER_LABELS[tier];
}

/** Present the hint with its tier label for the UI. */
export function formatHint(hint: Hint): string {
  const label = TIER_LABELS[hint.tier];
  // The prompt rung's text already opens "Think about:"; never print it twice.
  return hint.text.startsWith(`${label}:`) ? hint.text : `${label}: ${hint.text}`;
}
