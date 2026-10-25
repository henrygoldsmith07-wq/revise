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
/**
 * One spelling for the same notation (pass 71): "V_out", "Vout"; "R₂", "R2";
 * "R1+R2", "R1 + R2". Both the scheme and the answer pass
 * through it, so only equal notation becomes equal.
 */
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";
export function normaliseNotation(text: string): string {
  return text
    .replace(/[₀-₉]/g, (c) => String(SUBSCRIPTS.indexOf(c)))
    .replace(/\b([xyXY])[- ]axis/g, "$1axis")
    .replace(/([A-Za-z])_([A-Za-z0-9]+)/g, "$1$2")
    .replace(/([A-Za-z0-9])\+([A-Za-z0-9])/g, "$1 + $2");
}

function coverageTokens(text: string): string[] {
  const cached = COVERAGE_TOKEN_CACHE.get(text);
  if (cached) return cached;
  // "Pioneer species / lichens": a spaced slash between two words is the
  // same either-or as "iodine/KI" (one token, read by alternativesOf).
  const joined = text.includes("/") ? text.replace(/([A-Za-z]{2,})\s+\/\s+(?=[A-Za-z]{2,})/g, "$1/") : text;
  // "and/or" is a connective, like "and" and "or" themselves.
  const tokens = [...new Set([...tokenise(canonicalPhrases(genotypeWords(normaliseNotation(joined))))].map(sentenceFinalStem).filter((w) => w.length > 1 && w !== "and/or"))];
  if (COVERAGE_TOKEN_CACHE.size > 4096) COVERAGE_TOKEN_CACHE.clear();
  COVERAGE_TOKEN_CACHE.set(text, tokens);
  return tokens;
}

const COVERAGE_TOKEN_CACHE = new Map<string, string[]>();

/** Units and derivatives keep their slash: "mol/dm", "dy/dx" are not either-or. */
const SLASH_KEEPS = /^(?:mol|dm|cm|mm|km|kg|ms|hz|kj|mj|kpa|pa|min|hr|nm|ml|kw|kwh|ohm|rad|d[a-z])$/;

/**
 * A scheme's "A/B" is an either-or ("digested/assimilated", "iodine/KI"):
 * the token is matched when any alternative is. Null for any other token,
 * including units ("mol/dm") and ratios of symbols ("dy/dx").
 */
export function alternativesOf(token: string): string[] | null {
  if (!token.includes("/")) return null;
  const parts = token.split("/");
  if (parts.length < 2 || parts.some((part) => !/^[a-z]{2,}$/.test(part) || SLASH_KEEPS.test(part)) || !parts.some((part) => part.length >= 3)) return null;
  return parts.map(stem);
}

const GENOTYPE = /(?<![A-Za-z])([A-Za-z])([A-Za-z])(?![A-Za-z])/g;

/**
 * Genotypes keep their case. Lower-casing made "Ss", "SS" and "ss" one
 * token, so a cross of the wrong parents ("ss × ss") matched "Ss × Ss".
 * Each becomes a word that says which it is (heterozygous S, homozygous
 * dominant S, homozygous recessive S), and a cross written as "Ss × Ss"
 * says "cross" whether or not the text adds "the parents are". Applied only
 * to a text with a "×" between genotypes or two genotypes of one letter, so
 * ordinary two-letter words are left alone.
 */
export function genotypeWords(text: string): string {
  if (!/(?<![A-Za-z])([A-Za-z])\1(?![A-Za-z])|(?<![A-Za-z])[A-Z][a-z](?![A-Za-z])/i.test(text)) return text;
  // "AA", "Aa" and "aa" are genotypes; "aA", "is", "an" are not.
  const isGenotype = (a: string, b: string) => a.toLowerCase() === b.toLowerCase() && !(a === a.toLowerCase() && b !== b.toLowerCase());
  const perLetter = new Map<string, number>();
  for (const [, a, b] of text.matchAll(GENOTYPE)) {
    if (isGenotype(a!, b!)) perLetter.set(a!.toLowerCase(), (perLetter.get(a!.toLowerCase()) ?? 0) + 1);
  }
  if (![...perLetter.values()].some((count) => count >= 2)) return text;
  const name = (a: string, b: string) => {
    const letter = a.toLowerCase();
    if (a !== b) return ` heterozygous het${letter} `;
    return a === a.toUpperCase() ? ` homozygous homdom${letter} ` : ` homozygous homrec${letter} `;
  };
  return text
    .replace(/(?:(?:the\s+)?parents?\s+(?:are|is|were)\s+|(?:the\s+)?cross\s+(?:is\s+|of\s+)?)?(?<![A-Za-z])([A-Za-z])([A-Za-z])\s*[×x]\s*([A-Za-z])([A-Za-z])(?![A-Za-z])/gi,
      (match, a: string, b: string, c: string, d: string) =>
        isGenotype(a, b) && isGenotype(c, d) && a.toLowerCase() === c.toLowerCase() ? ` cross ${name(a, b)} ${name(c, d)} ` : match)
    .replace(GENOTYPE, (match, a: string, b: string) => (isGenotype(a, b) ? name(a, b) : match));
}

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
  [" quarter ", "(?<!by )(?:one|a) quarter|quartered|quartering|(?<![\\d./]|by )1\\s*/\\s*4(?![\\d./])"],
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
  // Physics wording a Year 12 student uses for the same thing (pass 62).
  [" drag ", "air resistance|fluid resistance"],
  [" equals ", "(?:is |are )?(?:exactly )?(?:the same (?:size|magnitude|value) as|equal (?:in (?:size|magnitude) )?to|equals|same as)"],
  [" minimum ", "(?:smallest|least|lowest) (?:amount of )?(?=energy|work)"],
  [" release ", "free(?:s|d)?(?= (?:an |the |a |one )?electrons?)|remov(?:e|es|ed|ing)(?= (?:an |the |a |one )?electrons? from)"],
  [" angular displacement ", "(?:the )?angle (?:turned|swept|rotated|moved) through"],
  [" rate of change of angular displacement ", "how fast (?:the )?(?:angle|angular displacement)(?: turned through| swept out| rotated)? changes(?: with time)?"],
  // Pass 68: more correct Year 12 Physics wordings the schemes phrase differently.
  [" rate of flow of charge ", "how (?:much|many) (?:electric )?charge (?:flows?|passes?|moves?) (?:past|through)(?: a| any| the)?(?: given)?(?: point| section| cross[- ]section)? (?:each|every|per|in one) second"],
  [" sum of ", "total of|adding up|add up"],
  [" spherical area ", "(?:the )?surface of a sphere(?:, whose area is)?|area of a sphere"],
  [" perpendicular distance ", "perpendicular (?:distance )?from the pivot"],
  [" 1 c s-1 ", "(?:one |1 )?coulombs? per second"],
  [" kg m s-1 ", "kg m ?/ ?s"],
  [" equals ", "identical to"],
  [" closed ", "no external force(?:s)? (?:act|acts|acting)"],
  [" closeness ", "how close(?:ly)?(?: [a-z]+){0,3}? (?:is|are) to"],
  [" find signed area ", "add(?:ing)? up the areas?"],
  [" smallintervals ", "(?:small|short|tiny|many) (?:time )?(?:intervals|steps|sections|chunks)"],
  // Pass 69: gradient is slope; "measured in" introduces the unit; BAcosθ run together.
  [" slope ", "gradient"],
  // Pass 73: own-words forms of two scheme points that Year 12 students phrase differently.
  [" reduces the maximum amplitude ", "(?:the )?(?:resonance )?peak (?:is |becomes |gets )?(?:much |far |a lot |a bit )?(?:lower|smaller|reduced)"],
  [" reduced heat loss ", "less (?:heat|energy|thermal energy) (?:is |gets )?(?:lost|transferred)"],
  // Pass 74: own-words forms for polarisation, sonar and terminal speed.
  [" polarisation restricts oscillations to one direction ", "polarisation means (?:that )?(?:the )?(?:waves?|light) (?:only )?(?:vibrates?|oscillates?) in (?:just |only )?one (?:plane|direction)"],
  [" only transverse oscillations can be restricted in this way ", "(?:so )?(?:the )?(?:light|wave) (?:must be|has to be) transverse"],
  [" longitudinal waves oscillate parallel to propagation and cannot be polarised ", "(?:a )?longitudinal waves? (?:vibrates?|oscillates?) (?:along|parallel to) (?:its|the) (?:direction|propagation)[a-z ]{0,30}(?:so|and) (?:a |the )?filter (?:could not|cannot|can't|would not) (?:stop|block|polari[sz]e)[a-z ]{0,20}"],
  [" λ = v/f ", "wavelength (?:=|is|equals) (?:the )?speed (?:divided by|over|/) frequency"],
  [" a shorter wavelength allows smaller separations to be distinguished ", "(?:the )?wavelength is (?:tiny|small|short)[a-z ,]{0,160}small objects (?:can be )?(?:told apart|resolved|distinguished|seen)"],
  [" drag increases with speed ", "(?:the )?(?:air resistance|drag) (?:grows|increases|gets bigger|gets larger|rises)(?: as (?:it|the object) (?:speeds up|goes faster|falls faster))?"],
  [" drag equals weight ", "drag (?:is |becomes )?(?:the same|equal)(?: size)?(?: as| to)? (?:its |the )?weight|(?:air resistance|drag) balances (?:its |the )?weight"],
  // Pass 76: own-words forms for beta-minus charge balance.
  [" an electron and an electron antineutrino are emitted ", "an electron and (?:an |the )?(?:electron )?antineutrino (?:come|comes|is emitted|are emitted|are given off|is given off) ?(?:out)?"],
  [" neutron charge 0 becomes proton charge +1 and electron charge −1 ", "(?:the )?neutron is (?:neutral|uncharged|0)[a-z ,]{0,40}(?:turns|changes|decays) into a proton \\(\\+1\\) and an electron \\((?:-|−)1\\)"],
  [" the antineutrino has zero charge ", "(?:the )?antineutrino (?:has no charge|is neutral|is uncharged)[a-z ]{0,40}"],
  [" exceeds ", "(?:is )?(?:bigger|larger|greater|more) than"],
  [" unit ", "measured in|in units of"],
  [" ba cos θ ", "ba ?cos ?(?:θ|theta)"],
  // Framing that carries no content of its own.
  [" ", "of (?:its|the) (?:previous|original|initial|old) value|of what it was|of the original|as big|as large|as strong|as much"],
  [" notlinear ", "not (?:just |simply |only )?(?:linearly|1\\s*/\\s*[rdx](?![²^\\d])|(?:proportional to |with )?(?:the )?(?:distance|separation|radius)(?! squared))"],
  // A reagent or product named by its formula or by its name: one substance,
  // so one word ("NaOH then CuSO₄" is "sodium hydroxide then copper(II)
  // sulfate"). Only unambiguous names: "HCl" is the acid as the scheme
  // writes it, and "hydrogen chloride" (the gas) is left alone; "oxygen" and
  // "hydrogen" stay unmapped because they also name the atom.
  [" naoh ", "sodium hydroxide|naoh"],
  [" koh ", "potassium hydroxide|koh"],
  [" cuso4 ", "copper\\s*\\(\\s*ii\\s*\\)\\s*sul(?:ph|f)ate|copper sul(?:ph|f)ate|cuso[4₄]"],
  [" hcl ", "hydrochloric acid|hcl"],
  [" h2so4 ", "sul(?:ph|f)uric acid|sul(?:ph|f)uric\\s*\\(\\s*vi\\s*\\)\\s*acid|h[2₂]so[4₄]"],
  [" hno3 ", "nitric acid|nitric\\s*\\(\\s*v\\s*\\)\\s*acid|hno[3₃]"],
  [" kmno4 ", "potassium manganate\\s*\\(\\s*vii\\s*\\)|potassium permanganate|kmno[4₄]"],
  [" k2cr2o7 ", "potassium dichromate(?:\\s*\\(\\s*vi\\s*\\))?|k[2₂]cr[2₂]o[7₇]"],
  [" agno3 ", "silver nitrate|agno[3₃]"],
  [" nahco3 ", "sodium hydrogen\\s?carbonate|sodium bicarbonate|nahco[3₃]"],
  [" na2co3 ", "sodium carbonate|na[2₂]co[3₃]"],
  [" co2 ", "carbon dioxide|co[2₂]"],
  [" h2o ", "water|h[2₂]o(?![2₂])"],
  [" nh3 ", "ammonia|nh[3₃]"],
  // A reaction order said as a number or as an ordinal ("order one", "first
  // order", "order with respect to A is 1").
  [" firstorder ", "first[- ]order|order (?:of |is |= ?)?(?:one|1)(?![\\d.])|(?<=order (?:in|with respect to|for) [a-z0-9₀-₉()]+ )(?:is |= ?)(?:one|1)(?![\\d.])"],
  [" secondorder ", "second[- ]order|order (?:of |is |= ?)?(?:two|2)(?![\\d.])|(?<=order (?:in|with respect to|for) [a-z0-9₀-₉()]+ )(?:is |= ?)(?:two|2)(?![\\d.])"],
  [" zeroorder ", "zero(?:th)?[- ]order|order (?:of |is |= ?)?(?:zero|0)(?![\\d.])|(?<=order (?:in|with respect to|for) [a-z0-9₀-₉()]+ )(?:is |= ?)(?:zero|0)(?![\\d.])"],
  // Same word, different spelling or register.
  [" collisions ", "collid(?:es|ed|ing|e)|collisions|hit(?:s|ting)?"],
  [" produces ", "produc(?:es|ed|ing)|synthesi[sz](?:es|ed|ing|e)|made"],
  [" amount ", "quantit(?:y|ies)|amounts"],
  [" successive ", "consecutive"],
  [" attaches to ", "attach(?:es|ed|ing)? to|binds to|bind to|binding to"],
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
  const out = new Set<string>();
  for (const raw of coverageTokens(text)) {
    const t = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
    if (!t) continue;
    out.add(t);
    for (const part of alternativesOf(t) ?? []) out.add(part);
  }
  return out;
}

/**
 * The root of a word under one adjectival or adverbial ending, so that
 * "symmetrical", "symmetric" and "symmetry", or "anaerobically" and
 * "anaerobic", are one word. Only endings that keep the meaning: "-ive" and
 * "-ion" are left out ("positive" is not "position"), as is "-al"
 * ("general" is not "generic"). The root keeps at least five letters.
 */
const ROOT_ENDINGS = ["ically", "ical", "ally", "ic", "ly", "y"];
export function wordRoot(word: string): string {
  for (const ending of ROOT_ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 5) return word.slice(0, -ending.length);
  }
  return word;
}

/**
 * "Gradient = acceleration (rate of change of velocity)": a scheme point that is
 * one equation plus a trailing gloss. The gloss restates the right-hand side,
 * so a student who writes the equation is not penalised for omitting it.
 */
const GLOSSED_EQUATION = /^([^()=]{3,60}=[^()=]{3,60}?)\s*\([^()]{5,80}\)\.?$/;
export function pointCoverage(point: string, answer: string, earlyExitAt?: number): number {
  const gloss = GLOSSED_EQUATION.exec(point);
  if (gloss) return Math.max(pointCoverageOf(point, answer, earlyExitAt), pointCoverageOf(gloss[1]!, answer, earlyExitAt));
  return pointCoverageOf(point, answer, earlyExitAt);
}

function pointCoverageOf(point: string, answer: string, earlyExitAt?: number): number {
  const wanted = coverageTokens(point);
  if (!wanted.length) return 0;
  const given = coverageTokens(answer).flatMap((g) => [g, ...(alternativesOf(g) ?? [])]);
  const exact = new Set(given);
  const exactHit = (w: string) => exact.has(w) || (alternativesOf(w)?.some((part) => exact.has(part)) ?? false);
  let exactHits = 0;
  for (const w of wanted) if (exactHit(w)) exactHits++;
  // Fast path: when exact keyword coverage already clears the caller threshold,
  // skip the fuzzy scan entirely — the hot loop in marking and benchmarks.
  if (earlyExitAt != null && exactHits / wanted.length >= earlyExitAt) return exactHits / wanted.length;
  const missing = earlyExitAt != null ? wanted.filter((w) => !exactHit(w)) : wanted;
  const fuzzyHit = (w: string) => {
    if (exact.has(w)) return true;
    if (w.length >= 8 && given.some((g) => g.length >= 8 && g.slice(0, 3) === w.slice(0, 3) && withinEditDistance(g, w, 2))) {
      return true;
    }
    if (w.length >= 5 && given.some((g) => g.length >= 5 && withinEditDistance(g, w, 1))) return true;
    // Another form of the same word: "anaerobically" for "anaerobic".
    const root = wordRoot(w);
    return root !== w && given.some((g) => g !== w && /^[a-z]+$/.test(g) && wordRoot(g) === root) ||
      (/^[a-z]{6,}$/.test(w) && given.some((g) => /^[a-z]+$/.test(g) && wordRoot(g) !== g && wordRoot(g) === w));
  };
  const hits = missing.filter((w) => fuzzyHit(w) || (alternativesOf(w)?.some(fuzzyHit) ?? false)).length;
  return (earlyExitAt != null ? exactHits + hits : hits) / wanted.length;
}
