// ---------------------------------------------------------------------------
// Deterministic maths equivalence checking.
//
// The rubric's `numericEquivalent` only compares numbers. This module adds the
// algebra layer: "is the student's expression the same polynomial as the mark
// scheme's, written differently?" — `(x+2)(x-3)` vs `x^2 - x - 6`, or
// `1/2 x^2 + 2x` vs `x^2/2 + 2x`.
//
// Scope is deliberately school-level and honest about its limits: a single
// variable, + − × ÷, parentheses, and constant powers. Anything it cannot
// fully parse returns "unknown" so the caller falls back to keyword/numeric
// marking — we never want a wrong answer to gain marks because a parser half
// understood it.
// ---------------------------------------------------------------------------

export type MathCompare = "equivalent" | "not-equivalent" | "unknown";

/** Rational coefficient kept exact so 0.25 ≡ 1/4 and 0.5x² ≡ x²/2. */
interface Frac {
  n: number;
  d: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function frac(n: number, d = 1): Frac {
  if (d === 0) throw new Error("zero denominator");
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function addF(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

function mulF(a: Frac, b: Frac): Frac {
  return frac(a.n * b.n, a.d * b.d);
}

function divF(a: Frac, b: Frac): Frac | null {
  if (b.n === 0) return null;
  return frac(a.n * b.d, a.d * b.n);
}

function fracToNum(f: Frac): number {
  return f.n / f.d;
}

function eqF(a: Frac, b: Frac): boolean {
  return a.n === b.n && a.d === b.d;
}

/** Polynomial as a map exponent → coefficient (exact rationals). */
export type Polynomial = Map<number, Frac>;

const MAX_TERMS = 64;
const MAX_EXPAND = 6;

function isZero(f: Frac): boolean {
  return f.n === 0;
}

function polyConstant(c: Frac): Polynomial {
  const p: Polynomial = new Map();
  if (!isZero(c)) p.set(0, c);
  return p;
}

function polyAdd(a: Polynomial, b: Polynomial): Polynomial {
  const out = new Map(a);
  for (const [e, c] of b) {
    const cur = out.get(e) ?? frac(0);
    const next = addF(cur, c);
    if (isZero(next)) out.delete(e);
    else out.set(e, next);
  }
  if (out.size > MAX_TERMS) throw new Error("too many terms");
  return out;
}

function polyMul(a: Polynomial, b: Polynomial): Polynomial {
  const out: Polynomial = new Map();
  for (const [ea, ca] of a) {
    for (const [eb, cb] of b) {
      const e = ea + eb;
      const cur = out.get(e) ?? frac(0);
      const next = addF(cur, mulF(ca, cb));
      if (isZero(next)) out.delete(e);
      else out.set(e, next);
    }
  }
  if (out.size > MAX_TERMS) throw new Error("too many terms");
  return out;
}

/** Raise to a constant integer power by repeated squaring; null for non-integer/unsupported. */
function polyPow(a: Polynomial, n: number): Polynomial | null {
  if (!Number.isInteger(n) || n < 0 || n > MAX_EXPAND) return null;
  let result: Polynomial = polyConstant(frac(1));
  let base = a;
  let k = n;
  while (k > 0) {
    if (k % 2 === 1) result = polyMul(result, base);
    base = polyMul(base, base);
    k = Math.floor(k / 2);
  }
  return result;
}

/** Divide by a non-zero constant (the only division a school expression needs). */
function polyDivConst(a: Polynomial, c: Frac): Polynomial | null {
  const inv = divF(frac(1), c);
  if (!inv) return null;
  const out: Polynomial = new Map();
  for (const [e, f] of a) {
    const next = mulF(f, inv);
    if (!isZero(next)) out.set(e, next);
  }
  return out;
}

// --- tokeniser -------------------------------------------------------------

type Token =
  | { t: "num"; v: Frac }
  | { t: "var"; name: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" }
  | { t: "lparen" }
  | { t: "rparen" };

/** Unify unicode maths glyphs with ASCII but keep spaces (they matter for candidate splitting). */
export function preprocessMath(text: string): string {
  let t = text.replace(/\s+/g, " ");
  t = t.replace(/×|·|⋅|∗|∙/g, "*");
  t = t.replace(/−|–|—/g, "-");
  t = t.replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4").replace(/⁵/g, "^5");
  t = t
    .replace(/½/g, "0.5")
    .replace(/¼/g, "0.25")
    .replace(/¾/g, "0.75")
    .replace(/⅓/g, "(1/3)")
    .replace(/⅔/g, "(2/3)");
  return t;
}

/** Exact fraction from a decimal string: "0.25" → 1/4, "1.5e-3" → 3/2000. */
function decimalToFrac(raw: string): Frac | null {
  if (raw.includes("e") || raw.includes("E")) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (Number.isInteger(n)) return frac(n);
    return decimalToFrac(n.toString());
  }
  if (raw.includes(".")) {
    const [intPart, decPart] = raw.split(".");
    if (!decPart) return null;
    const scale = Math.pow(10, decPart.length);
    return frac(Number(intPart) * scale + Number(decPart), scale);
  }
  return frac(Number(raw));
}

function tokenise(input: string): Token[] | null {
  const s = preprocessMath(input);
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = s.slice(i).match(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
      if (!m) return null;
      const f = decimalToFrac(m[0]);
      if (!f) return null;
      tokens.push({ t: "num", v: f });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      // A contiguous letter run is ONE symbol. Runs longer than one letter are
      // units/prose ("mol", "dm") — reject so `n=cV` never parses as n·c·V.
      const m = s.slice(i).match(/^[a-z]+/i);
      if (!m) return null;
      if (m[0].length > 1) return null;
      tokens.push({ t: "var", name: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^") {
      tokens.push({ t: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ t: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ t: "rparen" });
      i++;
      continue;
    }
    // Any other character (letters are handled above; punctuation like = , ! ?)
    // makes the string unparseable as a pure expression.
    return null;
  }
  return insertImplicitMuls(tokens);
}

/** Turn `2x`, `3(x+1)`, `(x+1)(x-3)` into explicit `*` forms. */
function insertImplicitMuls(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const tok of tokens) {
    const prev = out[out.length - 1];
    const endsFactor = prev && (prev.t === "num" || prev.t === "var" || prev.t === "rparen");
    const startsFactor = tok.t === "num" || tok.t === "var" || tok.t === "lparen";
    if (prev && endsFactor && startsFactor && !(prev.t === "num" && tok.t === "num")) {
      out.push({ t: "op", v: "*" });
    }
    out.push(tok);
  }
  return out;
}

// --- parser ----------------------------------------------------------------

class ParseError extends Error {}

interface ParseState {
  toks: Token[];
  i: number;
  varName: string | null;
}

function peek(st: ParseState): Token | undefined {
  return st.toks[st.i];
}

function next(st: ParseState): Token | undefined {
  return st.toks[st.i++];
}

function parseExpr(st: ParseState): Polynomial {
  let acc = parseTerm(st);
  for (;;) {
    const t = peek(st);
    if (t && t.t === "op" && (t.v === "+" || t.v === "-")) {
      next(st);
      const rhs = parseTerm(st);
      acc = t.v === "+" ? polyAdd(acc, rhs) : polySub(acc, rhs);
    } else {
      return acc;
    }
  }
}

function polySub(a: Polynomial, b: Polynomial): Polynomial {
  const neg = new Map<number, Frac>();
  for (const [e, c] of b) neg.set(e, frac(-c.n, c.d));
  return polyAdd(a, neg);
}

function parseTerm(st: ParseState): Polynomial {
  let acc = parseFactor(st);
  for (;;) {
    const t = peek(st);
    if (t && t.t === "op" && (t.v === "*" || t.v === "/")) {
      next(st);
      const rhs = parseFactor(st);
      if (t.v === "*") {
        acc = polyMul(acc, rhs);
      } else {
        // Division by a non-constant is outside scope → treat as unparseable.
        if (rhs.size !== 1 || !rhs.has(0)) throw new ParseError("non-constant divisor");
        const q = polyDivConst(acc, rhs.get(0)!);
        if (!q) throw new ParseError("zero divisor");
        acc = q;
      }
    } else {
      return acc;
    }
  }
}

function parseFactor(st: ParseState): Polynomial {
  const base = parseAtom(st);
  const t = peek(st);
  if (t && t.t === "op" && t.v === "^") {
    next(st);
    const exp = parseAtom(st);
    // Exponent must be a constant.
    if (exp.size !== 1 || !exp.has(0)) throw new ParseError("variable exponent");
    const n = fracToNum(exp.get(0)!);
    const raised = polyPow(base, n);
    if (!raised) throw new ParseError("unsupported power");
    return raised;
  }
  return base;
}

function parseAtom(st: ParseState): Polynomial {
  const t = next(st);
  if (!t) throw new ParseError("unexpected end");
  if (t.t === "num") return polyConstant(t.v);
  if (t.t === "var") {
    if (st.varName === null) st.varName = t.name;
    else if (st.varName !== t.name) throw new ParseError("two variables");
    const p: Polynomial = new Map();
    p.set(1, frac(1));
    return p;
  }
  if (t.t === "lparen") {
    const inner = parseExpr(st);
    const close = next(st);
    if (!close || close.t !== "rparen") throw new ParseError("unclosed paren");
    return inner;
  }
  if (t.t === "op" && t.v === "-") {
    const inner = parseExpr(st);
    const neg = new Map<number, Frac>();
    for (const [e, c] of inner) neg.set(e, frac(-c.n, c.d));
    return neg;
  }
  if (t.t === "op" && t.v === "+") return parseAtom(st);
  throw new ParseError("unexpected token");
}

/**
 * Parse a single-variable expression into a canonical polynomial.
 * Returns null when the text is not a fully parseable expression.
 */
export function parseExpression(text: string): Polynomial | null {
  try {
    const toks = tokenise(text);
    if (!toks || toks.length === 0) return null;
    const st: ParseState = { toks, i: 0, varName: null };
    const p = parseExpr(st);
    if (st.i < toks.length) return null; // trailing garbage
    return p;
  } catch {
    return null;
  }
}

function polysEqual(a: Polynomial, b: Polynomial): boolean {
  if (a.size !== b.size) return false;
  for (const [e, c] of a) {
    const other = b.get(e);
    if (!other || !eqF(c, other)) return false;
  }
  return true;
}

function hasMathShape(text: string): boolean {
  // A candidate is worth parsing only if it looks like arithmetic: a digit or
  // a structural operator (× ÷ ^ parens). A bare word or single variable isn't.
  return /\d/.test(text) || /[*/(^]/.test(text) || /^[-]?\s*[a-z]\s*[*/]/.test(text);
}

/** Candidate substrings of `text` that might be the embedded expression, longest first. */
function expressionCandidates(text: string): string[] {
  const pre = preprocessMath(text);
  const out: string[] = [];
  const whole = pre.trim();
  if (whole && hasMathShape(whole)) out.push(whole);
  // Try progressively longer whitespace-joined suffixes: "Answer x^2 - x - 6"
  // first fails as a whole ("Answerx" is a multi-letter run) but the suffix
  // "x^2 - x - 6" parses. Longest first keeps "2 - x - 6" from winning.
  const words = pre.split(/\s+/).filter(Boolean);
  for (let start = 0; start < words.length; start++) {
    for (let end = words.length; end > start; end--) {
      const cand = words.slice(start, end).join(" ");
      if (cand === whole) continue;
      if (hasMathShape(cand)) out.push(cand);
    }
  }
  return out;
}

function bestExpr(text: string): Polynomial | null {
  const direct = parseExpression(text);
  if (direct) return direct;
  for (const cand of expressionCandidates(text)) {
    const p = parseExpression(cand);
    if (p) return p;
  }
  return null;
}

/**
 * The expression at the END of a response — the final answer, not the first
 * intermediate line. Working like "(x+2)(x-3) = x^2 + 3x + 2x - 6 = x^2 + x - 6"
 * must be judged on its final "x^2 + x - 6", otherwise a correctly expanded
 * start would be credited for a wrong answer.
 */
function finalExpr(text: string): Polynomial | null {
  const pre = preprocessMath(text);
  const words = pre.split(/\s+/).filter(Boolean);
  // Longest run that reaches the end of the response, left to right.
  for (let start = 0; start < words.length; start++) {
    const cand = words.slice(start).join(" ");
    if (/[a-z]/i.test(cand) && hasMathShape(cand)) {
      const p = parseExpression(cand);
      if (p) return p;
    }
  }
  return null;
}

/**
 * Compare a mark-scheme expression with a student expression.
 * - "equivalent": both sides parse and are the same polynomial (commutativity,
 *   factoring, like-term collection and constant division all collapse).
 * - "not-equivalent": both sides parse and differ.
 * - "unknown": at least one side is not a parseable expression — the caller
 *   should fall back to keyword/numeric marking.
 */
export function mathsEquivalent(student: string, expected: string): MathCompare {
  const a = bestExpr(student);
  const b = bestExpr(expected);
  if (!a || !b) return "unknown";
  return polysEqual(a, b) ? "equivalent" : "not-equivalent";
}

/**
 * Marking integration point.
 *
 * - "equivalent": both sides contain the same expression (factored vs
 *   expanded, reordered, like-terms collected) → credit.
 * - "not-equivalent": BOTH sides are pure expressions and differ → the
 *   expression is wrong, so don't let a stray digit match rescue it.
 * - "unknown": the expected side is prose-embedded, or a side isn't an
 *   expression → stay neutral and let the keyword/numeric rubric decide.
 *
 * Pure constants are deliberately "unknown": numeric matching already owns
 * that case, and overriding it here would change strict-calibration behaviour.
 */
export function symbolicMatch(answer: string, expected: string): MathCompare {
  // The student is judged on their FINAL expression; the scheme on its own.
  const a = finalExpr(answer) ?? bestExpr(answer);
  const b = bestExpr(expected);
  if (!a || !b) return "unknown";
  const hasVariable = [...b.keys()].some((e) => e !== 0);
  if (!hasVariable) return "unknown";
  if (polysEqual(a, b)) return "equivalent";
  // Only claim "not-equivalent" when the expected side is a pure expression:
  // for prose-embedded expectations the extraction may have caught a fragment
  // ("x^2" from "coefficient of x^2 is 1"), so we stay neutral and let the
  // keyword/numeric rubric decide.
  const wholeB = parseExpression(expected.trim());
  if (!wholeB) return "unknown";
  return "not-equivalent";
}

export type ExpressionMismatchKind =
  | "sign-slip"
  | "coefficient-error"
  | "method-error"
  | "unrelated";

/**
 * When two expressions are known to differ, say HOW they differ — the raw
 * material for misconception-specific remediation.
 *
 * - "sign-slip": same terms, every difference is a flipped sign.
 * - "coefficient-error": same term structure, a value is wrong (not a sign).
 * - "method-error": the term structure itself differs (wrong expansion, wrong
 *   factorisation, ...).
 * - "unrelated": at least one side is not a parseable expression.
 */
export function diagnoseExpressionDifference(
  student: string,
  expected: string,
): ExpressionMismatchKind {
  const a = bestExpr(student);
  const b = bestExpr(expected);
  if (!a || !b) return "unrelated";
  if (polysEqual(a, b)) return "unrelated";

  const aKeys = [...a.keys()];
  const sameShape = aKeys.length === b.size && aKeys.every((e) => b.has(e));
  if (!sameShape) return "method-error";

  let anyDiff = false;
  let allSignFlips = true;
  for (const e of aKeys) {
    const ca = a.get(e)!;
    const cb = b.get(e)!;
    if (eqF(ca, cb)) continue;
    anyDiff = true;
    // ca === -cb exactly (n/d === -n'/d' ⇔ n·d' === -n'·d).
    const signFlip = ca.n * cb.d === -cb.n * ca.d;
    if (!signFlip) {
      allSignFlips = false;
      break;
    }
  }
  if (allSignFlips && anyDiff) return "sign-slip";
  if (anyDiff) return "coefficient-error";
  return "unrelated";
}
