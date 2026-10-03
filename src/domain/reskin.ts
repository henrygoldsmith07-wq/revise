// ---------------------------------------------------------------------------
// Shallow-variation detection shared by the supply audit and proof rules.
// Number swaps, noun swaps and same-reasoning rewordings are one question in
// disguise: they must never count as independent evidence. Pure, cached per
// question object, and free of learner or trust dependencies.
// ---------------------------------------------------------------------------

import { isNearDuplicateReasoning, reasoningProfilesOf, reasoningSimilarity, type ReasoningProfile } from "./reasoning-signature";
import { promptSignature } from "./text-similarity";
import type { Question } from "./types";

export type ShallowKind = "number-swap" | "noun-swap" | "same-signature";

/** Value-stripped overlap at or above this is a rewording, not a new question. */
export const NEAR_DUPLICATE = 0.8;
/** Below this many content words, similarity is meaningless. */
const MIN_TOKENS = 5;

const UNITS = new Set(["kg", "g", "mg", "m", "cm", "mm", "nm", "km", "s", "ms", "min", "h", "hz", "khz", "mhz", "n", "j", "kj",
  "mol", "dm", "v", "mv", "a", "ma", "w", "kw", "pa", "kpa", "atm", "l", "ml", "k", "c", "°c", "°", "%", "ev", "µf", "μf", "ω", "ohm", "ohms",
  "metres", "meters", "seconds", "minutes", "hours", "degrees", "grams", "newtons", "joules", "volts", "amps", "watts"]);
const unitToken = (token: string): boolean => {
  const bare = token.replace(/[^a-zµμω°%0-9^-]/g, "").replace(/\^?-?\d$/, "");
  return UNITS.has(bare) || (bare.length > 1 && /^[kmcdµμnp]/.test(bare) && UNITS.has(bare.slice(1)));
};

/** Text with every number and following unit removed: equal keys are number swaps. */
function numberKey(text: string): string {
  const replaced = text.toLowerCase().replace(/[−–—]/g, "-")
    .replace(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x*]\s*10\s*\^?\s*[+-]?\d+)?(?:e[+-]?\d+)?/g, " # ")
    .replace(/[^a-z0-9#µμω°%^ -]+/g, " ");
  const out: string[] = [];
  for (const token of replaced.split(/\s+/).filter(Boolean)) {
    if (out.length && out[out.length - 1] === "#" && (unitToken(token) || token === "#")) continue;
    out.push(token);
  }
  return out.join(" ");
}


export interface ReskinFeatures {
  numberKey: string;
  tokens: string[];
  tokenSet: Set<string>;
  grams: Set<string>;
  profiles: () => ReasoningProfile[];
}

const promptText = (q: Question): string => `${q.stem} ${q.parts.map((part) => part.prompt).join(" ")}`;
const cache = new WeakMap<Question, ReskinFeatures>();

export function reskinFeatures(question: Question): ReskinFeatures {
  const hit = cache.get(question);
  if (hit) return hit;
  const text = promptText(question);
  const signature = promptSignature(text);
  const tokens = signature.split(" ").filter(Boolean);
  const squashed = signature.replace(/[^a-z0-9#]/g, "");
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= squashed.length; i++) grams.add(squashed.slice(i, i + 3));
  let profiles: ReasoningProfile[] | null = null;
  const features: ReskinFeatures = { numberKey: numberKey(text), tokens, tokenSet: new Set(tokens), grams, profiles: () => (profiles ??= reasoningProfilesOf(question)) };
  cache.set(question, features);
  return features;
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / Math.min(a.size, b.size);
}

/** Why two questions are one question in disguise, or null if they differ. */
export function shallowRelationOf(a: ReskinFeatures, b: ReskinFeatures): ShallowKind | null {
  if (a.tokens.length < MIN_TOKENS || b.tokens.length < MIN_TOKENS) return null;
  if (a.numberKey === b.numberKey) return "number-swap";
  const swapped = a.tokens.length === b.tokens.length ? a.tokens.filter((token, i) => token !== b.tokens[i]).length : Infinity;
  if (swapped <= Math.max(1, Math.floor(a.tokens.length * 0.2)) ||
    Math.max(overlap(a.tokenSet, b.tokenSet), overlap(a.grams, b.grams)) >= NEAR_DUPLICATE) return "noun-swap";
  const pa = a.profiles(), pb = b.profiles();
  if (pa.length && pa.length === pb.length &&
    pa.every((profile, i) => {
      const other = pb[i]!;
      return (profile.reasoningMoves.length > 0 || profile.solutionPath.length > 0) && isNearDuplicateReasoning(profile, other) &&
        reasoningSimilarity(profile, other).signals.promptStructure >= 0.5;
    })) return "same-signature";
  return null;
}

/** True when `candidate` is a number/noun/reasoning reskin of `other`. */
export function isShallowReskin(candidate: Question, other: Question): boolean {
  return candidate.id !== other.id && shallowRelationOf(reskinFeatures(candidate), reskinFeatures(other)) !== null;
}
