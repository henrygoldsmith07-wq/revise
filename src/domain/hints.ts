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
import { EVIDENCE_WEIGHT, type EvidenceSource } from "./capability-mastery";

/** Escalating support tiers, cheapest first. */
export const HINT_TIERS = ["cue", "prompt", "scaffold", "worked-solution"] as const;
export type HintTier = (typeof HINT_TIERS)[number];

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

/** Evidence weight for a success that needed this tier of support. */
export function hintEvidenceSource(tier: HintTier | null): EvidenceSource {
  if (tier === null) return "independent";
  if (tier === "cue") return "assisted";
  if (tier === "prompt") return "assisted";
  return "viewed";
}

export function hintEvidenceMultiplier(tier: HintTier | null): number {
  return EVIDENCE_WEIGHT[hintEvidenceSource(tier)];
}

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

  const parts = (question.parts ?? []).filter((p) => p.markScheme);
  const markScheme = parts[0]?.markScheme;
  if (markScheme) {
    hints.push({ tier: "scaffold", text: `The mark scheme credits: ${markScheme}` });
  } else if (keyPoint) {
    hints.push({ tier: "scaffold", text: `Structure the answer around: ${keyPoint}` });
  }

  if (keyPoint) {
    // The top tier is always reachable: a worked walk-through from the key
    // point through the credited points (or the topic's classic error).
    const stretch = markScheme ?? topic?.commonErrors[0];
    hints.push({
      tier: "worked-solution",
      text: stretch
        ? `Worked through: start from “${keyPoint}”, then hit the credited points — ${stretch}`
        : `Worked through: answer the question using “${keyPoint}” at every step.`,
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
