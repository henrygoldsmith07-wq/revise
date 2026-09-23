// ---------------------------------------------------------------------------
// Hint tiers — the escalating support ladder, cheapest first, plus the
// evidence weight each tier carries.
//
// Lives apart from ./hints so strict-checked domain modules (see
// tsconfig.strict.json) can weight hint-assisted marks without importing
// ./capability-mastery, whose indexed-access paths noUncheckedIndexedAccess
// rejects. The weights mirror EVIDENCE_WEIGHT there 1:1 —
// tests/adaptive-tutor.test.ts pins the parity, so drift fails loudly.
// ---------------------------------------------------------------------------

/** Escalating support tiers, cheapest first. */
export const HINT_TIERS = ["cue", "prompt", "scaffold", "worked-solution"] as const;
export type HintTier = (typeof HINT_TIERS)[number];

/** How much a success is worth, by how much support it needed. Mirrors EVIDENCE_WEIGHT in ./capability-mastery. */
const HINT_EVIDENCE_WEIGHT = {
  independent: 1,
  assisted: 0.5,
  viewed: 0.15,
} as const;

export type HintEvidenceSource = keyof typeof HINT_EVIDENCE_WEIGHT;

/** Evidence rung for a success that needed this tier of support. */
export function hintEvidenceSource(tier: HintTier | null): HintEvidenceSource {
  if (tier === null) return "independent";
  if (tier === "cue") return "assisted";
  if (tier === "prompt") return "assisted";
  return "viewed";
}

/** Evidence weight for a success that needed this tier of support. */
export function hintEvidenceMultiplier(tier: HintTier | null): number {
  return HINT_EVIDENCE_WEIGHT[hintEvidenceSource(tier)];
}
