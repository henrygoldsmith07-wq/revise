import type { QuestionKind } from "./types";

export type MathTokenId =
  | "multiply"
  | "divide"
  | "minus"
  | "plus-minus"
  | "equals"
  | "squared"
  | "cubed"
  | "root"
  | "fraction"
  | "pi"
  | "theta"
  | "delta"
  | "less-equal"
  | "greater-equal"
  | "approximately"
  | "scientific";

export interface MathToken {
  id: MathTokenId;
  label: string;
  title: string;
}

export const MATH_TOKENS: MathToken[] = [
  { id: "multiply", label: "×", title: "Multiply" },
  { id: "divide", label: "÷", title: "Divide" },
  { id: "minus", label: "−", title: "Minus" },
  { id: "plus-minus", label: "±", title: "Plus or minus" },
  { id: "equals", label: "=", title: "Equals" },
  { id: "squared", label: "x²", title: "Square the previous term" },
  { id: "cubed", label: "x³", title: "Cube the previous term" },
  { id: "root", label: "√", title: "Square root" },
  { id: "fraction", label: "a/b", title: "Fraction template" },
  { id: "pi", label: "π", title: "Pi" },
  { id: "theta", label: "θ", title: "Theta" },
  { id: "delta", label: "Δ", title: "Delta / change in" },
  { id: "less-equal", label: "≤", title: "Less than or equal to" },
  { id: "greater-equal", label: "≥", title: "Greater than or equal to" },
  { id: "approximately", label: "≈", title: "Approximately equal to" },
  { id: "scientific", label: "×10ⁿ", title: "Scientific notation" },
];

export interface MathInsertion {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function clampSelection(value: string, start: number, end: number): [number, number] {
  const a = Math.max(0, Math.min(value.length, Number.isFinite(start) ? start : value.length));
  const b = Math.max(0, Math.min(value.length, Number.isFinite(end) ? end : a));
  return a <= b ? [a, b] : [b, a];
}

/**
 * Insert an exam-maths token at the current textarea selection.
 *
 * Templates preserve selected working when useful:
 * - selecting x + 1 then pressing square -> (x + 1)^2
 * - selecting 9 then pressing root -> √(9)
 * - selecting x then pressing fraction -> (x)/() with the caret in the denominator
 *
 * The returned selection is deterministic so the React layer only has to
 * update the value and restore the caret.
 */
export function insertMathToken(
  value: string,
  tokenId: MathTokenId,
  start: number,
  end: number,
): MathInsertion {
  const [from, to] = clampSelection(value, start, end);
  const selected = value.slice(from, to);

  let inserted = "";
  let caretOffset = 0;

  switch (tokenId) {
    case "multiply":
      inserted = " × ";
      caretOffset = inserted.length;
      break;
    case "divide":
      inserted = " ÷ ";
      caretOffset = inserted.length;
      break;
    case "minus":
      inserted = " − ";
      caretOffset = inserted.length;
      break;
    case "plus-minus":
      inserted = " ± ";
      caretOffset = inserted.length;
      break;
    case "equals":
      inserted = " = ";
      caretOffset = inserted.length;
      break;
    case "squared":
      inserted = selected ? `(${selected})^2` : "^2";
      caretOffset = inserted.length;
      break;
    case "cubed":
      inserted = selected ? `(${selected})^3` : "^3";
      caretOffset = inserted.length;
      break;
    case "root":
      inserted = selected ? `√(${selected})` : "√()";
      caretOffset = selected ? inserted.length : 2;
      break;
    case "fraction":
      inserted = selected ? `(${selected})/()` : "()/()";
      caretOffset = selected ? inserted.length - 1 : 1;
      break;
    case "pi":
      inserted = "π";
      caretOffset = 1;
      break;
    case "theta":
      inserted = "θ";
      caretOffset = 1;
      break;
    case "delta":
      inserted = "Δ";
      caretOffset = 1;
      break;
    case "less-equal":
      inserted = " ≤ ";
      caretOffset = inserted.length;
      break;
    case "greater-equal":
      inserted = " ≥ ";
      caretOffset = inserted.length;
      break;
    case "approximately":
      inserted = " ≈ ";
      caretOffset = inserted.length;
      break;
    case "scientific":
      inserted = " × 10^";
      caretOffset = inserted.length;
      break;
  }

  const next = value.slice(0, from) + inserted + value.slice(to);
  const caret = from + caretOffset;
  return { value: next, selectionStart: caret, selectionEnd: caret };
}

const MATH_PROMPT_PATTERN =
  /(?:\bcalculate\b|\bwork out\b|\bsolve\b|\bsimplif\w*\b|\bexpand\b|\bfactoris\w*\b|\bequation\b|\bformula\b|\bgradient\b|\bdifferentiat\w*\b|\bintegrat\w*\b|\bstandard form\b|\bprobability\b|\bratio\b|\bangle\b|\bderive\b|\bshow that\b|[=×÷√^])/i;

/** Keep the toolbar contextual rather than adding noise to every prose answer. */
export function shouldOfferMathInput(input: {
  questionKind: QuestionKind;
  subjectName?: string | null;
  stem?: string;
  prompt?: string;
}): boolean {
  if (input.questionKind === "calculation") return true;
  if (/\bmath(?:s|ematics)?\b/i.test(input.subjectName ?? "")) return true;
  return MATH_PROMPT_PATTERN.test(`${input.stem ?? ""} ${input.prompt ?? ""}`);
}
