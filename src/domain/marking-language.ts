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
/**
 * Tokens for coverage only. A full stop is punctuation, not part of the word:
 * "np." must match "np" (an answer's last word always carries one). Kept out
 * of `tokenise` itself so the anti-recitation cap in marking.ts, which also
 * reads `tokenise`, behaves exactly as before.
 */
function coverageTokens(text: string): string[] {
  const cached = COVERAGE_TOKEN_CACHE.get(text);
  if (cached) return cached;
  const tokens = [...new Set([...tokenise(canonicalPhrases(text))].map(sentenceFinalStem).filter((w) => w.length > 1))];
  if (COVERAGE_TOKEN_CACHE.size > 4096) COVERAGE_TOKEN_CACHE.clear();
  COVERAGE_TOKEN_CACHE.set(text, tokens);
  return tokens;
}

const COVERAGE_TOKEN_CACHE = new Map<string, string[]>();

/**
 * A full stop is punctuation, not part of the word: "genus." must stem like
 * "genus" ("np." like "np"). Decimal points ("2.") are left alone.
 */
export function sentenceFinalStem(token: string): string {
  return /\.$/.test(token) && !/\d\.$/.test(token) ? stem(token.replace(/\.+$/, "")) : token;
}

// ---------------------------------------------------------------------------
// Equivalent wording (sixteenth pass, 2026-10-12).
//
// Students write correct answers in their own words: "goes up" for "rises",
// "four times smaller" for "one quarter", "zero or negative" for "≤ 0",
// "inversely proportional to the square of the distance" for "∝ 1/r²".
// Keyword coverage used to miss these, so a correct answer could score 0.
//
// Each group below rewrites a phrase to one canonical form, on BOTH the
// scheme point and the answer, for coverage only (it never touches numeric,
// symbolic, contradiction or reject checks, which read the raw text). The
// rules for adding a group:
//   - every alternative means the same thing as the canonical form in any
//     A-level science or maths context, including its direction;
//   - never merge opposites, and never merge a mark-earning technical term
//     into a vaguer everyday word ("diffuses into" is NOT "moves into");
//   - ambiguous words stay out ("fall"/"drop" are nouns too, "left" is a
//     side, "leaves" are plant organs, "double" is a bond, "by a quarter"
//     is a 25% change, not a fourfold one).
// tests/marking-paraphrases.test.ts holds the before/after measurement and the
// regression checks (contradiction set, verbatim model answers).
// ---------------------------------------------------------------------------

const BIGGER = "bigger|larger|greater|higher|stronger|longer|more|as big|as large|as great|as high|as strong|as long|as much|the";
const SMALLER = "smaller|less|lower|weaker|shorter";

/** [canonical replacement, pattern source]. Order matters: longer phrases first. */
const PHRASE_EQUIVALENTS: Array<[string, string]> = [
  // Inverse-square dependence, in words or symbols.
  [" inversesquare ", "(?:is |are )?inversely proportional to (?:the )?(?:square of (?:the |its )?[a-z]+|[a-z]+ squared)"],
  [" inversesquare ", "(?:varies |falls off |decreases )?inversely (?:as|with) (?:the )?square of (?:the |its )?[a-z]+"],
  [" inversesquare ", "inverse[- ]square"],
  [" inversesquare ", "(?:∝\\s*)?1\\s*/\\s*[rdx]\\s*(?:²|\\^\\s*2)"],
  // Scaling by four, in either direction. "four times the stress" is an
  // increase; "four times smaller" is a quarter.
  [" fourfoldup ", "(?:four|4) times (?:" + BIGGER + ")|fourfold"],
  [" quarter ", "(?:four|4) times (?:" + SMALLER + ")"],
  [" fourfoldup ", "quadrupl(?:es|ed|ing|e)"],
  [" threequarters ", "three[- ]quarters"],
  [" quarter ", "(?<!by )(?:one|a) quarter|quartered|quartering"],
  [" half ", "(?:two|2) times (?:" + SMALLER + ")|halv(?:es|ed|ing|e)|one half"],
  [" twofoldup ", "twice (?:" + BIGGER + ")|(?:two|2) times (?:" + BIGGER + ")"],
  // Inequalities said in words.
  [" ≤ 0 ", "(?:zero|0) or negative|negative or (?:zero|0)|less than or equal to (?:zero|0)"],
  [" ≥ 0 ", "(?:zero|0) or positive|positive or (?:zero|0)|greater than or equal to (?:zero|0)"],
  [" ≤ ", "less than or equal to"],
  [" ≥ ", "greater than or equal to"],
  // Direction of change.
  [" increases ", "go(?:es|ing)? up|went up|gone up|ris(?:es|en|ing)|rise"],
  [" decreases ", "go(?:es|ing)? down|went down|gone down|falls|fell|fallen|drops|dropped"],
  [" increases rate ", "more (?:often|frequently|frequent)"],
  [" faster ", "more (?:quickly|rapidly)|quicker"],
  [" rapidly ", "quickly"],
  // Movement across a boundary ("diffuses"/"osmosis" stay distinct).
  [" enter ", "(?:mov|go|flow|pass)(?:es|ed|ing|e)? into|goes into|went into|enters|entered|entering"],
  [" exit ", "(?:mov|go|flow|pass)(?:es|ed|ing|e)? out of|goes out of|went out of|is lost from|are lost from|lost from|exits|exited|leaves(?= (?:the|a|an|its|their|through|via) )"],
  [" initially ", "at first|to begin with|at the start"],
  // Framing that carries no content of its own.
  [" ", "of (?:its|the) (?:previous|original|initial|old) value|of what it was|of the original|as big|as large|as strong|as much"],
  [" notlinear ", "not (?:just |simply |only )?(?:linearly|1\\s*/\\s*[rdx](?![²^\\d])|(?:proportional to |with )?(?:the )?(?:distance|separation|radius)(?! squared))"],
  // Same word, different spelling or register.
  [" collisions ", "collid(?:es|ed|ing|e)|collisions|hit(?:s|ting)?"],
  [" produces ", "produc(?:es|ed|ing)|synthesi[sz](?:es|ed|ing|e)|made"],
  [" amount ", "quantit(?:y|ies)|amounts"],
  [" successive ", "consecutive"],
  [" eukarya ", "eukaryota"],
];

const PHRASE_PATTERN = new RegExp(
  PHRASE_EQUIVALENTS.map(([, source], index) => `(?<g${index}>(?<![a-z])(?:${source})(?![a-z]))`).join("|"),
  "gi",
);

/** Rewrite equivalent wording to one canonical form (coverage only). */
export function canonicalPhrases(text: string): string {
  return text.replace(PHRASE_PATTERN, (...args) => {
    const groups = args[args.length - 1] as Record<string, string | undefined>;
    for (let index = 0; index < PHRASE_EQUIVALENTS.length; index++) {
      if (groups[`g${index}`] !== undefined) return PHRASE_EQUIVALENTS[index]![0];
    }
    return args[0] as string;
  });
}

/**
 * Inequalities said in words, rewritten as symbols before any check reads the
 * answer, so the numeric and relation checks judge "ΔG is zero or negative"
 * exactly as they judge "ΔG ≤ 0" (and "zero or positive" as "≥ 0", which the
 * relation veto then rejects for a "≤ 0" point).
 */
export function inequalityWordsToSymbols(text: string): string {
  if (!/zero|negative|positive|equal to/i.test(text)) return text;
  return text
    .replace(/(?<![a-z])(?:zero or negative|negative or zero|less than or equal to (?:zero|0))(?![a-z])/gi, "≤ 0")
    .replace(/(?<![a-z])(?:zero or positive|positive or zero|greater than or equal to (?:zero|0))(?![a-z])/gi, "≥ 0")
    .replace(/(?<![a-z])less than or equal to(?![a-z])/gi, "≤")
    .replace(/(?<![a-z])greater than or equal to(?![a-z])/gi, "≥");
}

/**
 * A scheme point written only in notation ("P(A ∩ B) = P(A)P(B|A)") has no
 * words for coverage to read, so it could never be credited, even verbatim.
 * True when the point's notation, ignoring spacing and closing punctuation,
 * appears in the answer exactly.
 */
export function notationOnlyPoint(point: string): boolean {
  // Digits stay with the numeric layer: "x=2" must never be found inside "x=25".
  return !/\d/.test(point) && coverageTokens(point).length === 0 && compactNotation(point).length >= 3;
}

function compactNotation(text: string): string {
  return text.replace(/\s+/g, "").replace(/[−–]/g, "-").replace(/[.;,]+$/, "");
}

/** The whole notation, not a prefix of a longer expression ("P(A)" is not in "P(A)²"). */
export function notationPresent(point: string, answer: string): boolean {
  const wanted = compactNotation(point);
  if (wanted.length < 3) return false;
  const body = [...wanted].map((ch) => (ch === "-" ? "[-−–]" : ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))).join("\\s*");
  const before = "(?<![A-Za-z0-9(^_′'|∩∪/*×+=-])";
  const after = "(?![A-Za-z0-9(^_′'²³|∩∪/*×+=-]|\\s*[A-Za-z0-9(²³|∩∪/*×+=-])";
  return new RegExp(before + body + after).test(answer);
}

/**
 * Opposite directions once equivalent wording is canonicalised: "goes down"
 * for a point that says "rises", "moves out of" for "enters", "four times
 * bigger" for "one quarter". True when the answer states the opposite and
 * never the point's own direction (in any equivalent wording), so a correct
 * answer that also mentions the other direction elsewhere is never vetoed.
 */
const DIRECTION_PAIRS: Array<[RegExp, RegExp]> = [
  [/\bincreases?\b(?! rate)|\bincreas(?:ed|ing)\b/, /\bdecreases?\b|\bdecreas(?:ed|ing)\b/],
  [/\benter\b/, /\bexit\b/],
  [/\bquarter\b/, /\bfourfoldup\b/],
  [/\bquarter\b/, /\bhalf\b/],
  [/\bfourfoldup\b/, /\btwofoldup\b/],
];

export function canonicalDirectionConflict(point: string, answer: string, pairs: Array<[RegExp, RegExp]> = DIRECTION_PAIRS): boolean {
  const p = canonicalPhrases(point).toLowerCase();
  const a = canonicalPhrases(answer).toLowerCase();
  return pairs.some(([x, y]) =>
    (x.test(p) && !y.test(p) && y.test(a) && !x.test(a)) ||
    (y.test(p) && !x.test(p) && x.test(a) && !y.test(a)));
}

/** Only the scaling pairs (a quarter is not fourfold, nor a half; fourfold is not twofold), for Physics. */
export function canonicalScalingConflict(point: string, answer: string): boolean {
  return canonicalDirectionConflict(point, answer, DIRECTION_PAIRS.slice(2));
}

/**
 * A point about one labelled case ("In A, water enters…") is judged on the
 * part of the answer about that case when the answer labels its cases, so
 * "In B, water moves into the tissue" cannot supply the words for A.
 */
export function labelledAnswerScope(point: string, answer: string): string {
  const label = point.match(/^(?:In|For)\s+([A-Z])\b,/)?.[1];
  if (!label) return answer;
  const mentions = new RegExp(`\\b(?:[Ii]n|[Ff]or)\\s+${label}\\b`);
  const anyLabel = /\b(?:[Ii]n|[Ff]or)\s+[A-Z]\b/;
  const fragments = answer.split(/(?<=[.;!?])\s+/);
  if (fragments.filter((fragment) => anyLabel.test(fragment)).length < 2) return answer;
  const scoped = fragments.filter((fragment) => mentions.test(fragment));
  return scoped.length ? scoped.join(" ") : answer;
}

/** Coverage tokens of a text, as a set (the scaffolding guard in marking.ts). */
export function canonicalTokenSet(text: string): Set<string> {
  return new Set(coverageTokens(text).map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")).filter(Boolean));
}

export function pointCoverage(point: string, answer: string, earlyExitAt?: number): number {
  const wanted = coverageTokens(point);
  if (!wanted.length) return 0;
  const given = coverageTokens(answer);
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
