import { parseExpression } from "./maths-equivalence";
import type { CalculationMarkRule, MarkedPart, QuestionPart } from "./types";

function normalise(text: string): string {
  return expandSuperscripts(text).replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/")
    .replace(/⁻/g, "-").replace(/²/g, "2").replace(/³/g, "3").toLowerCase();
}
const SUPERSCRIPT_DIGITS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "ˣ": "x" };
function expandSuperscripts(text: string): string {
  // A superscript run after a base (`10³`, `m²`, `(a+b)⁻¹`) is a power, so a
  // caret is inserted; a bare superscript digit elsewhere just becomes a digit.
  const withCaret = text.replace(/([0-9a-zA-Z)\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, "$1^$2");
  return withCaret.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻ˣ]/g, (ch) => SUPERSCRIPT_DIGITS[ch] ?? ch);
}
function numberOf(expression: string): number | null {
  const poly = parseExpression(expandSuperscripts(expression));
  if (!poly || [...poly.keys()].some((key) => key !== 0)) return null;
  const value = poly.get(0);
  const number = value ? value.n / value.d : 0;
  return Number.isFinite(number) ? number : null;
}
// An absolute 1e-12 floor incorrectly awarded zero for photon-scale energies.
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(Number.MIN_VALUE, Math.abs(b) * 0.005);
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SCALAR = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
// A standard-form power (`10^3`, `10³`) is part of the number, not a unit.
// The polynomial evaluator handles constant exponents, so accept them in the
// final-answer grammar; students write `1.04 × 10³` far more often than `1040`
// in A-level physics working.
const POWER = "(?:\\s*\\^\\s*[+-]?\\d+)?";
const NUMERIC_EXPRESSION = new RegExp(`^(${SCALAR}${POWER}(?:\\s*[+*/-]\\s*${SCALAR}${POWER})*)\\s*(.*)$`);

/**
 * Split submitted working into steps. Students chain a derivation with newlines,
 * semicolons, arrows (`→`, `=>`) or the words "so"/"then"; a single line such as
 * `F = ma → F = 2 × 3 = 6` is really three steps and must be read as such, or a
 * correct long derivation is thrown to review for a formatting reason.
 */
function splitWorkingLines(text: string): string[] {
  return expandSuperscripts(text)
    .replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/")
    .split(/\n|;|=>|→|⟶|\b(?:then|so)\b/i)
    .map((line) => line.trim())
    .filter(Boolean);
}

interface Line { text: string; expression: string; raw: string; value: number; unit: string }
function readLine(rule: CalculationMarkRule, answer: string): Line | undefined {
  const aliases = [rule.label, ...(rule.aliases ?? [])].map((s) => escaped(normalise(s)));
  const lines = splitWorkingLines(answer);
  const matching = lines.filter((line) => new RegExp(`^(?:${aliases.join("|")})\\s*=`, "i").test(line));
  if (!matching.length) return undefined;
  // A label may legitimately be restated with the same value (a check, or a
  // unit added on a second line). Only genuinely conflicting restatements are
  // ambiguous; those are escalated by `conflictingWorkingLabel`, so here we
  // accept the first line whose final value parses and is consistent.
  const parsedLines = matching
    .map((text) => parseLine(text))
    .filter((line): line is Line => line !== undefined);
  if (!parsedLines.length) return undefined;
  const first = parsedLines[0]!;
  if (parsedLines.some((line) => !close(line.value, first.value))) return undefined;
  return first;
}

/** Parse one `label = expr = value unit` step; undefined when the value is unreadable. */
function parseLine(text: string): Line | undefined {
  const segments = text.split("=").slice(1).map((s) => s.trim());
  // Accept a small, explicit arithmetic grammar on the final line as well as
  // a bare number. Students commonly leave an equivalent fraction such as
  // `6/1` or a simple rearrangement in their answer; reducing it here lets
  // the numeric, unit and precision checks judge the working rather than the
  // notation. Unrecognised algebra still falls through to review.
  const final = segments.at(-1)?.match(NUMERIC_EXPRESSION);
  if (!final) return undefined;
  const raw = final[1]!.trim();
  const parsed = numberOf(raw) ?? Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return { text, expression: segments.length >= 2 ? normalise(segments[0]!) : "", raw, value: parsed, unit: final[2]!.trim() };
}

function unitKey(unit: string): string {
  // SI symbol case matters: m is metre, M is the mega prefix; Pa is not pA.
  // Trailing sentence punctuation from prose working must not break the match.
  return unit.replace(/⁻/g, "-").replace(/²/g, "2").replace(/³/g, "3")
    .replace(/[\s^]/g, "").replace(/[.,;:!]+$/, "");
}

/** Locate explicit contradictions without guessing at unrecognised algebra. */
export function contradictoryWorkingStep(answer: string): number | null {
  const seen = new Map<string, number>();
  const lines = splitWorkingLines(answer);
  for (const [index, line] of lines.entries()) {
    const [rawLabel, ...segments] = line.split("=").map((segment) => segment.trim());
    if (!rawLabel || !segments.length) continue;
    const label = rawLabel.toLowerCase();
    const final = segments.at(-1)?.match(NUMERIC_EXPRESSION);
    if (!final) continue;
    const value = numberOf(final[1]!) ?? Number(final[1]);
    if (!Number.isFinite(value)) continue;
    const prior = seen.get(label);
    if (prior !== undefined && !close(prior, value)) return index;
    seen.set(label, value);
    // An explicitly evaluated expression that disagrees with its result.
    for (const expression of segments.slice(0, -1)) {
      const computed = numberOf(expression);
      if (computed !== null && !close(computed, value)) return index;
    }
  }
  return null;
}

/**
 * Detect an explicitly contradictory line pair anywhere in the answer, even
 * when the conflicting labels are only two tokens long or the conflict spans
 * lines an author did not anticipate. Escalation prefers this signal to any
 * confident mark: the working cannot be interpreted reliably when it states
 * two different values for the same labelled quantity.
 */
export function hasContradictoryWorking(answer: string): boolean {
  return contradictoryWorkingStep(answer) !== null;
}

/**
 * Detect two *separate lines* assigning different values to the same label.
 * This is a contradiction in the student's working: no confident mark may be
 * awarded from it (cherry-picking risk), so callers escalate instead. An
 * expression that disagrees with its own result on one line is an arithmetic
 * slip, not a contradiction — the follow-through rule credits the method
 * while the accuracy mark stays lost, exactly as an examiner would.
 */
export function conflictingWorkingLabel(answer: string): string | null {
  const seen = new Map<string, number>();
  const lines = splitWorkingLines(answer);
  for (const line of lines) {
    const [rawLabel, ...segments] = line.split("=").map((segment) => segment.trim());
    if (!rawLabel || !segments.length) continue;
    const label = rawLabel.toLowerCase();
    const final = segments.at(-1)?.match(NUMERIC_EXPRESSION);
    if (!final) continue;
    const value = numberOf(final[1]!) ?? Number(final[1]);
    if (!Number.isFinite(value)) continue;
    const prior = seen.get(label);
    if (prior !== undefined && !close(prior, value)) return label;
    seen.set(label, value);
  }
  return null;
}

/** Evaluate complete arithmetic terms, never digit substrings or numbers
 * mentioned elsewhere in the answer. Unrecognised factorisations stay provisional.
 */
function expressionReferencesOperand(expression: string, operandValue: number): boolean {
  const stripped = expression.replace(/\s+/g, "");
  const terms = stripped.split(/(?<![eE])(?=[+-])/).filter(Boolean);
  return [stripped, ...terms].slice(0, 12).some((fragment) => {
    const value = numberOf(fragment);
    return value !== null && close(value, operandValue);
  });
}

/** Recognise numeric rearrangements only when the method's operand values
 * are demonstrated in the submitted expression itself.
 */
function equivalentMethodShown(
  expression: string,
  method: { operator: "+" | "-" | "*" | "/"; operands: [number | string, number | string] },
  operandValues: readonly number[],
): boolean {
  const [left, right] = operandValues;
  if (left === undefined || right === undefined) return false;
  const authored = applyOperator(method.operator, left, right);
  const value = numberOf(expression);
  return authored !== null && value !== null && close(value, authored) &&
    operandValues.every((operand) => expressionReferencesOperand(expression, operand));
}

function applyOperator(operator: "+" | "-" | "*" | "/", left: number, right: number): number | null {
  switch (operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return right === 0 ? null : left / right;
    default: return null;
  }
}

/** Conservative supported grammar. Unrecognised working is queued for review, not a confident zero. */
export function markCalculationWorking(part: QuestionPart, answer: string): MarkedPart | undefined {
  const rules = part.calculationRules;
  if (!rules || rules.length !== part.marks || rules.length !== part.markScheme.length) return undefined;
  const lines = new Map(rules.map((rule) => [rule.label, readLine(rule, answer)]));
  // A same-label conflict across lines is a contradiction: no rule may award a
  // confident mark from it (readLine already refuses those lines; the flag
  // here also marks any other rule's line unrecognised, because the student's
  // working as a whole cannot be interpreted reliably). An expression that
  // merely disagrees with its own result is an arithmetic slip: the
  // follow-through rule credits the method while the accuracy mark stays lost.
  const contradiction = conflictingWorkingLabel(answer) !== null ? 1 : null;
  const results = rules.map((rule, index) => {
    const line = lines.get(rule.label);
    let awarded = false;
    let reason = "Working is not recognised; this point needs a marker review.";
    const operand = (value: number | string): number | undefined => typeof value === "number" ? value : lines.get(value)?.value;
    const method = rule.method;
    let followsMethod = false;
    let computed: number | null = null;
    let methodRecognised = false;
    if (line?.expression && method) {
      const left = operand(method.operands[0]);
      const right = operand(method.operands[1]);
      let expression = line.expression;
      for (const [label, earlier] of lines) {
        if (earlier && label !== rule.label) expression = expression.replace(new RegExp(`\\b${escaped(normalise(label))}\\b`, "g"), String(earlier.value));
      }
      computed = numberOf(expression);
      const scalar = "([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)";
      const binary = expression.replace(/[()]/g, "").match(new RegExp(`^\\s*${scalar}\\s*([+*/-])\\s*${scalar}\\s*$`));
      methodRecognised = Boolean(binary && left !== undefined && right !== undefined);
      if (binary && left !== undefined && right !== undefined) {
        const a = Number(binary[1]); const b = Number(binary[3]);
        const ordered = close(a, left) && close(b, right);
        const reversed = ["+", "*"].includes(method.operator) && close(a, right) && close(b, left);
        followsMethod = binary[2] === method.operator && (ordered || reversed);
      }
      // Equivalent algebra: a rearranged but correct method line the direct
      // binary match missed. Containment (in equivalentMethodShown) keeps a
      // coincidental numeric match from earning the mark.
      if (!followsMethod && left !== undefined && right !== undefined) {
        followsMethod = equivalentMethodShown(expression, method, [left, right]);
        if (followsMethod) methodRecognised = true;
      }
    }
    // A contradiction anywhere in the answer makes the rule's own reading
    // provisional; never award a confident mark from cherry-picked lines.
    if (contradiction !== null && line) {
      methodRecognised = false;
      awarded = false;
      reason = "The working contains two different values for the same quantity; this mark needs a marker review.";
    } else if (line) {
      if (rule.kind === "method") {
        awarded = followsMethod;
        reason = awarded ? "Correct calculation method is shown, independently of the arithmetic result." : "The required calculation method is not demonstrated.";
      } else if (rule.kind === "accuracy") {
        const evaluated = line.expression ? numberOf(line.expression) : null;
        awarded = close(line.value, rule.expected) && (evaluated === null || close(evaluated, line.value));
        reason = awarded ? "The numerical result is correct." : `Check this result; the expected value is ${rule.expected}.`;
      } else if (rule.kind === "follow-through") {
        awarded = followsMethod && computed !== null && close(line.value, computed);
        reason = awarded ? close(line.value, rule.expected) ? "The method and result are correct." : "Method mark earned using your earlier value (error carried forward)." : "The result does not follow from the shown calculation.";
      } else if (rule.kind === "unit") {
        awarded = (rule.unitAliases ?? []).some((unit) => unitKey(unit) === unitKey(line.unit));
        reason = awarded ? "The final unit is correct." : "The final unit is missing or incorrect.";
      } else {
        // Significant figures may be declared as a bare number or in
        // standard form (`1.04 × 10³` carries its three figures in the
        // mantissa; the power of ten carries none).
        const standardForm = expandSuperscripts(line.raw).match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(?:\*?\s*10\s*\^\s*[+-]?\d+)?\s*$/);
        const mantissa = (standardForm?.[1] ?? line.raw).split(/e/i)[0]!.replace(/^[+-]/, "");
        const digits = mantissa.replace(".", "").replace(/^0+/, "");
        // Fractions/arithmetic do not explicitly declare significant figures.
        awarded = standardForm !== null && new RegExp(`^${SCALAR}$`).test(standardForm[1]!) && digits.length === rule.significantFigures;
        reason = awarded ? "The final value uses the requested significant figures." : `Report the final value to ${rule.significantFigures} significant figures.`;
      }
    }
    const recognised = contradiction === null && Boolean(line) && (!["method", "follow-through"].includes(rule.kind) || methodRecognised);
    return { point: part.markScheme[index]!, status: awarded ? "credited" as const : recognised ? "missed" as const : "unreported" as const,
      evidence: line?.text ?? null, evidenceStrength: recognised ? "strong" as const : "none" as const,
      confidence: recognised ? 1 : 0, explanation: recognised ? reason : contradiction !== null && line ? reason : "This working needs a marker review; the method could not be interpreted reliably." };
  });
  const credited = results.filter((r) => r.status === "credited");
  return { partId: part.id, awarded: credited.length, max: part.marks,
    creditedPoints: credited.map((r) => r.point), missedPoints: results.filter((r) => r.status !== "credited").map((r) => r.point),
    evidence: results, comment: results.some((r) => r.status === "unreported") ? "Some working needs review; this mark is provisional." :
      `${credited.length}/${part.marks}. ${results.find((r) => r.status === "missed")?.explanation ?? "Method, result and presentation are complete."}` };
}
