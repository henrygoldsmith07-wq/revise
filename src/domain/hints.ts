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
// ---------------------------------------------------------------------------

import type { Question } from "./types";
import type { HintTier } from "./hint-tiers";

export { HINT_TIERS, hintEvidenceMultiplier, hintEvidenceSource, type HintTier } from "./hint-tiers";

export interface Hint {
  tier: HintTier;
  /** The support itself, ready to show verbatim. */
  text: string;
}

const TIER_LABELS: Record<HintTier, string> = {
  cue: "Small cue",
  prompt: "Think about",
  scaffold: "Scaffold",
  "worked-solution": "Worked solution",
};

/**
 * Build the hint ladder for a question from its own content. Every tier is
 * derived deterministically: the stem's command language yields the cue, the
 * topic's key points yield the prompt, the mark scheme yields the scaffold,
 * and a fully worked answer yields the top tier.
 */
export function buildHintLadder(question: Question, topic?: { keyPoints: string[]; commonErrors: string[] }): Hint[] {
  const hints: Hint[] = [];
  const firstSentence = question.stem.split(/(?<=[.?!])\s/)[0] ?? question.stem;

  hints.push({
    tier: "cue",
    text: `Re-read this much of the stem only: “${firstSentence.trim()}”`,
  });

  const keyPoint = topic?.keyPoints[0];
  if (keyPoint) {
    hints.push({ tier: "prompt", text: `Think about: ${keyPoint}` });
  }

  // The scaffold gives the *shape* of a mark-earning answer — part structure,
  // how many credited points to plan, what to avoid — never the credited
  // points themselves. The question's own mark scheme stays hidden until the
  // worked-solution tier (shown only once the student has given up), so a
  // student cannot reverse-engineer the exact answer from the early rungs.
  const parts = question.parts ?? [];
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
  if (topic?.commonErrors?.length) {
    structure.push(`avoid the classic trap: ${topic.commonErrors[0]}`);
  }
  hints.push({ tier: "scaffold", text: `Structure the answer: ${structure.join("; ")}.` });

  if (keyPoint) {
    // The top tier is always reachable, but only after the lower tiers are
    // spent — and in the UI only via an explicit give-up action. It is the
    // point where the credited material may finally be shown.
    const markScheme = parts.find((p) => p.markScheme?.length)?.markScheme;
    const credited = markScheme ? `the credited points — ${markScheme.join(" · ")}` : `the topic's key point — ${keyPoint}`;
    hints.push({
      tier: "worked-solution",
      text: `Worked through: start from “${keyPoint}”, then hit ${credited} in the order the question asks.`,
    });
  }

  return hints;
}

/** The next hint after the ones already used, or null when the ladder is spent. */
export function nextHint(ladder: Hint[], usedTiers: HintTier[]): Hint | null {
  const used = new Set(usedTiers);
  return ladder.find((h) => !used.has(h.tier)) ?? null;
}

/** Present the hint with its tier label for the UI. */
export function formatHint(hint: Hint): string {
  return `${TIER_LABELS[hint.tier]}: ${hint.text}`;
}
