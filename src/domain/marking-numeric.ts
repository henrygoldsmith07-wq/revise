/** Pure numeric matching: quantities, units, notation and examiner tolerance. */
/** Normalise a numeric string: strip thousands separators and keep a single canonical decimal form. */
function parseScalar(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Extract every number-like token from free text, including fractions, simple exponents and scientific notation. */
/** Bounded memo: scheme/answer strings repeat heavily across marking calls
 *  (same part, many adversarial variants) and the scan is regex-heavy. */
type NumberHitX = { raw: string; value: number | null; denom?: number };
const NUMBER_CACHE = new Map<string, NumberHitX[]>();
export function extractNumbersCached(text: string): NumberHitX[] {
  const hit = NUMBER_CACHE.get(text);
  if (hit) return hit;
  const result = extractNumbersUncached(text);
  if (NUMBER_CACHE.size > 512) NUMBER_CACHE.clear();
  NUMBER_CACHE.set(text, result);
  return result;
}

function extractNumbersUncached(input: string): Array<{ raw: string; value: number | null; denom?: number }> {
  // Normalise unicode super/subscripts so "×10⁻³" reads as "x10-3".
  const SUPERS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
  const text = input.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻₀-₉]/g, (ch) => SUPERS[ch] ?? ch);
  const out: Array<{ raw: string; value: number | null; denom?: number }> = [];
  // Fractions first so 1/2 is not read as two scalars.
  for (const m of text.matchAll(/(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*\/\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)/g)) {
    const num = parseScalar(m[1] ?? "");
    const den = parseScalar(m[2] ?? "");
    const val = num != null && den != null && den !== 0 ? num / den : null;
    out.push({ raw: m[0], value: val });
  }
  // Scientific notation written as "3.55 × 10^1" / "x 10^-3". Only the "×10^exp"
  // part is consumed: the mantissa stays visible to the plain-scalar path below,
  // so a scheme expecting "1.32 x 10^-3" still loosely matches "1.32" elsewhere.
  const consumed: Array<readonly [number, number]> = [];
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*([x×])\s*10\s*\^?\s*\{?([+-]?\d+)\}?/gi)) {
    const mantissa = parseScalar(m[1] ?? "");
    const exponent = parseScalar(m[3] ?? "");
    if (mantissa == null || exponent == null) continue;
    // Consume from the × sign onwards so the mantissa still reaches the plain path.
    const relSeparator = m[0].search(/[x×]/i);
    consumed.push([m.index! + relSeparator, m[0].length - relSeparator]);
    out.push({ raw: m[0], value: mantissa * 10 ** exponent });
  }
  // Remaining scalars (skip those already consumed by a fraction or ×10^ tail)
  const fractionSpans = [...text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?\s*\/\s*-?\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m)=> [m.index!, m[0].length] as const);
  const spans = [...fractionSpans, ...consumed];
  const isConsumed = (i: number) => spans.some(([s,l])=> i >= s && i < s + l);
  for (const m of text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?/gi)) {
    if (isConsumed(m.index!)) continue;
    out.push({ raw: m[0], value: parseScalar(m[0]) });
  }
  // Powers written as 2^3 or 2²/³ — normalise to numeric exponent where possible
  for (const m of text.matchAll(/(\d+)\s*\^\s*(-?\d+(?:\.\d+)?)/g)) {
    const base = parseScalar(m[1] ?? ""); const exp = parseScalar(m[2] ?? "");
    if (base != null && exp != null) out.push({ raw: m[0], value: Math.pow(base, exp) });
  }
  return out;
}

/** Tolerance for numeric equivalence: absolute for |expected|<1, relative otherwise. */
function numbersClose(a: number, b: number, relEps = 0.01, absEps = 0.005): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= Math.max(absEps, relEps * scale);
}

// --- unit-aware comparison ----------------------------------------------------
// A numeric mark point carrying a physical unit only credits an answer whose
// number sits in the same dimension (SI prefixes convert; J does not become m).

const UNIT_BASE: Record<string, { family: string; factor: number }> = {
  j: { family: "energy", factor: 1 }, kj: { family: "energy", factor: 1e3 }, mj: { family: "energy", factor: 1e6 },
  n: { family: "force", factor: 1 }, kn: { family: "force", factor: 1e3 },
  pa: { family: "pressure", factor: 1 }, kpa: { family: "pressure", factor: 1e3 }, mpa: { family: "pressure", factor: 1e6 },
  v: { family: "potential", factor: 1 }, mv: { family: "potential", factor: 1e-3 }, kv: { family: "potential", factor: 1e3 },
  a: { family: "current", factor: 1 }, ma: { family: "current", factor: 1e-3 },
  w: { family: "power", factor: 1 }, kw: { family: "power", factor: 1e3 },
  hz: { family: "frequency", factor: 1 },
  nm: { family: "length", factor: 1e-9 }, um: { family: "length", factor: 1e-6 }, mm: { family: "length", factor: 1e-3 },
  cm: { family: "length", factor: 0.01 }, m: { family: "length", factor: 1 }, km: { family: "length", factor: 1e3 },
  mg: { family: "mass", factor: 1e-6 }, g: { family: "mass", factor: 1e-3 }, kg: { family: "mass", factor: 1 },
  ns: { family: "time", factor: 1e-9 }, ms: { family: "time", factor: 1e-3 }, s: { family: "time", factor: 1 },
  min: { family: "time", factor: 60 }, hr: { family: "time", factor: 3600 }, h: { family: "time", factor: 3600 },
  mmol: { family: "amount", factor: 1e-3 }, mol: { family: "amount", factor: 1 },
  ml: { family: "volume", factor: 1e-6 }, l: { family: "volume", factor: 1e-3 },
  cm3: { family: "volume", factor: 1e-6 }, dm3: { family: "volume", factor: 1e-3 }, m3: { family: "volume", factor: 1 },
  "mol/dm3": { family: "concentration", factor: 1 }, "mol/l": { family: "concentration", factor: 1 }, moldm3: { family: "concentration", factor: 1 },
};

/** Normalised unit attached to a number, or null when none follows it. */
function unitAfter(text: string, endOfNumber: number): string | null {
  const rest = text.slice(endOfNumber, endOfNumber + 12);
  const match = rest.match(/^[ \u00a0]*((?:mol\s*\/\s*(?:dm3|l)|dm3|cm3|m3|[GMkcmnµu]?(?:J|N|Pa|V|A|W|Hz|mol|g|m|s|L|K))[\^]?\{?-?\d\}?|%)/i);
  if (!match) return null;
  return (match[1] ?? "").replace(/\s+/g, "").replace(/[\u00b2\u00b3]/g, (d) => (d === "\u00b2" ? "2" : "3")).toLowerCase();
}

interface UnitHit { value: number; unit: string | null }

function quantities(text: string): UnitHit[] {
  const out: UnitHit[] = [];
  for (const m of text.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?(?:e[+-]?\d+)?/gi)) {
    const value = parseScalar(m[0]);
    if (value == null) continue;
    out.push({ value, unit: unitAfter(text, m.index! + m[0].length) });
  }
  return out;
}

/**
 * Pair-level verdict: values close, and when BOTH sides carry units they must
 * share a dimension — SI prefixes convert ("3500 J" ≡ "3.5 kJ"), cross-family
 * units block the credit entirely.
 */
function quantityPairMatches(wanted: number | null, wantedUnit: string | null, given: number | null, givenUnit: string | null): boolean {
  if (wanted == null || given == null) return false;
  if (!numbersClose(wanted, given)) return false;
  if (wantedUnit && givenUnit) {
    const bw = UNIT_BASE[wantedUnit];
    const bg = UNIT_BASE[givenUnit];
    if (bw && bg) {
      if (bw.family !== bg.family) return false;
      if (bw.factor !== bg.factor) return numbersClose(wanted * bw.factor, given * bg.factor);
    } else if (wantedUnit !== givenUnit) {
      // Unrecognised-but-different labels are not evidence of equivalence.
      return false;
    }
  }
  return true;
}

/** Equality to two significant figures, guarded so distant values cannot round onto each other. */
export function sameToTwoSigFigs(a: number, b: number): boolean {
  if (a === b) return true;
  if (a === 0 || b === 0) return false;
  if (Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) > 0.06) return false;
  return Number(a.toPrecision(2)) === Number(b.toPrecision(2));
}


function matchesExplicitNumericAlternative(point: string, answer: string): boolean {
  const marker = /\b(?:or|accept|approximately|approx)\b/i.exec(point);
  if (!marker) return false;
  const alternativeText = point.slice(marker.index + marker[0].length);
  const wanted = extractNumbersCached(alternativeText.replace(/[−–—]/g, "-")).filter((hit) => hit.value != null);
  const given = extractNumbersCached(answer.replace(/[−–—]/g, "-")).filter((hit) => hit.value != null);
  return wanted.some((expected) =>
    given.some((actual) => numbersClose(expected.value!, actual.value!)),
  );
}

function requiredMathNotationPresent(point: string, answer: string): boolean {
  const relationalRequirements: Array<{ expected: RegExp; actual: RegExp }> = [
    { expected: /≤|<=|\bless\s+than\s+or\s+equal\b/i, actual: /≤|<=|\bless\s+than\s+or\s+equal\b/i },
    { expected: /≥|>=|\bgreater\s+than\s+or\s+equal\b/i, actual: /≥|>=|\bgreater\s+than\s+or\s+equal\b/i },
    { expected: /±|\+\s*\/\s*-|\bplus\s+or\s+minus\b/i, actual: /±|\+\s*\/\s*-|\bplus\s+or\s+minus\b/i },
  ];
  for (const requirement of relationalRequirements) {
    if (requirement.expected.test(point) && !requirement.actual.test(answer)) return false;
  }

  const numericAlternativeMatches = matchesExplicitNumericAlternative(point, answer);
  if (/π|\bpi\b/i.test(point) && !/π|\bpi\b/i.test(answer) && !numericAlternativeMatches) return false;
  if (/√|\bsqrt\b/i.test(point) && !/(?:√|\bsqrt\b)/i.test(answer) && !numericAlternativeMatches) return false;
  return true;
}

/** True when the answer contains a number equivalent to any number in the mark scheme. */
export function numericMatch(point: string, answer: string): boolean {
  if (!requiredMathNotationPresent(point, answer)) return false;
  const wanted = extractNumbersCached(point.replace(/[−–—]/g, "-"));
  if (!wanted.length) return false;
  const given = extractNumbersCached(answer.replace(/[−–—]/g, "-"));
  if (!given.length) return false;
  // Also accept unicode fractions like ½ ¼ ¾
  const unicodeFrac: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1/3, "⅔": 2/3 };
  for (const ch of Object.keys(unicodeFrac)) if (answer.includes(ch)) given.push({ raw: ch, value: unicodeFrac[ch] as number });
  for (const ch of Object.keys(unicodeFrac)) if (point.includes(ch)) wanted.push({ raw: ch, value: unicodeFrac[ch] as number });
  // Unit-aware quantities are computed lazily: most scheme points carry no
  // units, and scanning the answer for "number+unit" pairs is pure waste then.
  let wantedQuantities: ReturnType<typeof quantities> | null = null;
  const wantQuantities = () => (wantedQuantities ??= quantities(point));
  for (const w of wanted) {
    if (w.value == null) continue;
    for (const g of given) {
      if (g.value == null) continue;
      if (numbersClose(w.value, g.value)) {
        // Values are close; the unit gate can still veto cross-family pairs.
        const qw = wantQuantities().find((q) => q.value === w.value);
        if (!qw?.unit) return true;
        const qg = quantities(answer).find((q) => q.value === g.value);
        if (!qg?.unit || quantityPairMatches(qw.value, qw.unit, qg.value, qg.unit)) return true;
      }
      // Exact raw string match as a fallback (covers trailing zeros, etc.)
      if (w.raw === g.raw) return true;
    }
  }
  // Prefix-conversion rescue: "3500 J" vs "3.5 kJ" is close only after conversion.
  wantedQuantities = wantQuantities();
  if (wantedQuantities.some((q) => q.unit != null)) {
    const givenQuantities = quantities(answer);
    for (const qw of wantedQuantities) {
      if (!qw.unit) continue;
      for (const qg of givenQuantities) {
        if (!qg.unit || qg.value === qw.value) continue;
        if (quantityPairMatches(qw.value, qw.unit, qg.value, qg.unit)) return true;
      }
    }
  }
  // Examiner tolerance: an explicit "(accept X)" or two-significant-figure
  // equality credits rounded answers without opening the door to distant values.
  const accept = point.match(/\(accept\s+(-?\d+(?:[.,]\d+)?)\s*\)/i);
  if (accept) {
    const alt = Number((accept[1] ?? "").replace(",", "."));
    for (const g of given) {
      const gv = g.value;
      if (gv == null) continue;
      if (numbersClose(gv, alt, 0.05, 0.05)) return true;
    }
    for (const g of quantities(answer)) {
      if (g.unit == null) continue;
      if (numbersClose(g.value, alt, 0.05, 0.05)) return true;
    }
  }
  for (const w of wanted) {
    const wv = w.value;
    if (wv == null) continue;
    for (const g of given) {
      const gv = g.value;
      if (gv == null) continue;
      if (sameToTwoSigFigs(wv, gv)) return true;
    }
  }
  return false;
}

export function numericEquivalent(expected: string, actual: string): boolean {
  return numericMatch(expected, actual);
}

/** Evaluate whether a mark-scheme point looks like a calculation/numeric point. */
export function requiresStructuredNumericMatch(point: string): boolean {
  if (!/\d/.test(point)) return false;
  return /(?:±|≤|≥|π|√|\+\s*\/\s*-|<=|>=|\bsqrt\b|\bpi\b)/i.test(point);
}

export function isNumericPoint(point: string): boolean {
  if (!/\d/.test(point)) return false;
  return (
    /\b(answer|calculate|value|concentration|mol|kJ)\b/i.test(point) ||
    /\d\s*(?:J|Pa|N)\b/i.test(point) ||
    /\bm\s*s(?:[-^]?\d+)?\b/i.test(point)
  );
}
