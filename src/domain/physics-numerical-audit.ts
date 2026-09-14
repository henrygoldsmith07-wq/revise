// ---------------------------------------------------------------------------
// Conservative, deterministic numerical checks for the Physics bank.
//
// This is deliberately an authoring aid rather than an auto-approver. It only
// raises a hard error when a numeric equality or a known unit relationship can
// be recomputed unambiguously. Text that contains numbers but no safe equation
// is retained as manual-review work instead of being guessed.
// ---------------------------------------------------------------------------

import type { QuestionPart } from "./types";

export type PhysicsNumericalIssueKind =
  | "numeric-arithmetic"
  | "numeric-mismatch"
  | "dimension-mismatch"
  | "scheme-answer-mismatch"
  | "chain-inconsistency"
  | "precision-mismatch"
  | "unresolved-numerical";

export interface PhysicsNumericalIssue {
  kind: PhysicsNumericalIssueKind;
  severity: "error" | "warning";
  detail: string;
  source: "prompt" | "scheme" | "answer" | "scheme-answer";
}

export type PhysicsNumericalClaimStatus = "parsed" | "verified" | "error" | "unresolved";

export type PhysicsRuleId =
  | "F=ma"
  | "momentum"
  | "impulse"
  | "SUVAT"
  | "V=IR"
  | "electrical-power"
  | "resistivity"
  | "internal-resistance"
  | "capacitor-energy"
  | "capacitor-charge"
  | "capacitor-time-constant"
  | "wave-equation"
  | "field-strength"
  | "electric-force"
  | "gravitational-field"
  | "gravitational-force"
  | "E=hf"
  | "de-Broglie"
  | "decay-half-life"
  | "ideal-gas"
  | "thermal-energy"
  | "specific-latent-heat"
  | "pressure-work";

export interface PhysicsNumericalTolerance {
  absolute: number;
  relative: number;
  basis: string;
}

/** Evidence for one deterministic comparison. It is intentionally serialisable
 * so an author can inspect exactly what the checker trusted. */
export interface PhysicsNumericalProvenance {
  claimId: string;
  source: "prompt" | "scheme" | "answer" | "scheme-answer";
  sourceValues: string[];
  parsedEquation: string;
  recomputedResult: string;
  authoredResult: string;
  tolerance: PhysicsNumericalTolerance;
  status: "verified" | "error" | "unresolved";
  rule?: PhysicsRuleId;
}

export interface PhysicsNumericalClaim {
  id: string;
  source: "prompt" | "scheme" | "answer";
  text: string;
  parsed: boolean;
  status: PhysicsNumericalClaimStatus;
  expression?: string;
  authoredResult?: string;
  provenance?: PhysicsNumericalProvenance;
}

export interface PhysicsRuleAudit {
  id: PhysicsRuleId;
  source: "prompt" | "scheme" | "answer";
  expression: string;
  status: "verified" | "error" | "unresolved";
  detail: string;
}

export interface PhysicsDimensionalCoverage {
  /** Numeric claims containing units that could require a dimensional check. */
  claimsDetected: number;
  checks: number;
  verified: number;
  unresolved: number;
  errors: number;
  /** `null` means no dimensional claim has been detected. */
  coveragePercent: number | null;
}

export interface PhysicsSchemeAnswerCoverage {
  candidateClaims: number;
  comparisons: number;
  verified: number;
  unresolved: number;
  errors: number;
  coveragePercent: number | null;
}

export interface PhysicsNumericalAudit {
  status: "verified" | "partial" | "fail" | "unresolved";
  /** Claim-level counts. These are deliberately separate from equation counts. */
  claimsDetected: number;
  claimsParsed: number;
  claimsVerified: number;
  claimsUnresolved: number;
  claimErrors: number;
  arithmeticChecks: number;
  arithmeticVerified: number;
  arithmeticErrors: number;
  schemeAnswerChecks: number;
  schemeAnswerVerified: number;
  schemeAnswerErrors: number;
  dimensionalChecks: number;
  dimensionalVerified: number;
  dimensionalErrors: number;
  physicsRuleChecks: number;
  physicsRuleDetected: number;
  physicsRuleVerified: number;
  physicsRuleErrors: number;
  physicsRuleUnresolved: number;
  unresolved: number;
  dimensionalCoverage: PhysicsDimensionalCoverage;
  schemeAnswerCoverage: PhysicsSchemeAnswerCoverage;
  claims: PhysicsNumericalClaim[];
  provenance: PhysicsNumericalProvenance[];
  physicsRules: PhysicsRuleAudit[];
  issues: PhysicsNumericalIssue[];
}

type NumericValue = { value: number; raw: string; unit: UnitDimension | null; consumed: number; clean: boolean };
type UnitDimension = { dimension: string; scale: number; text: string };

const EPSILON = 1e-8;
// This is only the fallback for an explicitly approximate result whose input
// precision cannot be recovered. Exact-looking calculations use a tolerance
// derived from the reported significant figures instead of this universal
// percentage.
const APPROXIMATE_FALLBACK_RELATIVE_TOLERANCE = 0.025;

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+",
};

function normalise(text: string): string {
  return text
    .replace(/½/g, "0.5")
    .replace(/¼/g, "0.25")
    .replace(/¾/g, "0.75")
    .replace(/[−–—]/g, "-")
    .replace(/[×·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/√\s*/g, "sqrt")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (raw) => `^${[...raw].map((c) => SUPERSCRIPT[c] ?? c).join("")}`)
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isDigit(character: string | undefined): boolean {
  return Boolean(character && /[0-9.]/.test(character));
}

class NumericParser {
  private readonly text: string;
  private position = 0;

  constructor(text: string) {
    this.text = text;
  }

  parse(): { value: number; consumed: number } | null {
    const value = this.expression();
    if (value === null || !Number.isFinite(value)) return null;
    return { value, consumed: this.position };
  }

  private skip(): void {
    while (this.position < this.text.length && /\s/.test(this.text[this.position]!)) this.position++;
  }

  private expression(): number | null {
    let value = this.term();
    if (value === null) return null;
    while (true) {
      this.skip();
      const operator = this.text[this.position];
      if (operator !== "+" && operator !== "-") return value;
      this.position++;
      const right = this.term();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
  }

  private term(): number | null {
    let value = this.power();
    if (value === null) return null;
    while (true) {
      this.skip();
      const operator = this.text[this.position];
      if (operator !== "*" && operator !== "/") {
        // Permit implicit multiplication such as 2pi and 2(3+4).
        if (this.canStartPrimary(operator)) {
          const right = this.power();
          if (right === null) return null;
          value *= right;
          continue;
        }
        return value;
      }
      this.position++;
      const right = this.power();
      if (right === null || (operator === "/" && Math.abs(right) < EPSILON)) return null;
      value = operator === "*" ? value * right : value / right;
    }
  }

  private power(): number | null {
    let value = this.unary();
    if (value === null) return null;
    this.skip();
    if (this.text[this.position] === "^") {
      this.position++;
      const exponent = this.unary();
      if (exponent === null) return null;
      value = value ** exponent;
    }
    return value;
  }

  private unary(): number | null {
    this.skip();
    const operator = this.text[this.position];
    if (operator === "+" || operator === "-") {
      this.position++;
      const value = this.unary();
      return value === null ? null : operator === "-" ? -value : value;
    }
    return this.primary();
  }

  private primary(): number | null {
    this.skip();
    if (this.text.startsWith("sqrt", this.position)) {
      this.position += 4;
      const value = this.primary();
      return value === null || value < 0 ? null : Math.sqrt(value);
    }
    if (this.text[this.position] === "(") {
      this.position++;
      const value = this.expression();
      this.skip();
      if (this.text[this.position] !== ")") return null;
      this.position++;
      return value;
    }
    if (this.text[this.position]?.toLowerCase() === "p" && this.text.slice(this.position, this.position + 2).toLowerCase() === "pi") {
      this.position += 2;
      return Math.PI;
    }
    const start = this.position;
    const rest = this.text.slice(start);
    const match = rest.match(/^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?/i);
    if (!match) return null;
    this.position += match[0].length;
    let value = Number(match[0]);
    // Treat the common Physics spelling `a × 10^n` as one scientific number.
    // This avoids interpreting `5.0×10^8/2.0×10^11` with ordinary left-to-right
    // multiplication, which would otherwise turn the intended denominator
    // into a multiplication after the division.
    const scientific = this.text.slice(this.position).match(/^\s*\*\s*10\s*\^\s*([+-]?\d+)/);
    if (scientific) {
      value *= 10 ** Number(scientific[1]);
      this.position += scientific[0].length;
    }
    return Number.isFinite(value) ? value : null;
  }

  private canStartPrimary(character: string | undefined): boolean {
    return character === "(" || character?.toLowerCase() === "p" || (character?.toLowerCase() === "s" && this.text.slice(this.position, this.position + 4).toLowerCase() === "sqrt") || isDigit(character);
  }
}

const UNIT_DIMENSION_CACHE = new Map<string, UnitDimension | null>();

function unitDimension(text: string): UnitDimension | null {
  const cleaned = text
    .replace(/[·×*]/g, " ")
    .replace(/[⁻−]/g, "-")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (raw) => [...raw].map((c) => SUPERSCRIPT[c] ?? c).join(""))
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const cached = UNIT_DIMENSION_CACHE.get(cleaned);
  if (cached !== undefined || UNIT_DIMENSION_CACHE.has(cleaned)) return cached ?? null;

  const base: Record<string, { dimension: string; scale: number }> = {
    "1": { dimension: "1", scale: 1 }, "%": { dimension: "1", scale: 0.01 },
    m: { dimension: "L", scale: 1 }, cm: { dimension: "L", scale: 1e-2 }, mm: { dimension: "L", scale: 1e-3 }, km: { dimension: "L", scale: 1e3 },
    s: { dimension: "T", scale: 1 }, ms: { dimension: "T", scale: 1e-3 }, us: { dimension: "T", scale: 1e-6 }, min: { dimension: "T", scale: 60 }, h: { dimension: "T", scale: 3600 },
    kg: { dimension: "M", scale: 1 }, g: { dimension: "M", scale: 1e-3 },
    A: { dimension: "I", scale: 1 }, C: { dimension: "Q", scale: 1 }, K: { dimension: "Theta", scale: 1 },
    N: { dimension: "M L T-2", scale: 1 }, J: { dimension: "M L2 T-2", scale: 1 }, W: { dimension: "M L2 T-3", scale: 1 },
    Pa: { dimension: "M L-1 T-2", scale: 1 }, V: { dimension: "M L2 T-3 I-1", scale: 1 }, ohm: { dimension: "M L2 T-3 I-2", scale: 1 }, Ω: { dimension: "M L2 T-3 I-2", scale: 1 },
    Hz: { dimension: "T-1", scale: 1 }, F: { dimension: "M-1 L-2 T4 I2", scale: 1 }, eV: { dimension: "M L2 T-2", scale: 1.602176634e-19 },
    mol: { dimension: "Nmol", scale: 1 },
  };
  const prefixes: Record<string, number> = { k: 1e3, M: 1e6, G: 1e9, m: 1e-3, u: 1e-6, μ: 1e-6, n: 1e-9 };
  const groups = cleaned.replace(/per/gi, "/").split("/");
  let scale = 1;
  const powers = new Map<string, number>();
  for (const [groupIndex, group] of groups.entries()) {
    const direction = groupIndex === 0 ? 1 : -1;
    for (const term of group.trim().split(/\s+/).filter(Boolean)) {
    const match = term.match(/^([A-Za-zΩμ%]+)(?:\^?([+-]?\d+))?$/);
    if (!match) return null;
    const token = match[1]!;
    const exponent = Number(match[2] ?? "1") * direction;
    const unit = base[token];
    const prefixed = unit ? null : base[token.slice(1)] && prefixes[token[0]!]
      ? { ...base[token.slice(1)]!, scale: base[token.slice(1)]!.scale * prefixes[token[0]!] }
      : null;
    const resolved = unit ?? prefixed;
    if (!resolved) return null;
    scale *= resolved.scale ** exponent;
    for (const component of resolved.dimension.split(" ")) {
      if (component === "1") continue;
      const componentMatch = component.match(/^([A-Za-z]+)([+-]?\d+(?:\.\d+)?)?$/);
      if (!componentMatch) return null;
      const symbol = componentMatch[1]!;
      const power = Number(componentMatch[2] ?? "1");
      powers.set(symbol, (powers.get(symbol) ?? 0) + power * exponent);
    }
    }
  }
  const dimension = [...powers.entries()].filter(([, power]) => Math.abs(power) > EPSILON).sort(([a], [b]) => a.localeCompare(b)).map(([symbol, power]) => `${symbol}${power === 1 ? "" : power}`).join(" ") || "1";
  const resolved = { dimension, scale, text: cleaned };
  UNIT_DIMENSION_CACHE.set(cleaned, resolved);
  return resolved;
}

function parseUnitTail(tail: string): { text: string; length: number; unit: UnitDimension } | null {
  let cursor = 0;
  while (/\s/.test(tail[cursor] ?? "")) cursor++;
  const start = cursor;
  const tokenPattern = /^(%|[A-Za-zΩμ]+(?:\s*(?:\^|[⁻−])?\s*[+-]?\d+)?)/;
  const first = tail.slice(cursor).match(tokenPattern);
  if (!first) return null;
  const firstUnit = unitDimension(first[1]!);
  if (!firstUnit) return null;
  cursor += first[1]!.length;
  while (cursor < tail.length) {
    const beforeSeparator = cursor;
    let hadWhitespace = false;
    while (/\s/.test(tail[cursor] ?? "")) { hadWhitespace = true; cursor++; }
    if (cursor >= tail.length || /[.,;:!?✓)\]}]/.test(tail[cursor]!)) {
      cursor = beforeSeparator;
      break;
    }
    let explicitSeparator = false;
    if (tail[cursor] === "/" || tail[cursor] === "*") {
      explicitSeparator = true;
      cursor++;
      while (/\s/.test(tail[cursor] ?? "")) cursor++;
    } else if (/^per\b/i.test(tail.slice(cursor))) {
      explicitSeparator = true;
      cursor += 3;
      while (/\s/.test(tail[cursor] ?? "")) cursor++;
    }
    const next = tail.slice(cursor).match(tokenPattern);
    if (!next || !unitDimension(next[1]!)) {
      cursor = beforeSeparator;
      break;
    }
    // A second unit separated only by whitespace is valid Physics notation
    // (for example `m s^-1`). Explicit separators also cover `N/C` and `J
    // per kg`. Do not consume arbitrary prose after the unit expression.
    if (!hadWhitespace && !explicitSeparator) {
      cursor = beforeSeparator;
      break;
    }
    cursor += next[1]!.length;
  }
  const text = tail.slice(start, cursor).trim();
  const unit = unitDimension(text);
  return unit ? { text, length: cursor, unit } : null;
}

function canonicalDimension(dimension: string): string {
  // Charge is Q in the parser's readable output, but Q = I·T in SI base
  // dimensions. Canonicalising here makes equivalent forms such as N C^-1
  // and V m^-1 compare correctly without changing the author-facing unit
  // text.
  const powers = new Map<string, number>();
  for (const component of dimension.split(" ").filter(Boolean)) {
    const match = component.match(/^([A-Za-z]+)(-?\d+(?:\.\d+)?)?$/);
    if (!match) continue;
    const symbol = match[1]!;
    const power = Number(match[2] ?? "1");
    if (symbol === "Q") {
      powers.set("I", (powers.get("I") ?? 0) + power);
      powers.set("T", (powers.get("T") ?? 0) + power);
    } else {
      powers.set(symbol, (powers.get(symbol) ?? 0) + power);
    }
  }
  return [...powers.entries()].filter(([, power]) => Math.abs(power) > EPSILON).sort(([left], [right]) => left.localeCompare(right)).map(([symbol, power]) => `${symbol}${power === 1 ? "" : power}`).join(" ") || "1";
}

function findNumericStart(text: string): number {
  // Include a leading sign in the slice handed to the parser. Searching for
  // the digit alone would turn `-15 - 20` into `15 - 20` and silently reverse
  // a signed momentum calculation.
  const match = text.search(/[+-]?(?:\d|\.\d|sqrt|π|pi|\()/i);
  return match < 0 ? text.length : match;
}

const NUMERIC_PARSE_CACHE = new Map<string, NumericValue | null>();

function parseNumericSegment(segment: string): NumericValue | null {
  if (!/[0-9]|\b(?:sqrt|pi)\b|π/i.test(segment)) return null;
  const cached = NUMERIC_PARSE_CACHE.get(segment);
  if (cached !== undefined || NUMERIC_PARSE_CACHE.has(segment)) return cached ?? null;
  const parsed = parseNumericSegmentUncached(segment);
  NUMERIC_PARSE_CACHE.set(segment, parsed);
  return parsed;
}

function parseNumericSegmentUncached(segment: string): NumericValue | null {
  const normal = normalise(segment);
  const trimmed = normal.trim();
  // Only evaluate an expression when its first token is numeric (or an
  // explicit root/parenthesis). Starting inside a symbolic formula such as
  // `GM/r²` or `I²R` would turn an exponent into a fictitious calculation.
  if (!/^(?:[+-]?(?:\d|\.\d)|sqrt\s*\(|π|pi\s*\b|\()/i.test(trimmed)) return null;
  const start = findNumericStart(trimmed);
  if (start >= trimmed.length) return null;
  if (/(?:sin|cos|tan|arcsin|arccos|arctan|log|ln)\s*\([^)]*$/i.test(trimmed.slice(0, start))) return null;
  const parser = new NumericParser(trimmed.slice(start));
  const parsed = parser.parse();
  if (!parsed) return null;
  const tail = trimmed.slice(start + parsed.consumed);
  const parsedUnit = parseUnitTail(tail);
  const candidateText = parsedUnit?.text ?? "";
  // A token such as `kA^2` immediately after `1/2` is normally the symbolic
  // product k·A² in a Physics formula, not a kilampere-squared unit. Reject
  // that ambiguous compact spelling; authored final units use a space.
  const symbolicCompact = /^k[A-Z]\^?\d+$/u.test(candidateText) && /^(?:1\s*\/\s*2|3\s*\/\s*2)/.test(trimmed);
  const candidateUnit = !symbolicCompact && parsedUnit ? parsedUnit.unit : null;
  const unit = candidateUnit;
  const unitLength = candidateUnit && parsedUnit ? parsedUnit.length : 0;
  const remainder = tail.slice(unitLength).replace(/[\s.,;:!?✓)]/g, "");
  let effectiveUnit = unit;
  // In prose calculations the unit is frequently written only after the
  // denominator (`0.693 / 360 s`). Treat that trailing time unit as s^-1 so
  // dimensional checks compare the quantity actually produced by the
  // division. Do not invert compound units that already carry an exponent.
  if (effectiveUnit && /\/\s*[+-]?(?:\d|\.\d)/.test(trimmed) && /^[A-Za-z]+$/.test(effectiveUnit.text) && /^T$/.test(effectiveUnit.dimension)) {
    const invertedDimension = effectiveUnit.dimension.split(" ").map((component) => {
      const match = component.match(/^([A-Za-z]+)([+-]\d+(?:\.\d+)?)?$/);
      if (!match) return component;
      const power = -Number(match[2] ?? "1");
      return `${match[1]}${power === 1 ? "" : power}`;
    }).join(" ");
    effectiveUnit = { ...effectiveUnit, dimension: invertedDimension, scale: effectiveUnit.scale === 0 ? effectiveUnit.scale : 1 / effectiveUnit.scale };
  }
  if (effectiveUnit && /^1\s*\//.test(trimmed) && /(?:\^-|\s-)/.test(effectiveUnit.text)) {
    const powers = effectiveUnit.dimension.split(" ").map((component) => {
      const match = component.match(/^([A-Za-z]+)(-?\d+(?:\.\d+)?)?$/);
      if (!match) return component;
      const invertedPower = match[2] ? -Number(match[2]) : -1;
      return `${match[1]}${invertedPower === 1 ? "" : invertedPower}`;
    });
    effectiveUnit = { ...effectiveUnit, dimension: powers.join(" "), scale: effectiveUnit.scale === 0 ? effectiveUnit.scale : 1 / effectiveUnit.scale };
  }
  return { value: parsed.value, raw: segment.trim(), unit: effectiveUnit, consumed: start + parsed.consumed, clean: remainder.length === 0 };
}

function hasNumber(text: string): boolean {
  return /(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.test(text);
}

function stripUnitPowers(text: string): string {
  return text.replace(/\b[A-Za-zΩμ%]+\s*(?:\^\s*[+-]?\d+|[⁻−]\s*[+-]?\d+)/gu, "unit");
}

function toleranceFor(left: number, right: number, leftRaw: string, rightRaw: string, context = ""): PhysicsNumericalTolerance {
  const requested = requestedSignificantFigures(context);
  const leftFigures = minimumSignificantFigures(leftRaw);
  const rightFigures = minimumSignificantFigures(rightRaw);
  const figures = requested ?? (leftFigures && rightFigures ? Math.min(leftFigures, rightFigures) : leftFigures ?? rightFigures);
  const magnitude = Math.max(Math.abs(left), Math.abs(right), 1e-12);
  const exponent = Math.floor(Math.log10(magnitude));
  const roundingStep = figures ? 10 ** (exponent - figures + 1) : magnitude * APPROXIMATE_FALLBACK_RELATIVE_TOLERANCE;
  const explicitApproximation = /(?:≈|≃|~|approximately|approx.?|about|roughly|estimate)/i.test(context);
  // Propagate the half-unit uncertainty of reported operands. This accepts a
  // guard-digit result such as `14.1 / 6.0 = 2.36` while still rejecting a
  // factor-of-two or wrong-sign answer.
  const operandRelative = [...stripUnitPowers(leftRaw).matchAll(NUMBER_TOKEN)].reduce((sum, match) => {
    const raw = match[0]!;
    const value = Number(normalise(raw).replace(/\s*[×x*]\s*10\s*\^\s*([+-]?\d+)/i, "e$1"));
    const sf = significantFigures(raw);
    if (/^[+-]?0?\.5$/.test(raw.trim())) return sum;
    if (!sf || !Number.isFinite(value) || Math.abs(value) < EPSILON) return sum;
    const operandExponent = Math.floor(Math.log10(Math.abs(value)));
    const halfUlp = 0.5 * 10 ** (operandExponent - sf + 1);
    return sum + Math.abs(halfUlp / value);
  }, 0);
  const precisionRelative = Math.max(Number.EPSILON * 32, Math.abs(roundingStep / magnitude) / 2, operandRelative);
  const relative = explicitApproximation
    ? Math.max(precisionRelative, APPROXIMATE_FALLBACK_RELATIVE_TOLERANCE)
    : precisionRelative;
  return {
    absolute: Math.max(1e-12, Math.abs(roundingStep) / 2),
    relative,
    basis: figures
      ? `${figures} significant-figure rounding${explicitApproximation ? " with approximate-result allowance" : ""}`
      : explicitApproximation ? "approximate result fallback (2.5%)" : "machine precision (no recoverable precision)",
  };
}

function compareNumbers(left: number, right: number, leftRaw: string, rightRaw: string, context = ""): { close: boolean; tolerance: PhysicsNumericalTolerance } {
  const tolerance = toleranceFor(left, right, leftRaw, rightRaw, context);
  const difference = Math.abs(left - right);
  const allowed = Math.max(tolerance.absolute, Math.max(Math.abs(left), Math.abs(right), 1e-12) * tolerance.relative);
  return { close: difference <= allowed, tolerance };
}

function compareNumericValues(left: NumericValue, right: NumericValue, context = ""): { close: boolean; tolerance: PhysicsNumericalTolerance } {
  if (left.unit && right.unit && canonicalDimension(left.unit.dimension) === canonicalDimension(right.unit.dimension)) {
    return compareNumbers(left.value * left.unit.scale, right.value * right.unit.scale, left.raw, right.raw, context);
  }
  if (left.unit && !right.unit) {
    // A missing unit on one side of a worked equality is an omitted label,
    // not permission to apply an arbitrary SI conversion (e.g. `8.9 mm`
    // should compare with the preceding `4√5`, whose unit is implicit).
    const raw = compareNumbers(left.value, right.value, left.raw, right.raw, context);
    if (raw.close || Math.abs(left.unit.scale - 1) < EPSILON) return raw;
    return compareNumbers(left.value * left.unit.scale, right.value, left.raw, right.raw, context);
  }
  if (right.unit && !left.unit) {
    const raw = compareNumbers(left.value, right.value, left.raw, right.raw, context);
    if (raw.close || Math.abs(right.unit.scale - 1) < EPSILON) return raw;
    return compareNumbers(left.value, right.value * right.unit.scale, left.raw, right.raw, context);
  }
  return compareNumbers(left.value, right.value, left.raw, right.raw, context);
}

function sameDimension(left: NumericValue, right: NumericValue): boolean | null {
  if (!left.unit || !right.unit) return null;
  return canonicalDimension(left.unit.dimension) === canonicalDimension(right.unit.dimension);
}

function equationLike(segment: string, parsed: NumericValue | null): boolean {
  if (!parsed || !parsed.clean || /[<>≤≥]/.test(segment)) return false;
  const normal = normalise(segment);
  const start = findNumericStart(normal);
  const prefix = normal.slice(0, start).trim();
  if (prefix.length > 16) return false;
  if (/\b(?:the|this|that|is|are|as|so|at|from|given|because|would|which|where|and|or|then|requires|means)\b/i.test(prefix)) return false;
  if (/(?:sin|cos|tan|arcsin|arccos|arctan|log|ln)\s*\(/i.test(prefix)) return false;
  return true;
}

function hasArithmetic(segment: string): boolean {
  return /(?:[+\-*/^]|×|÷|√|\b(?:sqrt|sin|cos|log)\b)/i.test(segment.replace(/^[^=]*=/, ""));
}

function addIssue(issues: PhysicsNumericalIssue[], issue: PhysicsNumericalIssue): void {
  issues.push(issue);
}

interface EquationAudit {
  checks: number;
  verified: number;
  errors: number;
  dimensions: number;
  dimensionCandidates: number;
  dimensionVerified: number;
  dimensionErrors: number;
  dimensionUnresolved: number;
  claims: PhysicsNumericalClaim[];
  provenance: PhysicsNumericalProvenance[];
}

const NUMBER_TOKEN = /[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:\s*(?:(?:[eE][+-]?\d+)|(?:[×x*]\s*10\s*(?:\^|[⁻−])?\s*[+-]?\d+)|(?:10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)))?)/g;

function numericTokenCount(text: string): number {
  // Unit exponents (`s^-2`, `m²`) are dimensions, not independent numerical
  // claims. Remove them before counting values in the clause.
  return [...stripUnitPowers(text).matchAll(NUMBER_TOKEN)].length;
}

function standaloneNumericValue(text: string): NumericValue | null {
  const normal = normalise(text);
  const candidates = [...normal.matchAll(/[+-]?(?:\d|\.\d|sqrt|π|pi|\()/gi)];
  for (const candidate of candidates.slice(0, 2)) {
    const value = parseNumericSegment(normal.slice(candidate.index));
    if (value && value.clean) return value;
  }
  return null;
}

const CLAUSE_CACHE = new Map<string, string[]>();

function clauseLines(text: string): string[] {
  const cached = CLAUSE_CACHE.get(text);
  if (cached) return cached;
  // Keep decimal points inside numbers while separating ordinary prose
  // sentences. This lets a sentence such as “energy is 11 700 J. power is
  // 975 W” produce two independent claims instead of assigning 975 W to the
  // energy label.
  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!;
    const hardBreak = character === "\n" || character === ";";
    const sentenceBreak = /[.!?]/.test(character) && /\s/.test(text[index + 1] ?? "") && /[A-Za-z(]/.test(text[index + 2] ?? "");
    if (!hardBreak && !sentenceBreak) continue;
    const line = text.slice(start, index + 1).trim();
    if (line) lines.push(line);
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) lines.push(tail);
  CLAUSE_CACHE.set(text, lines);
  return lines;
}

function claimFromEquation(
  source: PhysicsNumericalClaim["source"],
  line: string,
  leftSegment: string,
  rightSegment: string,
  left: NumericValue,
  right: NumericValue,
  sequence: number,
  issues: PhysicsNumericalIssue[],
  precisionContext = "",
): { claim: PhysicsNumericalClaim; provenance: PhysicsNumericalProvenance; ok: boolean; tolerance: PhysicsNumericalTolerance } {
  const id = `${source}:equation:${sequence}`;
  const comparison = compareNumericValues(left, right, `${line} ${precisionContext}`);
  const ok = comparison.close;
  const provenance: PhysicsNumericalProvenance = {
    claimId: id,
    source,
    sourceValues: [leftSegment.trim(), rightSegment.trim()],
    parsedEquation: `${leftSegment.trim()} = ${rightSegment.trim()}`,
    recomputedResult: String(left.value),
    authoredResult: rightSegment.trim(),
    tolerance: comparison.tolerance,
    status: ok ? "verified" : "error",
  };
  const claim: PhysicsNumericalClaim = {
    id,
    source,
    text: line,
    parsed: true,
    status: ok ? "verified" : "error",
    expression: provenance.parsedEquation,
    authoredResult: rightSegment.trim(),
    provenance,
  };
  if (!ok) {
    addIssue(issues, { kind: "numeric-arithmetic", severity: "error", source, detail: `Recomputed ${leftSegment} as ${left.value} but the next value is ${rightSegment}.` });
  }
  return { claim, provenance, ok, tolerance: comparison.tolerance };
}

function auditEquations(text: string, source: PhysicsNumericalClaim["source"], issues: PhysicsNumericalIssue[], precisionContext = ""): EquationAudit {
  let checks = 0;
  let verified = 0;
  let errors = 0;
  let dimensions = 0;
  let dimensionCandidates = 0;
  let dimensionVerified = 0;
  let dimensionErrors = 0;
  let dimensionUnresolved = 0;
  const claims: PhysicsNumericalClaim[] = [];
  const provenance: PhysicsNumericalProvenance[] = [];
  let sequence = 0;
  let unresolvedIssueAdded = false;
  for (const line of clauseLines(text)) {
    if (!hasNumber(line)) continue;
    const segments = line.split(/(?:=>|=|≈|≃|~)/).map((part) => part.trim()).filter(Boolean);
    const parsed = segments.map(parseNumericSegment);
    const coveredSegments = new Set<number>();
    for (let index = 0; index + 1 < parsed.length; index++) {
      const left = parsed[index];
      const right = parsed[index + 1];
      if (!left || !right) continue;
      if (!equationLike(segments[index]!, left) || !equationLike(segments[index + 1]!, right) || !hasArithmetic(segments[index]!)) continue;
      checks++;
      // A calculation often carries its final unit only on the right-hand
      // side (`6.0 / 3.0 = 2.0 m s^-1`). Compare the numeric values even when
      // only one side has a unit; dimensional validation below remains gated
      // on both sides having units.
      coveredSegments.add(index);
      coveredSegments.add(index + 1);
      const equationClaim = claimFromEquation(source, line, segments[index]!, segments[index + 1]!, left, right, sequence++, issues, precisionContext);
      claims.push(equationClaim.claim);
      provenance.push(equationClaim.provenance);
      if (equationClaim.ok) verified++;
      else errors++;
      const dimension = sameDimension(left, right);
      if (left.unit || right.unit) {
        dimensionCandidates++;
      }
      if (dimension !== null) {
        dimensions++;
        if (dimension) dimensionVerified++;
        else {
          dimensionErrors++;
          addIssue(issues, { kind: "dimension-mismatch", severity: "error", source, detail: `The chained quantities use incompatible units (${left.unit?.text ?? "unknown"} and ${right.unit?.text ?? "unknown"}).` });
        }
      } else if (left.unit || right.unit) {
        dimensionUnresolved++;
      }
    }
    const coveredTokens = [...coveredSegments].reduce((count, index) => count + numericTokenCount(segments[index]!), 0);
    const totalTokens = numericTokenCount(line);
    if (totalTokens > coveredTokens || (totalTokens > 0 && coveredSegments.size === 0)) {
      const value = /(?:=|\bis\b|\bequals\b|\bgives\b|\bcomes\s+to\b)/i.test(line) ? standaloneNumericValue(line) : null;
      const id = `${source}:claim:${sequence++}`;
      const claim: PhysicsNumericalClaim = {
        id,
        source,
        text: line,
        parsed: Boolean(value),
        status: value ? "parsed" : "unresolved",
        ...(value ? { authoredResult: value.raw } : {}),
      };
      claims.push(claim);
      if (value?.unit) {
        dimensionCandidates++;
        dimensionUnresolved++;
      }
      if (!unresolvedIssueAdded) {
        unresolvedIssueAdded = true;
        addIssue(issues, { kind: "unresolved-numerical", severity: "warning", source, detail: `Numeric claims remain ${value ? "parsed but independently unchecked" : "unparsed"}; inspect the claim list for every occurrence (first: ${line}).` });
      }
    }
  }
  return { checks, verified, errors, dimensions, dimensionCandidates, dimensionVerified, dimensionErrors, dimensionUnresolved, claims, provenance };
}

interface PhysicsRuleDefinition {
  id: PhysicsRuleId;
  formula: RegExp;
  label?: RegExp;
  operation?: RegExp;
  expectedUnit?: string;
  expectedUnits?: string[];
  expectedDimensions?: string[];
}

// Formula recognition only creates a candidate. A rule is counted as checked
// after a numeric equation has been independently recomputed below. This
// prevents a regex cue such as `E = hf` from being reported as validation.
const RULE_DEFINITIONS: PhysicsRuleDefinition[] = [
  { id: "F=ma", formula: /\b(?:F\s*=\s*m\s*(?:\*|·)?\s*a|a\s*=\s*F\s*\/\s*m|m\s*=\s*F\s*\/\s*a)\b/i, label: /(?:^|\b)(?:F|force)\s*=/i, operation: /[*×\/]/, expectedUnit: "N" },
  { id: "momentum", formula: /\b(?:p\s*=\s*m\s*(?:\*|·)?\s*v|v\s*=\s*p\s*\/\s*m|m\s*=\s*p\s*\/\s*v)\b/i, label: /(?:^|\b)(?:p|momentum)\s*=/i, operation: /[*×\/]/, expectedUnit: "kg m s^-1" },
  { id: "impulse", formula: /\b(?:J|Δp)\s*=\s*(?:F\s*(?:Δ|d)?t|m\s*\(?v\s*-\s*u\)?|Δp\s*\/\s*Δt)|(?:F\s*=\s*J\s*\/\s*Δ?t|Δp\s*=\s*F\s*(?:Δ|d)?t)\b/i, label: /(?:^|\b)(?:J|impulse|Δp)\s*=/i, operation: /[*×\-\/]/, expectedUnit: "N s" },
  { id: "SUVAT", formula: /\b(?:v\s*=\s*u\s*\+\s*a\s*t|s\s*=\s*u\s*t\s*\+\s*0?\.5\s*a\s*t\^?2|v\^?2\s*=\s*u\^?2\s*\+\s*2\s*a\s*s|a\s*=\s*\(?v\^?2\s*-\s*u\^?2\)?\s*\/\s*\(?2\s*s\)?|t\s*=\s*\(?v\s*-\s*u\)?\s*\/\s*a)\b/i, label: /(?:^|\b)(?:v|s)\s*=/i, operation: /[+*^\-\/]/, expectedUnits: ["m", "m s^-1"] },
  { id: "V=IR", formula: /\b(?:V\s*=\s*I\s*(?:\*|·)?\s*R|I\s*=\s*V\s*\/\s*R|R\s*=\s*V\s*\/\s*I)\b/i, label: /(?:^|\b)(?:V|voltage|potential difference)\s*=/i, operation: /[*×\/]/, expectedUnit: "V" },
  { id: "electrical-power", formula: /\b(?:P\s*=\s*(?:VI|I\^?2\s*R|V\^?2\s*\/\s*R)|I\s*=\s*P\s*\/\s*V|R\s*=\s*P\s*\/\s*I\^?2)\b/i, label: /(?:^|\b)(?:P|power)\s*=/i, operation: /[*×\/]/, expectedUnit: "W" },
  { id: "resistivity", formula: /\b(?:R\s*=\s*ρ\s*L\s*\/?\s*A|ρ\s*=\s*R\s*A\s*\/\s*L|L\s*=\s*R\s*A\s*\/\s*ρ|A\s*=\s*ρ\s*L\s*\/\s*R)\b/i, label: /(?:^|\b)(?:R|resistance)\s*=/i, operation: /[*×\/]/, expectedUnit: "ohm" },
  { id: "internal-resistance", formula: /\b(?:(?:ε|emf)\s*=\s*I\s*\(?R\s*\+\s*r\)?|V\s*=\s*ε\s*-\s*I\s*r|r\s*=\s*\(?ε\s*-\s*V\)?\s*\/\s*I)\b/i, label: /(?:^|\b)(?:ε|emf|terminal voltage)\s*=/i, operation: /[+\-*\/]/, expectedUnit: "V" },
  { id: "capacitor-energy", formula: /\b(?:E\s*=\s*½?\s*C\s*V\^?2|C\s*=\s*2\s*E\s*\/\s*V\^?2|V\s*=\s*sqrt\s*\(?2\s*E\s*\/\s*C\)?)\b/i, label: /(?:^|\b)(?:E|energy)\s*=/i, operation: /[*×^\/]/, expectedUnit: "J" },
  { id: "capacitor-charge", formula: /\b(?:Q\s*=\s*C\s*V|C\s*=\s*Q\s*\/\s*V|V\s*=\s*Q\s*\/\s*C)\b/i, label: /(?:^|\b)(?:Q|charge)\s*=/i, operation: /[*×\/]/, expectedUnit: "C" },
  { id: "capacitor-time-constant", formula: /\b(?:τ\s*=\s*R\s*C|R\s*=\s*τ\s*\/\s*C|C\s*=\s*τ\s*\/\s*R)\b/i, label: /(?:^|\b)(?:τ|time constant)\s*=/i, operation: /[*×\/]/, expectedUnit: "s" },
  { id: "wave-equation", formula: /\b(?:v\s*=\s*f\s*λ|f\s*=\s*v\s*\/\s*λ|λ\s*=\s*v\s*\/\s*f)\b/i, label: /(?:^|\b)(?:v|wave speed)\s*=/i, operation: /[*×\/]/, expectedUnit: "m s^-1" },
  { id: "field-strength", formula: /\b(?:E\s*=\s*V\s*\/\s*d|V\s*=\s*E\s*d|d\s*=\s*V\s*\/\s*E)\b/i, label: /(?:^|\b)(?:E|field strength)\s*=/i, operation: /[*×\/]/, expectedUnit: "N C^-1" },
  { id: "electric-force", formula: /\b(?:F\s*=\s*q\s*E|q\s*=\s*F\s*\/\s*E|E\s*=\s*F\s*\/\s*q)\b/i, label: /(?:^|\b)(?:F|electric force)\s*=/i, operation: /[*×\/]/, expectedUnit: "N" },
  { id: "gravitational-field", formula: /\b(?:g\s*=\s*F\s*\/\s*m|g\s*=\s*GM\s*\/\s*r\^?2|F\s*=\s*m\s*g)\b/i, label: /(?:^|\b)(?:g|gravitational field strength)\s*=/i, operation: /[*×\/]/, expectedUnit: "N kg^-1" },
  { id: "gravitational-force", formula: /\b(?:F\s*=\s*G\s*M\s*m\s*\/\s*r\^?2|M\s*=\s*F\s*r\^?2\s*\/\s*\(?G\s*m\)?)\b/i, label: /(?:^|\b)(?:F|gravitational force)\s*=/i, operation: /[*×\/]/, expectedUnit: "N" },
  { id: "E=hf", formula: /\b(?:E\s*=\s*h\s*f|f\s*=\s*E\s*\/\s*h|E\s*=\s*h\s*c\s*\/\s*λ|λ\s*=\s*h\s*c\s*\/\s*E)\b/i, label: /(?:^|\b)(?:E|photon energy)\s*=/i, operation: /[*×\/]/, expectedUnit: "J" },
  { id: "de-Broglie", formula: /\b(?:λ\s*=\s*h\s*\/\s*p|p\s*=\s*h\s*\/\s*λ)\b/i, label: /(?:^|\b)(?:λ|wavelength)\s*=/i, operation: /[*×\/]/, expectedUnit: "m" },
  { id: "decay-half-life", formula: /\b(?:N\s*=\s*N[₀0]\s*\(?1\s*\/\s*2\)?\^?|N\s*\/\s*N[₀0]\s*=\s*\(?1\s*\/\s*2\)?\^?)\b/i, label: /(?:^|\b)(?:N|activity|count rate)\s*=/i, operation: /[\/*^]/ },
  { id: "ideal-gas", formula: /\b(?:pV\s*=\s*nRT|n\s*=\s*pV\s*\/\s*RT|p\s*=\s*nRT\s*\/\s*V|V\s*=\s*nRT\s*\/\s*p)\b/i },
  { id: "thermal-energy", formula: /\b(?:Q\s*=\s*m\s*c\s*Δ?T|m\s*=\s*Q\s*\/\s*\(?c\s*Δ?T\)?|c\s*=\s*Q\s*\/\s*\(?m\s*Δ?T\)?)\b/i, label: /(?:^|\b)(?:Q|thermal energy)\s*=/i, operation: /[*×\/]/, expectedUnit: "J" },
  { id: "specific-latent-heat", formula: /\b(?:Q\s*=\s*m\s*L|m\s*=\s*Q\s*\/\s*L|L\s*=\s*Q\s*\/\s*m)\b/i, label: /(?:^|\b)(?:Q|latent heat)\s*=/i, operation: /[*×\/]/, expectedUnit: "J" },
  { id: "pressure-work", formula: /\b(?:W\s*=\s*p\s*Δ?V|p\s*=\s*W\s*\/\s*Δ?V)\b/i, label: /(?:^|\b)(?:W|work done)\s*=/i, operation: /[*×\/]/, expectedUnit: "J" },
];

// Unit dimensions are invariant across every part in the bank. Resolve them
// once instead of reparsing the same expected units for every rule candidate.
for (const definition of RULE_DEFINITIONS) {
  const expectedUnits = definition.expectedUnits ?? (definition.expectedUnit ? [definition.expectedUnit] : []);
  definition.expectedDimensions = expectedUnits
    .map((unit) => canonicalDimension(unitDimension(unit)?.dimension ?? ""))
    .filter(Boolean);
}

// Rearranged equations change the dimension of the quantity on the left
// (`I = P/V` ends in amperes, while `P = VI` ends in watts). Keep that
// distinction explicit so an expected-unit check never mistakes a valid
// rearrangement for a wrong answer. If the left-hand symbol is not safely
// recoverable, the definition-level unit is used only as a fallback.
const RULE_OUTPUT_UNITS: Partial<Record<PhysicsRuleId, Record<string, string>>> = {
  "F=ma": { F: "N", m: "kg", a: "m s^-2" },
  momentum: { p: "kg m s^-1", m: "kg", v: "m s^-1" },
  impulse: { J: "N s", "Δp": "kg m s^-1", F: "N", t: "s" },
  SUVAT: { s: "m", v: "m s^-1", u: "m s^-1", a: "m s^-2", t: "s" },
  "V=IR": { V: "V", I: "A", R: "ohm" },
  "electrical-power": { P: "W", V: "V", I: "A", R: "ohm" },
  resistivity: { R: "ohm", ρ: "ohm m", L: "m", A: "m^2" },
  "internal-resistance": { ε: "V", V: "V", I: "A", R: "ohm", r: "ohm" },
  "capacitor-energy": { E: "J", C: "F", V: "V" },
  "capacitor-charge": { Q: "C", C: "F", V: "V" },
  "capacitor-time-constant": { τ: "s", R: "ohm", C: "F" },
  "wave-equation": { v: "m s^-1", f: "Hz", λ: "m" },
  "field-strength": { E: "N C^-1", V: "V", ΔV: "V", d: "m" },
  "electric-force": { F: "N", q: "C", E: "N C^-1" },
  "gravitational-field": { g: "N kg^-1", F: "N", m: "kg" },
  "gravitational-force": { F: "N", M: "kg", m: "kg", r: "m" },
  "E=hf": { E: "J", f: "Hz", λ: "m" },
  "de-Broglie": { λ: "m", p: "kg m s^-1" },
  "ideal-gas": { n: "mol", p: "Pa", V: "m^3", T: "K" },
  "thermal-energy": { Q: "J", m: "kg", c: "J kg^-1 K^-1", ΔT: "K" },
  "specific-latent-heat": { Q: "J", m: "kg", L: "J kg^-1" },
  "pressure-work": { W: "J", p: "Pa", ΔV: "m^3" },
};

function ruleOutputVariable(line: string): string | null {
  // Restrict this to conventional one- or two-character Physics symbols so
  // prose labels (`power = ...`) cannot be mistaken for a symbol assignment.
  const match = line.match(/(?:^|[^A-Za-z0-9])((?:Δp|ΔT|ΔV|[A-Za-z](?:rms|_?\d|[₀₁₂₃₄₅₆₇₈₉])?|[λερΔφτω]))\s*=/);
  return match?.[1] ?? null;
}

function expectedRuleDimensions(definition: PhysicsRuleDefinition, line: string): { units: string[]; dimensions: string[] } {
  const variable = ruleOutputVariable(line);
  const mappedUnit = variable ? RULE_OUTPUT_UNITS[definition.id]?.[variable] : undefined;
  const units = mappedUnit ? [mappedUnit] : definition.expectedUnits ?? (definition.expectedUnit ? [definition.expectedUnit] : []);
  return { units, dimensions: units.map((unit) => canonicalDimension(unitDimension(unit)?.dimension ?? "")).filter(Boolean) };
}

function equationPairs(line: string): Array<{ leftSegment: string; rightSegment: string; left: NumericValue; right: NumericValue }> {
  const segments = line.split(/(?:=>|=|≈|≃|~)/).map((part) => part.trim()).filter(Boolean);
  const parsed = segments.map(parseNumericSegment);
  const pairs: Array<{ leftSegment: string; rightSegment: string; left: NumericValue; right: NumericValue }> = [];
  for (let index = 0; index + 1 < parsed.length; index++) {
    const left = parsed[index];
    const right = parsed[index + 1];
    if (!left || !right || !equationLike(segments[index]!, left) || !equationLike(segments[index + 1]!, right) || !hasArithmetic(segments[index]!)) continue;
    pairs.push({ leftSegment: segments[index]!, rightSegment: segments[index + 1]!, left, right });
  }
  return pairs;
}

function auditPhysicsRules(text: string, source: PhysicsNumericalClaim["source"], issues: PhysicsNumericalIssue[], precisionContext = ""): { detected: number; checks: number; verified: number; errors: number; unresolved: number; rows: PhysicsRuleAudit[] } {
  let detected = 0;
  let checks = 0;
  let verified = 0;
  let errors = 0;
  let unresolved = 0;
  const rows: PhysicsRuleAudit[] = [];
  for (const line of clauseLines(text)) {
    if (!/[=≈≃~]/.test(line) || !/\b(?:F|m|a|p|P|V|I|R|E|Q|N|λ|τ|W|g|force|power|energy|charge|wavelength|pressure|temperature)\s*=/i.test(line)) continue;
    // Parse the numeric equality once per line. Rule definitions are only
    // different Physics-law cues; repeatedly splitting and parsing the same
    // expression for every rule made the bank audit scale poorly as the
    // question bank grew.
    const pair = equationPairs(line)[0];
    for (const definition of RULE_DEFINITIONS) {
      const formulaCue = definition.formula.test(line);
      // A single letter such as `v` or `E` is ambiguous. Keep the label as a
      // coverage cue so it can be reviewed, but do not call it a Physics-law
      // check unless the formula itself is present. A bare `F = 6 N` proves
      // only that a number was reported; it does not prove F = ma.
      const expected = expectedRuleDimensions(definition, line);
      const expectedUnits = expected.units;
      const expectedDimensions = expected.dimensions;
      const labelCue = Boolean(definition.label?.test(line) && (!definition.operation || definition.operation.test(line)) && expectedDimensions.length > 0 && pair?.right.unit && expectedDimensions.includes(canonicalDimension(pair.right.unit.dimension)));
      const cue = formulaCue || labelCue;
      if (!cue) continue;
      detected++;
      if (!formulaCue) {
        unresolved++;
        rows.push({ id: definition.id, source, expression: line, status: "unresolved", detail: "A quantity label resembles this relation, but the formula is not stated; no Physics-law validation was credited." });
        continue;
      }
      if (!pair) {
        unresolved++;
        rows.push({ id: definition.id, source, expression: line, status: "unresolved", detail: "Formula cue found without a fully numeric, recomputable equality." });
        continue;
      }
      checks++;
      const comparison = compareNumericValues(pair.left, pair.right, `${line} ${precisionContext}`);
      let ok = comparison.close;
      let detail = comparison.close ? `Recomputed ${pair.left.value} to ${pair.right.value}.` : `Recomputed ${pair.left.value} but the authored result is ${pair.right.raw}.`;
      if (ok && expectedDimensions.length > 0 && pair.right.unit) {
        if (!expectedDimensions.includes(canonicalDimension(pair.right.unit.dimension))) {
          ok = false;
          detail = `Expected ${expectedUnits.join(" or ")} but the authored result uses ${pair.right.unit.text}.`;
          addIssue(issues, { kind: "dimension-mismatch", severity: "error", source, detail: `${definition.id}: ${detail}` });
        }
      }
      if (ok) verified++;
      else {
        errors++;
        if (!detail.startsWith("Expected")) addIssue(issues, { kind: "numeric-arithmetic", severity: "error", source, detail: `${definition.id}: ${detail}` });
      }
      rows.push({ id: definition.id, source, expression: line, status: ok ? "verified" : "error", detail });
    }
  }
  return { detected, checks, verified, errors, unresolved, rows };
}

interface QuantityCandidate {
  key: string;
  label: string;
  value: NumericValue;
  text: string;
}

function quantityLabelIdentity(label: string): string {
  return label
    .toLowerCase()
    .replace(/₀/g, "0").replace(/₁/g, "1").replace(/₂/g, "2").replace(/₃/g, "3").replace(/₄/g, "4")
    .replace(/₅/g, "5").replace(/₆/g, "6").replace(/₇/g, "7").replace(/₈/g, "8").replace(/₉/g, "9")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9λερδμτφωεθ_]/g, "");
}

function quantityKey(label: string): string {
  const compact = label.replace(/\s+/g, "").trim();
  // Preserve the conventional case/subscript meaning before lower-casing:
  // F is force while f is frequency; V₀/V_rms are voltage quantities while
  // v₀ is an initial speed. Component subscripts also give a stable semantic
  // key for prose labels such as “horizontal component”.
  if (compact === "F") return "force";
  if (compact === "P") return "power";
  if (compact === "p") return "momentum";
  if (/^f(?:_?0|₀)?$/.test(compact)) return "frequency";
  if (/^v(?:_?x|ₓ)$/.test(compact)) return "horizontal component";
  if (/^v(?:_?y|ᵧ)$/.test(compact)) return "vertical component";
  if (/^v(?:_?0|₀)$/.test(compact)) return "speed";
  if (/^V(?:_?0|₀|_rms)$/.test(compact)) return "voltage";
  const cleaned = label
    .toLowerCase()
    .replace(/[^a-z0-9λερΔμτφωεθ_ ]+/g, " ")
    .replace(/\b(?:the|a|an|final|resulting|calculated|reported|answer|value|magnitude|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    v: "speed", velocity: "speed", "wave speed": "speed", "final speed": "speed",
    force: "force", f: "frequency", acceleration: "acceleration", current: "current", voltage: "voltage",
    "potential difference": "voltage", resistance: "resistance", power: "power", energy: "energy",
    charge: "charge", wavelength: "wavelength", "time constant": "time constant", momentum: "momentum",
    φ: "work function", ε: "emf", λ: "wavelength", τ: "time constant", ω: "angular frequency", ρ: "resistivity",
  };
  return aliases[cleaned] ?? cleaned;
}

const QUANTITY_CACHE = new Map<string, QuantityCandidate[]>();

function quantityCandidates(text: string): QuantityCandidate[] {
  const cached = QUANTITY_CACHE.get(text);
  if (cached) return cached;
  const candidates: QuantityCandidate[] = [];
  for (const line of clauseLines(text)) {
    if (!hasNumber(line) || !/(?:=|\bis\b|\bequals\b|\bgives\b|\bcomes\s+to\b)/i.test(line)) continue;
    // A worked answer can contain several labelled assignments in one
    // sentence (`X_C = ... = 79.6 Ω, so I_rms = ... = 0.151 A`). Splitting
    // only on `=` would attach the last value to the first label. Locate each
    // assignment first, then evaluate only the equality chain belonging to
    // that label.
    const assignments = [...line.matchAll(/(?:^|[,;]|\b(?:so|then|therefore|and)\b)\s*(?:the\s+)?([A-Za-zλερΔμτφωεθ][A-Za-z0-9λερΔμτφωεθ _₀₁₂₃₄₅₆₇₈₉ₓᵧxy-]{0,50}?)\s*=/gi)]
      .map((match) => {
        const rawLabel = match[1]?.trim() ?? "";
        const labelOffset = (match[0] ?? "").lastIndexOf(rawLabel);
        return { index: (match.index ?? 0) + Math.max(0, labelOffset), label: rawLabel.replace(/^(?:so|then|therefore|and)\s+/i, "") };
      })
      .filter(({ label }) => label.length > 0);
    for (let index = 0; index < assignments.length; index++) {
      const assignment = assignments[index]!;
      const end = assignments[index + 1]?.index ?? line.length;
      const chunk = line.slice(assignment.index, end)
        // Stop an assignment before a following prose quantity (`..., a
        // wavelength of ... ≈ ...`) even when that quantity has no `=` label.
        // Thousands separators remain safe because the look-ahead requires a
        // letter after the comma.
        .split(/,(?=\s*(?:(?:the|a|an|so|then|therefore|and)\s+)?[A-Za-zλερΔμτ])/i)[0]!
      const segments = chunk.split(/(?:=>|=|≈|≃|~)/).map((part) => part.trim()).filter(Boolean);
      if (segments.length < 2) continue;
      // Strip a connector left immediately before the next assignment. The
      // numeric parser must see the complete final quantity but no prose.
      const finalSegment = segments[segments.length - 1]!
        .replace(/[,;:.!?]\s*$/g, "")
        .replace(/\s+(?:so|then|therefore|because|while|and)\s*$/i, "")
        .trim();
      const value = parseNumericSegment(finalSegment);
      const label = assignment.label.replace(/^\s*(?:the\s+)?/, "").trim();
      if (!value?.clean || !label || hasNumber(label) || /\b(?:mark|award|allow|accept|ignore|gives|giving|subtract|adding|therefore|using|calculate|determine|split|then|so)\b/i.test(label)) continue;
      candidates.push({ key: quantityKey(label), label, value, text: chunk.trim() });
    }
    // A scheme sometimes omits the symbol on a final calculation line
    // (`11 700 / 12 = 975 W`). Keep that value as an anonymous candidate so
    // it can be paired only when the opposite source has one unique result
    // with the same dimensional family.
    if (!assignments.length) {
      const segments = line.split(/(?:=>|=|≈|≃|~)/).map((part) => part.trim()).filter(Boolean);
      if (segments.length >= 2) {
        const value = parseNumericSegment(segments[segments.length - 1]!.replace(/[,;:.!?]\s*$/g, ""));
        const label = segments[0]!.replace(/^\s*(?:the\s+)?/, "").trim();
        // Only an unlabelled numeric expression can use this fallback. A
        // prose sentence with several labelled equalities would otherwise
        // make its last value look like the first result.
        if (/^[+-]?(?:\d|\.\d|\(|sqrt\b)/i.test(segments[0]!.trim()) && value?.clean && !/\b(?:mark|award|allow|accept|ignore)\b/i.test(label)) {
          candidates.push({ key: "", label: "final quantity", value, text: line });
        }
      }
    }
    // A worked sentence often contains several labelled quantities joined by
    // “so”, “then” or a comma. Audit each clause independently so the second
    // number cannot accidentally be assigned to the first label.
    for (const proseClause of line.split(/[,;]|\b(?:so|then|because|while|and)\b/i).map((clause) => clause.trim()).filter(Boolean)) {
      const prose = proseClause.match(/^(?:(?:the|a|an)\s+)?([A-Za-zλερΔμτ][A-Za-z0-9λερΔμτ _\-/^₀₁₂₃₄₅₆₇₈₉⁻⁺]{1,80}?)\s+(?:is|equals|gives|comes\s+to|works\s+out\s+at|≈|≃|~)\s+(.+)$/i);
      if (!prose) continue;
      let value = standaloneNumericValue(prose[2]!);
      if (!value) {
        // Prose labels often put a calculation before the final value
        // (`horizontal component is 16 cos 30° = 13.9 m s⁻¹`). The generic
        // parser cannot evaluate the symbolic prefix, so inspect the final
        // equality segment only.
        const equalitySegments = prose[2]!.split(/(?:=>|=|≈|≃|~)/).map((part) => part.trim()).filter(Boolean);
        if (equalitySegments.length > 1) value = parseNumericSegment(equalitySegments[equalitySegments.length - 1]!.replace(/[,;:.!?]\s*$/g, ""));
      }
      if (!value) continue;
      const label = prose[1]!.trim();
      if (/\b(?:mark|award|allow|accept|ignore|gives|giving|subtract|adding|therefore|using|calculate|determine|split|then|so)\b/i.test(label)) continue;
      candidates.push({ key: quantityKey(label), label, value, text: proseClause });
    }
  }
  QUANTITY_CACHE.set(text, candidates);
  return candidates;
}

function significantFigures(raw: string): number | null {
  const match = raw.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
  if (!match) return null;
  const mantissa = match[0]!.replace(/^[+-]/, "").replace(/[eE].*$/, "");
  const digits = mantissa.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? digits.length : null;
}

function minimumSignificantFigures(raw: string): number | null {
  const values = [...stripUnitPowers(raw).matchAll(NUMBER_TOKEN)]
    .filter((match) => !/^[+-]?0?\.5$/.test(match[0]!.trim()))
    .map((match) => significantFigures(match[0]!))
    .filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : null;
}

/** Audit one part; it never treats unparsed prose as a Physics error. */
export function auditPhysicsPartNumerics(part: QuestionPart): PhysicsNumericalAudit {
  const issues: PhysicsNumericalIssue[] = [];
  const promptText = part.prompt;
  const schemeText = (part.markScheme ?? []).join("\n");
  const answerText = part.modelAnswer;
  const promptAudit = auditEquations(promptText, "prompt", issues, promptText);
  const schemeAudit = auditEquations(schemeText, "scheme", issues, promptText);
  const answerAudit = auditEquations(answerText, "answer", issues, promptText);
  const allClaims = [...promptAudit.claims, ...schemeAudit.claims, ...answerAudit.claims];
  const allProvenance = [...promptAudit.provenance, ...schemeAudit.provenance, ...answerAudit.provenance];
  let schemeAnswerChecks = 0;
  let schemeAnswerVerified = 0;
  let schemeAnswerErrors = 0;
  let schemeAnswerUnresolved = 0;
  let schemeAnswerDimensionalChecks = 0;
  let schemeAnswerDimensionalVerified = 0;
  let schemeAnswerDimensionalErrors = 0;
  const schemeValues = quantityCandidates(schemeText);
  const answerValues = quantityCandidates(answerText);
  const usedAnswerValues = new Set<number>();
  const schemeAnswerProvenance: PhysicsNumericalProvenance[] = [];
  for (const schemeCandidate of schemeValues) {
    const exactLabel = schemeCandidate.key
      ? answerValues.findIndex((candidate, index) => !usedAnswerValues.has(index) && quantityLabelIdentity(candidate.label) === quantityLabelIdentity(schemeCandidate.label))
      : -1;
    const exact = schemeCandidate.key
      ? answerValues.findIndex((candidate, index) => !usedAnswerValues.has(index) && candidate.key === schemeCandidate.key)
      : -1;
    let answerIndex = exactLabel >= 0 ? exactLabel : exact;
    if (answerIndex < 0 && schemeCandidate.key === "" && schemeCandidate.value.unit &&
        // Anonymous results are useful when both sides expose one final
        // quantity, but pairing one of several same-unit intermediates would
        // silently compare the wrong result. Keep the fallback deliberately
        // conservative until a label or a human mapping makes the identity
        // explicit.
        schemeValues.length === 1 && answerValues.length === 1) {
      const dimensionalMatches = answerValues.map((candidate, index) => ({ candidate, index })).filter(({ candidate, index }) => !usedAnswerValues.has(index) && candidate.value.unit && canonicalDimension(candidate.value.unit.dimension) === canonicalDimension(schemeCandidate.value.unit!.dimension));
      // Do not pair unrelated quantities merely because their units match when
      // there are several candidates. An anonymous result is safe only when
      // the worked answer exposes one unique result in that dimension.
      if (dimensionalMatches.length === 1) answerIndex = dimensionalMatches[0]!.index;
    }
    if (answerIndex < 0) {
      schemeAnswerUnresolved++;
      continue;
    }
    const answerCandidate = answerValues[answerIndex]!;
    usedAnswerValues.add(answerIndex);
    schemeAnswerChecks++;
    const dimension = sameDimension(schemeCandidate.value, answerCandidate.value);
    if (dimension !== null) {
      schemeAnswerDimensionalChecks++;
      if (dimension) schemeAnswerDimensionalVerified++;
      else schemeAnswerDimensionalErrors++;
    }
    if (dimension === false) {
      schemeAnswerErrors++;
      addIssue(issues, { kind: "dimension-mismatch", severity: "error", source: "scheme-answer", detail: `${schemeCandidate.label} uses ${schemeCandidate.value.unit?.text ?? "an unrecognised unit"} in the scheme and ${answerCandidate.value.unit?.text ?? "an unrecognised unit"} in the worked answer.` });
      continue;
    }
    const magnitudeReported = /\b(?:magnitude|absolute|size)\b/i.test(`${schemeCandidate.label} ${answerCandidate.label}`);
    // A V–I graph is normally reported with a negative gradient while a
    // mark scheme may ask for the gradient *magnitude* (the internal
    // resistance). Treat that explicit magnitude wording as a sign-invariant
    // comparison; an unexplained sign change remains a mismatch.
    const comparison = magnitudeReported
      ? compareNumericValues({ ...schemeCandidate.value, value: Math.abs(schemeCandidate.value.value) }, { ...answerCandidate.value, value: Math.abs(answerCandidate.value.value) }, `${schemeCandidate.text} | ${answerCandidate.text}`)
      : compareNumericValues(schemeCandidate.value, answerCandidate.value, `${schemeCandidate.text} | ${answerCandidate.text}`);
    const claimId = `scheme-answer:comparison:${schemeAnswerChecks - 1}`;
    const comparisonProvenance: PhysicsNumericalProvenance = {
      claimId,
      source: "scheme-answer",
      sourceValues: [schemeCandidate.value.raw, answerCandidate.value.raw],
      parsedEquation: `${schemeCandidate.label} (${schemeCandidate.value.raw}) ↔ ${answerCandidate.label} (${answerCandidate.value.raw})`,
      recomputedResult: schemeCandidate.value.raw,
      authoredResult: answerCandidate.value.raw,
      tolerance: comparison.tolerance,
      status: comparison.close ? "verified" : "error",
    };
    schemeAnswerProvenance.push(comparisonProvenance);
    if (comparison.close) {
      schemeAnswerVerified++;
    } else {
      schemeAnswerErrors++;
      addIssue(issues, { kind: "scheme-answer-mismatch", severity: "error", source: "scheme-answer", detail: `${schemeCandidate.label} is ${schemeCandidate.value.raw} in the scheme but ${answerCandidate.value.raw} in the worked answer.` });
    }
  }
  if (schemeAnswerUnresolved > 0) {
    addIssue(issues, {
      kind: "unresolved-numerical",
      severity: "warning",
      source: "scheme-answer",
      detail: `${schemeAnswerUnresolved} scheme↔worked-answer quantity pairing${schemeAnswerUnresolved === 1 ? " remains" : "s remain"} unresolved; retain it for manual mapping rather than assuming the values refer to the same quantity.`,
    });
  }
  const ruleAudits = [
    auditPhysicsRules(promptText, "prompt", issues, promptText),
    auditPhysicsRules(schemeText, "scheme", issues, promptText),
    auditPhysicsRules(answerText, "answer", issues, promptText),
  ];
  const physicsRules = ruleAudits.flatMap((audit) => audit.rows);
  const physicsRuleDetected = ruleAudits.reduce((sum, audit) => sum + audit.detected, 0);
  const physicsRuleChecks = ruleAudits.reduce((sum, audit) => sum + audit.checks, 0);
  const physicsRuleVerified = ruleAudits.reduce((sum, audit) => sum + audit.verified, 0);
  const physicsRuleErrors = ruleAudits.reduce((sum, audit) => sum + audit.errors, 0);
  const physicsRuleUnresolved = ruleAudits.reduce((sum, audit) => sum + audit.unresolved, 0);
  allProvenance.push(...schemeAnswerProvenance);
  for (const rule of physicsRules) {
    if (rule.status !== "verified") continue;
    const evidence = allProvenance.find((row) => row.source === rule.source && row.status === "verified" && row.sourceValues.every((value) => rule.expression.includes(value.replace(/[.!?]+$/, ""))));
    if (evidence && !evidence.rule) evidence.rule = rule.id;
  }
  const claimsDetected = allClaims.length;
  const claimsParsed = allClaims.filter((claim) => claim.parsed).length;
  // Scheme↔answer consistency is reported separately: agreeing answers do
  // not independently establish that either value is physically correct.
  const claimsVerified = allClaims.filter((claim) => claim.status === "verified").length;
  const claimErrors = allClaims.filter((claim) => claim.status === "error").length;
  const claimsUnresolved = allClaims.filter((claim) => claim.status === "parsed" || claim.status === "unresolved").length;
  const unresolved = claimsUnresolved + schemeAnswerUnresolved;
  const dimensionalClaimsDetected = promptAudit.dimensionCandidates + schemeAudit.dimensionCandidates + answerAudit.dimensionCandidates + schemeValues.filter((candidate) => Boolean(candidate.value.unit)).length + answerValues.filter((candidate) => Boolean(candidate.value.unit)).length;
  const arithmeticChecks = promptAudit.checks + schemeAudit.checks + answerAudit.checks;
  const arithmeticVerified = promptAudit.verified + schemeAudit.verified + answerAudit.verified;
  const arithmeticErrors = promptAudit.errors + schemeAudit.errors + answerAudit.errors;
  const dimensionalChecks = promptAudit.dimensions + schemeAudit.dimensions + answerAudit.dimensions + schemeAnswerDimensionalChecks;
  const dimensionalVerified = promptAudit.dimensionVerified + schemeAudit.dimensionVerified + answerAudit.dimensionVerified + schemeAnswerDimensionalVerified;
  const dimensionalErrors = promptAudit.dimensionErrors + schemeAudit.dimensionErrors + answerAudit.dimensionErrors + schemeAnswerDimensionalErrors;
  const dimensionalUnresolved = Math.max(0, dimensionalClaimsDetected - dimensionalChecks - dimensionalErrors);
  const status = arithmeticErrors || schemeAnswerErrors || dimensionalErrors || physicsRuleErrors ? "fail" : unresolved ? "unresolved" : arithmeticChecks || schemeAnswerChecks ? "verified" : "partial";
  return {
    status,
    claimsDetected,
    claimsParsed,
    claimsVerified,
    claimsUnresolved,
    claimErrors,
    arithmeticChecks,
    arithmeticVerified,
    arithmeticErrors,
    schemeAnswerChecks,
    schemeAnswerVerified,
    schemeAnswerErrors,
    dimensionalChecks,
    dimensionalVerified,
    dimensionalErrors,
    physicsRuleChecks,
    physicsRuleDetected,
    physicsRuleVerified,
    physicsRuleErrors,
    physicsRuleUnresolved,
    unresolved,
    dimensionalCoverage: {
      claimsDetected: dimensionalClaimsDetected,
      checks: dimensionalChecks,
      verified: dimensionalVerified,
      unresolved: dimensionalUnresolved,
      errors: dimensionalErrors,
      coveragePercent: dimensionalClaimsDetected ? (dimensionalChecks / dimensionalClaimsDetected) * 100 : null,
    },
    schemeAnswerCoverage: {
      candidateClaims: Math.max(schemeValues.length, answerValues.length),
      comparisons: schemeAnswerChecks,
      verified: schemeAnswerVerified,
      unresolved: schemeAnswerUnresolved,
      errors: schemeAnswerErrors,
      coveragePercent: Math.max(schemeValues.length, answerValues.length) ? (schemeAnswerChecks / Math.max(schemeValues.length, answerValues.length)) * 100 : null,
    },
    claims: allClaims,
    provenance: allProvenance,
    physicsRules,
    issues,
  };
}

export function requestedSignificantFigures(prompt: string): number | null {
  const match = prompt.match(/\b(\d)\s*(?:s\.?f\.?|significant\s+figures?)\b/i);
  return match ? Number(match[1]) : null;
}

export function valueSignificantFigures(text: string): number | null {
  return significantFigures(text);
}

/** Exposed for deterministic audit fixtures and authoring-tool diagnostics. */
export function parsePhysicsNumericExpression(text: string): NumericValue | null {
  return parseNumericSegment(text);
}

export function normalisePhysicsNumericText(text: string): string {
  return normalise(text);
}

/** Authoring diagnostics for inspecting how prose quantities are paired. */
export function extractPhysicsQuantityCandidates(text: string): Array<{ key: string; label: string; raw: string; value: number; unit: string | null }> {
  return quantityCandidates(text).map((candidate) => ({ key: candidate.key, label: candidate.label, raw: candidate.value.raw, value: candidate.value.value, unit: candidate.value.unit?.text ?? null }));
}
