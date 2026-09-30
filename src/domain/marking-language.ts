/** Pure lexical coverage: normalization, morphology and bounded typo matching. */
export const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "in", "is", "are", "was", "were", "and", "or", "for", "on",
  "at", "by", "with", "as", "that", "this", "it", "its", "be", "from", "will", "can", "has",
  "have", "had", "not", "but", "so", "if", "then", "than", "when", "which", "there", "any",
  "more", "less", "also", "into", "each", "their", "they", "you", "your", "we", "one", "two",
]);

const MATH_NOTATION_TOKENS = new Set(["pi", "theta", "delta", "sqrt", "leq", "geq", "approx", "plusminus"]);

/** Cheap stemmer: enough to make "oxidised"/"oxidise"/"oxidation" agree. */
export function stem(word: string): string {
  if (MATH_NOTATION_TOKENS.has(word)) return word;
  let w = word;
  for (const suffix of ["ations", "ation", "ising", "izing", "ised", "ized", "ise", "ize", "ing", "ies", "es", "ed", "s"]) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  return w;
}

export function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Preserve meaningful maths notation as words before punctuation is
      // stripped. This lets rubric matching distinguish π from a bare number,
      // or ≤ from an equality that happens to share the same boundary value.
      .replace(/π/g, " pi ")
      .replace(/θ/g, " theta ")
      .replace(/δ/g, " delta ")
      .replace(/√/g, " sqrt ")
      .replace(/≤/g, " leq ")
      .replace(/≥/g, " geq ")
      .replace(/≈/g, " approx ")
      .replace(/±/g, " plusminus ")
      .replace(/[^a-z0-9+\-.^/=²³ ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
      .map(stem),
  );
}

/** Bounded edit-distance test (optimal string alignment): true when a and b differ by at most `maxEdits` insertions, deletions, substitutions or adjacent transpositions. */
export function withinEditDistance(a: string, b: string, maxEdits: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > maxEdits) return false;
  const small = a.length <= b.length ? a : b;
  const large = a.length <= b.length ? b : a;
  let prev2: number[] | null = null;
  let prev = Array.from({ length: small.length + 1 }, (_, i) => i);
  for (let i = 1; i <= large.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= small.length; j++) {
      const prevJm1 = prev[j - 1] ?? 0;
      const prevJ = prev[j] ?? 0;
      const curJm1 = cur[j - 1] ?? 0;
      const substitution = prevJm1 + (large[i - 1] === small[j - 1] ? 0 : 1);
      let best = Math.min(prevJ + 1, curJm1 + 1, substitution);
      // Adjacent transposition counts as a single edit.
      if (i > 1 && j > 1 && large[i - 1] === small[j - 2] && large[i - 2] === small[j - 1]) {
        best = Math.min(best, (prev2 ? prev2[j - 2] ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY) + 1);
      }
      cur[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > maxEdits) return false;
    prev2 = prev;
    prev = cur;
  }
  return (prev[small.length] ?? Number.POSITIVE_INFINITY) <= maxEdits;
}

/**
 * 0–1 overlap of a mark-scheme point's content words with the answer.
 * Tokens match under bounded edit distance: one edit from five characters,
 * two edits from eight — enough to absorb handwriting noise without
 * confusing genuinely different words. The two-edit path also requires a
 * shared three-character prefix so sibling scheme points that happen to
 * sound alike are not credited by each other.
 */
export function pointCoverage(point: string, answer: string, earlyExitAt?: number): number {
  const wanted = [...tokenise(point)];
  if (!wanted.length) return 0;
  const given = [...tokenise(answer)];
  const exact = new Set(given);
  let exactHits = 0;
  for (const w of wanted) if (exact.has(w)) exactHits++;
  // Fast path: when exact keyword coverage already clears the caller threshold,
  // skip the fuzzy scan entirely — the hot loop in marking and benchmarks.
  if (earlyExitAt != null && exactHits / wanted.length >= earlyExitAt) return exactHits / wanted.length;
  const missing = earlyExitAt != null ? wanted.filter((w) => !exact.has(w)) : wanted;
  const hits = missing.filter((w) => {
    if (exact.has(w)) return true;
    if (w.length >= 8 && given.some((g) => g.length >= 8 && g.slice(0, 3) === w.slice(0, 3) && withinEditDistance(g, w, 2))) {
      return true;
    }
    return w.length >= 5 && given.some((g) => g.length >= 5 && withinEditDistance(g, w, 1));
  }).length;
  return (earlyExitAt != null ? exactHits + hits : hits) / wanted.length;
}
