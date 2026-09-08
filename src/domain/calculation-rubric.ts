import { parseExpression } from "./maths-equivalence";
import type { CalculationMarkRule, MarkedPart, QuestionPart } from "./types";

function normalise(text: string): string {
  return text.replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/")
    .replace(/⁻/g, "-").replace(/²/g, "2").replace(/³/g, "3").toLowerCase();
}
function numberOf(expression: string): number | null {
  const poly = parseExpression(expression);
  if (!poly || [...poly.keys()].some((key) => key !== 0)) return null;
  const value = poly.get(0);
  const number = value ? value.n / value.d : 0;
  return Number.isFinite(number) ? number : null;
}
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 0.005);
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Line { text: string; expression: string; raw: string; value: number; unit: string }
function readLine(rule: CalculationMarkRule, answer: string): Line | undefined {
  const aliases = [rule.label, ...(rule.aliases ?? [])].map((s) => escaped(normalise(s)));
  const lines = normalise(answer).split(/[\n;]/).map((s) => s.trim());
  const matching = lines.filter((line) => new RegExp(`^(?:${aliases.join("|")})\\s*=`).test(line));
  // Multiple conflicting versions need review; never cherry-pick the correct one.
  if (matching.length !== 1) return undefined;
  const text = matching[0]!;
  const segments = text.split("=").slice(1).map((s) => s.trim());
  const final = segments.at(-1)?.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([^=]*)$/);
  if (!final || !Number.isFinite(Number(final[1]))) return undefined;
  return { text, expression: segments.length >= 2 ? segments[0]! : "", raw: final[1]!, value: Number(final[1]), unit: final[2]!.trim() };
}

/** Conservative supported grammar. Unrecognised working is queued for review, not a confident zero. */
export function markCalculationWorking(part: QuestionPart, answer: string): MarkedPart | undefined {
  const rules = part.calculationRules;
  if (!rules || rules.length !== part.marks || rules.length !== part.markScheme.length) return undefined;
  const lines = new Map(rules.map((rule) => [rule.label, readLine(rule, answer)]));
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
    }
    if (line) {
      if (rule.kind === "method") {
        awarded = followsMethod;
        reason = awarded ? "Correct calculation method is shown, independently of the arithmetic result." : "The required calculation method is not demonstrated.";
      } else if (rule.kind === "accuracy") {
        awarded = close(line.value, rule.expected);
        reason = awarded ? "The numerical result is correct." : `Check this result; the expected value is ${rule.expected}.`;
      } else if (rule.kind === "follow-through") {
        awarded = followsMethod && computed !== null && close(line.value, computed);
        reason = awarded ? close(line.value, rule.expected) ? "The method and result are correct." : "Method mark earned using your earlier value (error carried forward)." : "The result does not follow from the shown calculation.";
      } else if (rule.kind === "unit") {
        awarded = (rule.unitAliases ?? []).some((unit) => normalise(unit).replace(/[\s^]/g, "") === line.unit.replace(/[\s^]/g, ""));
        reason = awarded ? "The final unit is correct." : "The final unit is missing or incorrect.";
      } else {
        const mantissa = line.raw.split(/e/i)[0]!.replace(/^[+-]/, "");
        const digits = mantissa.replace(".", "").replace(/^0+/, "");
        awarded = digits.length === rule.significantFigures;
        reason = awarded ? "The final value uses the requested significant figures." : `Report the final value to ${rule.significantFigures} significant figures.`;
      }
    }
    const recognised = Boolean(line) && (!["method", "follow-through"].includes(rule.kind) || methodRecognised);
    return { point: part.markScheme[index]!, status: awarded ? "credited" as const : recognised ? "missed" as const : "unreported" as const,
      evidence: line?.text ?? null, evidenceStrength: recognised ? "strong" as const : "none" as const,
      confidence: recognised ? 1 : 0, explanation: recognised ? reason : "This working needs a marker review; the method could not be interpreted reliably." };
  });
  const credited = results.filter((r) => r.status === "credited");
  return { partId: part.id, awarded: credited.length, max: part.marks,
    creditedPoints: credited.map((r) => r.point), missedPoints: results.filter((r) => r.status !== "credited").map((r) => r.point),
    evidence: results, comment: results.some((r) => r.status === "unreported") ? "Some working needs review; this mark is provisional." :
      `${credited.length}/${part.marks}. ${results.find((r) => r.status === "missed")?.explanation ?? "Method, result and presentation are complete."}` };
}
