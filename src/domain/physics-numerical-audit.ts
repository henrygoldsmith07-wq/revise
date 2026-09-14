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

export interface PhysicsNumericalAudit {
  status: "verified" | "partial" | "fail" | "unresolved";
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
  unresolved: number;
  issues: PhysicsNumericalIssue[];
}

type NumericValue = { value: number; raw: string; unit: UnitDimension | null; consumed: number; clean: boolean };
type UnitDimension = { dimension: string; scale: number; text: string };

const EPSILON = 1e-8;
// A compact answer is often rounded to two significant figures. Keep the
// tolerance tight enough to catch wrong factors and powers of ten while
// allowing that ordinary reporting precision.
const RELATIVE_TOLERANCE = 0.025;

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
    return character === "(" || character?.toLowerCase() === "p" || character?.toLowerCase() === "s" || isDigit(character);
  }
}

function unitDimension(text: string): UnitDimension | null {
  const cleaned = text
    .replace(/[·×*]/g, " ")
    .replace(/[⁻−]/g, "-")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (raw) => [...raw].map((c) => SUPERSCRIPT[c] ?? c).join(""))
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

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
      const [symbol, power] = component.split(/(?=[+-]?\d+$)/);
      powers.set(symbol!, (powers.get(symbol!) ?? 0) + Number(power ?? "1") * exponent);
    }
    }
  }
  const dimension = [...powers.entries()].filter(([, power]) => Math.abs(power) > EPSILON).sort(([a], [b]) => a.localeCompare(b)).map(([symbol, power]) => `${symbol}${power === 1 ? "" : power}`).join(" ") || "1";
  return { dimension, scale, text: cleaned };
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

function findNumericStart(text: string): number {
  // Include a leading sign in the slice handed to the parser. Searching for
  // the digit alone would turn `-15 - 20` into `15 - 20` and silently reverse
  // a signed momentum calculation.
  const match = text.search(/[+-]?(?:\d|\.\d|sqrt|π|pi|\()/i);
  return match < 0 ? text.length : match;
}

function parseNumericSegment(segment: string): NumericValue | null {
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

function closeEnough(left: NumericValue, right: NumericValue): boolean {
  if (left.unit && right.unit && left.unit.dimension === right.unit.dimension) {
    const a = left.value * left.unit.scale;
    const b = right.value * right.unit.scale;
    return closeNumericValues(a, b, left.raw, right.raw);
  }
  if (left.unit && !right.unit) {
    const a = left.value * left.unit.scale;
    return (left.unit.text === "%" && numericValuesCloseRaw(left.value, right.value)) || closeNumericValues(a, right.value, left.raw, right.raw);
  }
  if (right.unit && !left.unit) {
    const b = right.value * right.unit.scale;
    return (right.unit.text === "%" && numericValuesCloseRaw(left.value, right.value)) || closeNumericValues(left.value, b, left.raw, right.raw);
  }
  if (!left.unit && !right.unit) return closeNumericValues(left.value, right.value, left.raw, right.raw);
  return false;
}

function numericValuesCloseRaw(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-12, Math.abs(left), Math.abs(right)) * RELATIVE_TOLERANCE;
}

function numericValuesClose(left: NumericValue, right: NumericValue): boolean {
  return closeNumericValues(left.value, right.value, left.raw, right.raw);
}

function closeNumericValues(left: number, right: number, leftRaw: string, rightRaw: string): boolean {
  if (Math.abs(left - right) <= Math.max(1e-12, Math.abs(left), Math.abs(right)) * RELATIVE_TOLERANCE) return true;
  // A scheme commonly retains a guard digit while the final answer is
  // rounded (for example 1.56×10⁻⁷ → 1.6×10⁻⁷). Permit that only when the
  // lower-precision value is exactly the requested rounding of the other.
  const leftFigures = significantFigures(leftRaw);
  const rightFigures = significantFigures(rightRaw);
  if (!leftFigures || !rightFigures || leftFigures === rightFigures) return false;
  const precise = leftFigures > rightFigures ? left : right;
  const reported = leftFigures > rightFigures ? right : left;
  const figures = Math.min(leftFigures, rightFigures);
  if (figures < 1 || !Number.isFinite(precise) || !Number.isFinite(reported)) return false;
  const rounded = Number(precise.toPrecision(figures));
  return Math.abs(rounded - reported) <= Math.max(1e-12, Math.abs(rounded), Math.abs(reported)) * 1e-9;
}

function sameDimension(left: NumericValue, right: NumericValue): boolean | null {
  if (!left.unit || !right.unit) return null;
  return left.unit.dimension === right.unit.dimension;
}

function equationSegments(text: string): string[][] {
  return text
    .split(/[\n;]+/)
    .map((line) => line.split(/(?:=|≈|≃|~|=>)/).map((part) => part.trim()).filter(Boolean))
    .filter((parts) => parts.length >= 2);
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

function auditEquations(text: string, source: PhysicsNumericalIssue["source"], issues: PhysicsNumericalIssue[]): { checks: number; verified: number; errors: number; dimensions: number; dimensionVerified: number; dimensionErrors: number } {
  let checks = 0;
  let verified = 0;
  let errors = 0;
  let dimensions = 0;
  let dimensionVerified = 0;
  let dimensionErrors = 0;
  for (const segments of equationSegments(text)) {
    const parsed = segments.map(parseNumericSegment);
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
      if (closeEnough(left, right) || (!left.unit || !right.unit) && numericValuesClose(left, right)) {
        verified++;
      } else {
        errors++;
        addIssue(issues, { kind: "numeric-arithmetic", severity: "error", source, detail: `Recomputed ${segments[index]} as ${left.value} but the next value is ${segments[index + 1]}.` });
      }
      const dimension = sameDimension(left, right);
      if (dimension !== null) {
        dimensions++;
        if (dimension) dimensionVerified++;
        else {
          dimensionErrors++;
          addIssue(issues, { kind: "dimension-mismatch", severity: "error", source, detail: `The chained quantities use incompatible units (${left.unit?.text ?? "unknown"} and ${right.unit?.text ?? "unknown"}).` });
        }
      }
    }
  }
  return { checks, verified, errors, dimensions, dimensionVerified, dimensionErrors };
}

function commonRuleCount(text: string): number {
  const rules = [
    /\bv\s*=\s*f\s*λ/i, /\bF\s*=\s*ma\b/i, /\bp\s*=\s*mv\b/i, /\bP\s*=\s*Fv\b/i, /\bP\s*=\s*VI\b/i,
    /\bR\s*=\s*ρ?L\s*\/?\s*A\b/i, /\bV\s*=\s*IR\b/i, /\bε\s*=\s*I\s*\(R\s*\+\s*r\)/i,
    /\bE\s*=\s*mc\^?2\b/i, /\bN\s*=\s*N[₀0].*2\^?/i, /\bpV\s*=\s*nRT\b/i, /\bE\s*=\s*hf\b/i,
    /\bλ\s*=\s*h\/?\s*p\b/i, /\bE\s*=\s*½?\s*C\s*V\^?2/i, /\bgradient\b/i, /\barea\b/i,
  ];
  return rules.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function labelledQuantities(text: string): Map<string, NumericValue> {
  const result = new Map<string, NumericValue>();
  for (const rawClause of text.split(/[\n;]+/)) {
    const clause = rawClause.trim();
    const match = clause.match(/^(?:the\s+)?([A-Za-zλερΔ][A-Za-z0-9_]{0,11})\s*=\s*([^=]+?)[.!?]?$/i);
    if (!match) continue;
    const value = parseNumericSegment(match[2]!);
    if (!value || !value.clean || /\b(?:so|then|which|because|or|and)\b/i.test(match[2]!)) continue;
    result.set(match[1]!.toLowerCase(), value);
  }
  return result;
}

function significantFigures(raw: string): number | null {
  const match = raw.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
  if (!match) return null;
  const mantissa = match[0]!.replace(/^[+-]/, "").replace(/[eE].*$/, "");
  const digits = mantissa.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? digits.length : null;
}

/** Audit one part; it never treats unparsed prose as a Physics error. */
export function auditPhysicsPartNumerics(part: QuestionPart): PhysicsNumericalAudit {
  const issues: PhysicsNumericalIssue[] = [];
  const promptText = part.prompt;
  const schemeText = (part.markScheme ?? []).join("\n");
  const answerText = part.modelAnswer;
  const promptAudit = auditEquations(promptText, "prompt", issues);
  const schemeAudit = auditEquations(schemeText, "scheme", issues);
  const answerAudit = auditEquations(answerText, "answer", issues);
  let schemeAnswerChecks = 0;
  let schemeAnswerVerified = 0;
  let schemeAnswerErrors = 0;
  let schemeAnswerDimensionalChecks = 0;
  let schemeAnswerDimensionalVerified = 0;
  let schemeAnswerDimensionalErrors = 0;
  const schemeValues = labelledQuantities(schemeText);
  const answerValues = labelledQuantities(answerText);
  for (const [key, schemeValue] of schemeValues) {
    const answerValue = answerValues.get(key);
    if (!answerValue) continue;
    schemeAnswerChecks++;
    const dimension = sameDimension(schemeValue, answerValue);
    if (dimension !== null) {
      schemeAnswerDimensionalChecks++;
      if (dimension) schemeAnswerDimensionalVerified++;
      else schemeAnswerDimensionalErrors++;
    }
    if (dimension === false) {
      schemeAnswerErrors++;
      addIssue(issues, { kind: "dimension-mismatch", severity: "error", source: "scheme-answer", detail: `${key} uses ${schemeValue.unit?.text ?? "an unrecognised unit"} in the scheme and ${answerValue.unit?.text ?? "an unrecognised unit"} in the worked answer.` });
      continue;
    }
    if (closeEnough(schemeValue, answerValue)) {
      schemeAnswerVerified++;
    } else {
      schemeAnswerErrors++;
      addIssue(issues, { kind: "scheme-answer-mismatch", severity: "error", source: "scheme-answer", detail: `${key} is ${schemeValue.raw} in the scheme but ${answerValue.raw} in the worked answer.` });
    }
  }
  const allText = `${promptText}\n${schemeText}\n${answerText}`;
  const unresolved = hasNumber(allText) && promptAudit.checks + schemeAudit.checks + answerAudit.checks + schemeAnswerChecks === 0 ? 1 : 0;
  if (unresolved) addIssue(issues, { kind: "unresolved-numerical", severity: "warning", source: "answer", detail: "Numbers are present but no unambiguous equation was parsed; require manual numerical review." });
  const arithmeticChecks = promptAudit.checks + schemeAudit.checks + answerAudit.checks;
  const arithmeticVerified = promptAudit.verified + schemeAudit.verified + answerAudit.verified;
  const arithmeticErrors = promptAudit.errors + schemeAudit.errors + answerAudit.errors;
  const dimensionalChecks = promptAudit.dimensions + schemeAudit.dimensions + answerAudit.dimensions + schemeAnswerDimensionalChecks;
  const dimensionalVerified = promptAudit.dimensionVerified + schemeAudit.dimensionVerified + answerAudit.dimensionVerified + schemeAnswerDimensionalVerified;
  const dimensionalErrors = promptAudit.dimensionErrors + schemeAudit.dimensionErrors + answerAudit.dimensionErrors + schemeAnswerDimensionalErrors;
  const physicsRuleChecks = commonRuleCount(allText);
  const status = arithmeticErrors || schemeAnswerErrors || dimensionalErrors ? "fail" : unresolved ? "unresolved" : arithmeticChecks || schemeAnswerChecks ? "verified" : "partial";
  return {
    status,
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
    unresolved,
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
