// ---------------------------------------------------------------------------
// Step-level error diagnosis — taxonomy for mathematical working.
//
// Builds on working-analysis.ts: once firstIncorrectStep() has located WHERE
// the working diverges, this module classifies WHY:
//
//   rounding-error          value agrees after re-rounding
//   unit-error              same magnitude, wrong or missing unit
//   arithmetic-slip         digits largely match, small numeric drift
//   incorrect-rearrangement equation flipped or solved on the wrong side
//   substitution-error      values placed correctly, evaluation wrong
//   method-error            nothing lines up - different approach entirely
//
// diagnoseWorking() runs the classifier across every step and returns the
// full per-step verdict list plus an overall summary ("correct method +
// arithmetic slip" versus "wrong method"). Pure and deterministic.
// ---------------------------------------------------------------------------

export type StepErrorKind =
  | "none"
  | "rounding-error"
  | "unit-error"
  | "arithmetic-slip"
  | "incorrect-rearrangement"
  | "substitution-error"
  | "method-error";

export interface StepDiagnosis {
  index: number;
  text: string;
  matchedModelStep: string | null;
  kind: StepErrorKind;
  similarity: number;
  note: string;
}

export interface WorkingDiagnosis {
  steps: StepDiagnosis[];
  firstErrorIndex: number | null;
  kind: StepErrorKind;
  summary: string;
}

export function splitStudentSteps(answer: string): string[] {
  return answer
    .split(/\r?\n|(?<=[.;])\s+(?=[A-Z0-9(])/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function numbers(text: string): number[] {
  const out: number[] = [];
  const re = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[0]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function sameNumbers(a: string, b: string): boolean {
  const na = numbers(a);
  const nb = numbers(b);
  return na.length > 0 && na.length === nb.length && na.every((v, i) => v === nb[i]);
}

function digitDrift(a: string, b: string): boolean {
  const da = numbers(a).join("");
  const db = numbers(b).join("");
  if (!da || !db || da === db) return false;
  let edits = 0;
  const shorter = da.length <= db.length ? da : db;
  const longer = shorter === da ? db : da;
  let i = 0;
  let j = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) { i++; j++; }
    else { edits++; j++; if (edits > 2) return false; }
  }
  edits += longer.length - j;
  return edits <= 2 && Math.abs(da.length - db.length) <= 2;
}

const UNIT_RE =
  /\d\s*(?:[GMkcmnmµ]?(?:J|N|K|W|V|A)|kPa|kN|kJ|MJ|kg|km|cm|mm|nm|ms|mL|dm3|cm3|m3|mol(?:\/(?:dm3|L))?)(?:\^-?\d+)?\b\.?/;

function unitOf(text: string): string | null {
  return text.match(UNIT_RE)?.[0]?.replace(/\s+/g, "") ?? null;
}

function unitMismatchOnly(student: string, expected: string): boolean {
  const su = unitOf(student);
  const eu = unitOf(expected);
  if (!su && !eu) return false;
  return (su ?? "") !== (eu ?? "");
}

function looksLikeRearrangementFlip(student: string, expected: string): boolean {
  const eqS = student.split("=");
  const eqE = expected.split("=");
  if (eqS.length !== 2 || eqE.length !== 2) return false;
  const norm = (t: string): string => t.replace(/\s+/g, "").toLowerCase();
  return (
    (norm(eqS[0]) === norm(eqE[1].replace(/[+\-]/g, "")) ||
      norm(eqS[1]) === norm(eqE[0].replace(/[+\-]/g, ""))) &&
    norm(eqS[1]) !== norm(eqE[1])
  );
}

/** Exported for tests. */
export function isRoundingOf(student: number, expected: number): boolean {
  if (!Number.isFinite(student) || !Number.isFinite(expected)) return false;
  if (student === expected) return true;
  if (expected === 0) return Math.abs(student) < 0.005;
  const rel = Math.abs(student - expected) / Math.abs(expected);
  if (rel > 0.05) return false;
  for (let dp = 0; dp <= 4; dp++) {
    const f = 10 ** dp;
    if (Math.round(expected * f) === Math.round(student * f)) return true;
  }
  return false;
}

interface DiagnoseResult {
  kind: StepErrorKind;
  note: string;
  similarity: number;
}

export function diagnoseStep(
  studentStep: string,
  expectedStep: string,
  similarity = 0,
): DiagnoseResult {
  const trimmed = studentStep.trim();
  if (!trimmed)
    return { kind: "method-error", note: "No working shown.", similarity };

  const sn = numbers(trimmed);
  const en = numbers(expectedStep);

  // 1. Rounding: same value at coarser precision.
  if (sn.length && en.length && sn.length === en.length) {
    const paired = sn.every((v, i) => i >= en.length || isRoundingOf(v, en[i]));
    if (paired && !sameNumbers(trimmed, expectedStep))
      return { kind: "rounding-error", note: "Right value, rounded differently.", similarity };
  }

  // 2. Units: same digits, wrong or missing unit prefix/family.
  if (unitMismatchOnly(trimmed, expectedStep))
    return { kind: "unit-error", note: "The unit does not match the scheme.", similarity };

  // 3. Rearrangement flip: equation solved back-to-front.
  if (looksLikeRearrangementFlip(trimmed, expectedStep))
    return { kind: "incorrect-rearrangement", note: "Equation rearranged the wrong way round.", similarity };

  // 4. Substitution slip: given values present but arithmetic diverges.
  if (en.length >= 2 && sn.length >= 2) {
    const present = en.filter((v) => sn.includes(v)).length;
    if (present >= en.length - 1 && !sameNumbers(trimmed, expectedStep))
      return { kind: "arithmetic-slip", note: "Correct substitution, slipped in the calculation.", similarity };
  }

  // 5. Digit drift fallback: near-same digits with a different result.
  if (digitDrift(trimmed, expectedStep) && similarity < 0.6)
    return { kind: "arithmetic-slip", note: "Small calculation slip detected.", similarity };

  // 6. Everything else: a genuinely different route.
  return { kind: "method-error", note: "Different method from the mark scheme.", similarity };
}

export interface DiagnoseWorkingInput {
  modelSteps: string[];
  answer: string;
  similarityFn: (studentStep: string, modelStep: string) => number;
}

/**
 * Full working diagnosis: greedy sequential alignment of student steps against
 * model steps, classify any divergence, and summarise the overall error shape.
 */
export function diagnoseWorking(input: DiagnoseWorkingInput): WorkingDiagnosis {
  const { modelSteps, answer, similarityFn } = input;
  const studentSteps = splitStudentSteps(answer);

  const steps: StepDiagnosis[] = [];
  let cursor = 0;
  let firstErrorIndex: number | null = null;
  let firstKind: StepErrorKind = "none";

  for (let i = 0; i < studentSteps.length; i++) {
    const stepText = studentSteps[i];
    let bestIdx = -1;
    let bestSim = 0;
    const searchTo = Math.min(modelSteps.length, cursor + 2);
    for (let m = cursor; m < searchTo; m++) {
      const sim = similarityFn(stepText, modelSteps[m]!);
      if (sim > bestSim) { bestSim = sim; bestIdx = m; }
    }

    if (bestIdx >= 0 && bestSim >= 0.45) {
      cursor = Math.max(cursor, bestIdx + 1);
      steps.push({ index: i, text: stepText, matchedModelStep: modelSteps[bestIdx]!, kind: "none", similarity: bestSim, note: "" });
      continue;
    }

    const d = diagnoseStep(stepText, modelSteps[cursor] ?? "", bestSim);
    steps.push({
      index: i,
      text: stepText,
      matchedModelStep: modelSteps[cursor] ?? null,
      ...d,
    });
    if (firstErrorIndex == null) { firstErrorIndex = i; firstKind = d.kind; }
  }

  return { steps, firstErrorIndex, kind: firstKind, summary: summarise(firstKind, firstErrorIndex, modelSteps.length) };
}

function summarise(kind: StepErrorKind, errIdx: number | null, modelCount: number): string {
  if (errIdx == null) return "All steps follow the mark scheme.";
  switch (kind) {
    case "rounding-error": return "Correct method with a rounding difference.";
    case "unit-error": return "Correct method; the unit went wrong.";
    case "arithmetic-slip": return "Correct method with an arithmetic slip.";
    case "incorrect-rearrangement": return "Rearranged the wrong way round.";
    default: return `First divergence at step ${errIdx + 1} of ${modelCount}.`;
  }
}
