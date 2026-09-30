
import { mathsEquivalent } from "./maths-equivalence";

import type { Question, QuestionPart } from "./types";
import type { SubjectAssessmentIssue } from "./subject-assessment-audit";

import { partText, addIssue, isGeneratedDepthDraft } from "./subject-substantive";
function variableNames(expression: string): string[] {
  return [...new Set((expression.match(/[a-z]/gi) ?? []).map((name) => name.toLowerCase()))].sort();
}

function looksLikeIdentity(left: string, right: string): boolean {
  const leftVars = variableNames(left);
  const rightVars = variableNames(right);
  if (!leftVars.length || leftVars.join(",") !== rightVars.join(",")) return false;
  // Assignments such as y = 2x + 1 are definitions, not identities.  An
  // identity has a non-trivial expression on both sides with the same symbols.
  const nonTrivial = (value: string): boolean => /[+*/^()]/.test(value) || /\d/.test(value);
  return nonTrivial(left) && nonTrivial(right) && !/^\s*[a-z]\s*$/i.test(left);
}

/** Equality relations whose two sides are intended to be algebraically equal. */
function equalityCandidates(text: string): Array<[string, string]> {
  const candidates: Array<[string, string]> = [];
  const relation = /(?:^|[\n.;])\s*([^=\n.;]{1,100})=([^=\n.;]{1,100})(?=$|[\n.;])/g;
  for (const match of text.replace(/[−–—]/g, "-").matchAll(relation)) {
    const left = (match[1] ?? "").replace(/^.*:\s*/, "").trim();
    const right = (match[2] ?? "").replace(/[,:].*$/, "").trim();
    if (left && right && looksLikeIdentity(left, right)) candidates.push([left, right]);
  }
  return candidates;
}

function signedCoefficient(raw: string | undefined): number {
  const value = (raw ?? "").replace(/\s+/g, "");
  if (!value || value === "+") return 1;
  if (value === "-") return -1;
  return Number(value);
}

/** Check the common monomial derivative form without guessing unsupported syntax. */
function monomialDerivativeMismatch(text: string): string | null {
  const source = text.match(/\bf\(\s*x\s*\)\s*=\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x\s*(?:\^|²)\s*(\d+)/i);
  const derivative = text.match(/\bf['′]\(\s*x\s*\)\s*=\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x(?:\s*(?:\^|²)\s*(\d+))?/i);
  if (!source || !derivative) return null;
  const coefficient = signedCoefficient(source[1]);
  const exponent = Number(source[2]);
  const expectedCoefficient = coefficient * exponent;
  const actualCoefficient = signedCoefficient(derivative[1]);
  const actualExponent = derivative[2] ? Number(derivative[2]) : 1;
  if (actualCoefficient !== expectedCoefficient || actualExponent !== exponent - 1) {
    return `For f(x) = ${coefficient}x^${exponent}, the derivative should be ${expectedCoefficient}x^${exponent - 1}.`;
  }
  return null;
}

function signedInteger(raw: string | undefined, defaultValue = 0): number {
  const value = (raw ?? "").replace(/\s+/g, "");
  if (!value || value === "+") return defaultValue;
  if (value === "-") return -1;
  return Number(value);
}

/** Recompute a plainly written quadratic only when the task asks for roots. */
function quadraticRootMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:solve|root|roots|zeroes|zeros)\b/i.test(prompt)) return null;
  const match = prompt.match(/\b([+-]?\d*)\s*x\s*(?:\^\s*2|²)\s*([+-]\s*\d*)\s*x\s*([+-]\s*\d+)\s*=\s*0\b/i);
  if (!match) return null;
  const a = signedInteger(match[1], 1);
  const b = signedInteger(match[2]);
  const c = signedInteger(match[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) return null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return /(?:no|not)\s+real\s+root/i.test(answer) ? null : "The quadratic has no real roots because its discriminant is negative.";
  }
  const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]
    .sort((left, right) => left - right);
  const reported = [...answer.matchAll(/\bx\s*=\s*([+-]?\d+(?:\.\d+)?)/gi)]
    .map((item) => Number(item[1]))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (reported.length < roots.length) return null;
  const tolerance = 1e-8;
  const matches = roots.every((root, index) => Math.abs(root - (reported[index] ?? Number.NaN)) <= tolerance);
  if (matches || /(?:not|incorrect|wrong|reject|should be|no real)/i.test(answer)) return null;
  return `The reported roots do not solve ${a}x² ${b >= 0 ? "+" : "−"} ${Math.abs(b)}x ${c >= 0 ? "+" : "−"} ${Math.abs(c)} = 0.`;
}

/** Check a single power-rule integral while leaving substitutions and parts to review. */
function monomialIntegralMismatch(prompt: string, answer: string): string | null {
  if (!/(?:∫|\bintegrat(?:e|ing)?\b)/i.test(prompt)) return null;
  const source = prompt.match(/∫\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x\s*(?:\^\s*|²\s*)(\d+)\s*d?x/i);
  if (!source) return null;
  const coefficient = signedCoefficient(source[1]);
  const exponent = Number(source[2]);
  const expectedCoefficient = coefficient / (exponent + 1);
  const reported = answer.match(/(?:=|equals?)\s*([+-]?\s*\d+(?:\.\d+)?)?\s*x\s*(?:\^\s*|²\s*)(\d+)/i);
  if (!reported) return null;
  const actualCoefficient = signedCoefficient(reported[1]);
  const actualExponent = Number(reported[2]);
  if (Math.abs(actualCoefficient - expectedCoefficient) < 1e-10 && actualExponent === exponent + 1) return null;
  if (/(?:not|incorrect|wrong|should be|reject)/i.test(answer)) return null;
  return `The antiderivative of ${coefficient}x^${exponent} is ${expectedCoefficient}x^${exponent + 1} + C.`;
}

/** Recompute a plainly stated linear root when the answer reports x = value. */
function linearRootMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:solve|root|find|determine)\b/i.test(prompt) || /(?:\^\s*2|²)/.test(prompt)) return null;
  const match = prompt.match(/\b([+-]?\s*\d*)\s*x\s*([+-]\s*\d+(?:\.\d+)?)\s*=\s*([+-]?\s*\d+(?:\.\d+)?)\b/i);
  if (!match) return null;
  const coefficient = signedCoefficient(match[1]);
  const intercept = Number(match[2]!.replace(/\s+/g, ""));
  const rhs = Number(match[3]!.replace(/\s+/g, ""));
  if (!Number.isFinite(coefficient) || coefficient === 0 || !Number.isFinite(intercept) || !Number.isFinite(rhs)) return null;
  const expected = (rhs - intercept) / coefficient;
  const reported = answer.match(/\bx\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || Math.abs(actual - expected) < 1e-9 || /(?:not|incorrect|wrong|reject|should be|no solution)/i.test(answer)) return null;
  return `The reported root x = ${actual} does not solve the stated linear equation; x should be ${expected}.`;
}

/** Detect the common left/right and scale reversals in graph transformations. */
function graphTransformationMismatch(prompt: string, answer: string): string | null {
  const shift = prompt.match(/f\(\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\s*\)/i);
  if (shift) {
    const expected = shift[1] === "+" ? "left" : "right";
    const direction = answer.match(/\bshift(?:s|ed)?\s+(left|right)\b/i)?.[1]?.toLowerCase();
    if (direction && direction !== expected && !/(?:not|incorrect|wrong|correct|should be|rather)/i.test(answer)) {
      return `f(x ${shift[1]} ${shift[2]}) shifts the graph ${expected}, not ${direction}.`;
    }
  }
  const scale = prompt.match(/f\(\s*(\d+(?:\.\d+)?)\s*x\s*\)/i);
  if (scale) {
    const factor = Number(scale[1]);
    const reported = answer.match(/\b(?:horizontal|x[- ]?scale|scale)\b[^.\n]*(?:1\s*\/\s*)?(\d+(?:\.\d+)?)/i);
    if (factor > 1 && reported && /(?:horizontal|x[- ]?scale)/i.test(answer) && !/1\s*\//.test(answer) && !/(?:not|incorrect|wrong|correct|should be)/i.test(answer)) {
      return `f(${factor}x) has horizontal scale factor 1/${factor}; multiplying x-coordinates by ${factor} is the inverse transformation.`;
    }
  }
  return null;
}

/** Recompute a 2-D vector dot product when both vectors are written plainly. */
function vectorDotMismatch(prompt: string, answer: string): string | null {
  if (!/(?:dot|scalar)\s+product|[·⋅]/i.test(prompt)) return null;
  const vectors = [...prompt.matchAll(/\b([abuv])\s*=\s*\(?\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)?/gi)];
  if (vectors.length < 2) return null;
  const first = vectors[0]!;
  const second = vectors[1]!;
  const expected = Number(first[2]) * Number(second[2]) + Number(first[3]) * Number(second[3]);
  if (!Number.isFinite(expected)) return null;
  const reported = answer.match(/(?:dot|scalar)?\s*product[^=]*=\s*([+-]?\d+(?:\.\d+)?)/i) ?? answer.match(/[abuv]\s*[·⋅]\s*[abuv]\s*=\s*([+-]?\d+(?:\.\d+)?)/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || Math.abs(actual - expected) < 1e-9 || /(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The vector dot product should be ${expected}; multiply corresponding components and add.`;
}

/** Detect a wrong independent-event product without trying to infer unknown probabilities. */
function probabilityProductMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:independent|independence)\b/i.test(prompt)) return null;
  if (/P\s*\(\s*A\s*∩\s*B\s*\)\s*=\s*P\s*\(\s*A\s*\)\s*[+−-]\s*P\s*\(\s*B\s*\)/i.test(answer) &&
      !/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) {
    return "For independent events P(A ∩ B) = P(A)P(B), not the sum of the two probabilities.";
  }
  return null;
}

/** Recompute a plainly stated SUVAT velocity or displacement. */
function suvatMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:suvat|v\s*=\s*u\s*\+\s*a\s*t|s\s*=\s*u\s*t)/i.test(prompt)) return null;
  const value = (symbol: string): number | null => {
    const match = prompt.match(new RegExp(`\\b${symbol}\\s*=\\s*([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`, "i"));
    const parsed = match ? Number(match[1]) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  const u = value("u");
  const a = value("a");
  const t = value("t");
  if (u === null || a === null || t === null) return null;
  const velocity = answer.match(/\bv\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (velocity && /(?:v\s*=\s*u\s*\+\s*a\s*t|velocity|final speed)/i.test(prompt)) {
    const expected = u + a * t;
    const actual = Number(velocity[1]);
    if (Number.isFinite(actual) && Math.abs(actual - expected) > 1e-9 && !/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) {
      return `Using v = u + at, the final velocity should be ${expected}, not ${actual}.`;
    }
  }
  const displacement = answer.match(/\bs\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (displacement && /(?:s\s*=\s*u\s*t|displacement|distance)/i.test(prompt)) {
    const expected = u * t + 0.5 * a * t * t;
    const actual = Number(displacement[1]);
    if (Number.isFinite(actual) && Math.abs(actual - expected) > 1e-9 && !/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) {
      return `Using s = ut + ½at², the displacement should be ${expected}, not ${actual}.`;
    }
  }
  return null;
}

/** Recompute a simple arithmetic mean when the data are written inline. */
function arithmeticMeanMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:mean|average)\b/i.test(prompt)) return null;
  const data = prompt.match(/\b(?:data(?:\s+set)?|values?|observations?)\b[^\d-]*((?:-?\d+(?:\.\d+)?\s*[,;]\s*)+-?\d+(?:\.\d+)?)/i);
  if (!data) return null;
  const values = data[1]!.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) return null;
  const reported = answer.match(/\b(?:mean|average)\s*=\s*(-?\d+(?:\.\d+)?)/i);
  if (!reported) return null;
  const expected = values.reduce((sum, value) => sum + value, 0) / values.length;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || Math.abs(actual - expected) < 1e-9 || /(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The arithmetic mean of ${values.join(", ")} is ${expected}, not ${actual}.`;
}

/** Recompute the small log/exponential equations commonly used in a quality row. */
function logExponentialMismatch(prompt: string, answer: string): string | null {
  const reported = answer.match(/\bx\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual)) return null;
  let expected: number | null = null;
  let relation = "the logarithmic equation";
  const ln = prompt.match(/\bln\s*\(\s*x\s*\)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (ln) {
    expected = Math.exp(Number(ln[1]));
    relation = `ln(x) = ${ln[1]}`;
  }
  const log10 = prompt.match(/\blog(?:10)?\s*\(\s*x\s*\)\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!expected && log10 && /log10/i.test(log10[0])) {
    expected = 10 ** Number(log10[1]);
    relation = `log₁₀(x) = ${log10[1]}`;
  }
  const exponential = prompt.match(/\be\s*(?:\^|\u005e)\s*x\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!expected && exponential) {
    const rhs = Number(exponential[1]);
    if (rhs > 0) expected = Math.log(rhs);
    relation = `e^x = ${exponential[1]}`;
  }
  if (expected === null || !Number.isFinite(expected)) return null;
  const tolerance = Math.max(1e-8, Math.abs(expected) * 1e-6);
  if (Math.abs(actual - expected) <= tolerance || /(?:not|incorrect|wrong|reject|should be|no solution)/i.test(answer)) return null;
  return `For ${relation}, x should be approximately ${expected}, not ${actual}.`;
}

/** Check gradient, distance or midpoint from two explicitly supplied points. */
function coordinateGeometryMismatch(prompt: string, answer: string): string | null {
  const points = [...prompt.matchAll(/\b([A-Z])\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)/g)];
  if (points.length < 2) return null;
  const [, , ax, ay] = points[0]!;
  const [, , bx, by] = points[1]!;
  const x1 = Number(ax); const y1 = Number(ay); const x2 = Number(bx); const y2 = Number(by);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  let expected: number | null = null;
  let label = "the coordinate result";
  if (/\bmid-?point\b/i.test(prompt)) {
    // A midpoint has two coordinates; compare both when they are reported.
    const pair = answer.match(/(?:midpoint|mid-point)[^=(]*=\s*\(?\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*\)?/i);
    if (!pair) return null;
    const mx = Number(pair[1]); const my = Number(pair[2]);
    const ex = (x1 + x2) / 2; const ey = (y1 + y2) / 2;
    if (Math.abs(mx - ex) <= 1e-9 && Math.abs(my - ey) <= 1e-9) return null;
    if (/(?:not|incorrect|wrong|reject|should be)/i.test(answer)) return null;
    return `The midpoint should be (${ex}, ${ey}), not (${mx}, ${my}).`;
  }
  // Require the label and its value in the same clause: a gradient word in one
  // sentence and an unrelated "=" (for example AB² = 8) in the next must not
  // be misread as a stated gradient. This was a demonstrated false positive
  // on correct depth content once substantive drafts lost their bypass.
  const numeric = answer.match(/(?:gradient|slope|distance|length)[^=.;\n]{0,40}=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!numeric) return null;
  const actual = Number(numeric[1]);
  if (!Number.isFinite(actual) || /(?:not|incorrect|wrong|reject|should be)/i.test(answer)) return null;
  if (/\b(?:gradient|slope)\b/i.test(prompt)) {
    if (x2 === x1) return null;
    expected = (y2 - y1) / (x2 - x1);
    label = "the gradient";
  } else if (/\b(?:distance|length)\b/i.test(prompt)) {
    expected = Math.hypot(x2 - x1, y2 - y1);
    label = "the distance";
  }
  if (expected === null) return null;
  const tolerance = Math.max(1e-8, Math.abs(expected) * 1e-6);
  return Math.abs(actual - expected) <= tolerance ? null : `${label} should be ${expected}, not ${actual}.`;
}

/** Detect an extraneous root in the common square-root equation form. */
function radicalExtraneousMismatch(prompt: string, answer: string): string | null {
  const equation = prompt.replace(/[−–—]/g, "-").match(/(?:√|sqrt\s*\()\s*\(?\s*x\s*([+-])\s*(\d+(?:\.\d+)?)\s*\)?\s*(?:\)|)\s*=\s*x\s*([+-])\s*(\d+(?:\.\d+)?)/i);
  if (!equation) return null;
  const a = (equation[1] === "+" ? 1 : -1) * Number(equation[2]);
  const b = (equation[3] === "+" ? 1 : -1) * Number(equation[4]);
  const B = -(2 * b + 1);
  const C = b * b - a;
  const discriminant = B * B - 4 * C;
  if (discriminant < 0) return null;
  const roots = [...answer.matchAll(/\bx\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi)].map((match) => Number(match[1]));
  if (!roots.length || roots.some((value) => !Number.isFinite(value))) return null;
  const invalid = roots.find((root) => root - b < -1e-8 || root + a < -1e-8 || Math.abs(Math.sqrt(Math.max(0, root + a)) - (root - b)) > 1e-6);
  if (invalid === undefined || /(?:extraneous|reject|invalid|not a solution|should be)/i.test(answer)) return null;
  return `x = ${invalid} is extraneous: it does not satisfy the original square-root equation after checking its domain.`;
}

export function validateMathsPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  const advisoryChecksEnabled = !(question.source === "generated" && question.verification === "unverified");
  // Scaffold depth rows keep a provisional bypass so deterministic validators
  // do not mistake their placeholder answers for authored mathematics.
  // Generated substantive rows pass the exact same gates as authored content.
  const provisionalDepthDraft = isGeneratedDepthDraft(question) && part.learning?.quality === "scaffold";
  for (const [left, right] of equalityCandidates(text)) {
    const comparison = mathsEquivalent(left, right);
    if (comparison === "not-equivalent") {
      addIssue(issues, question, part, "maths-equivalence", "error", `Algebraic identity is not equivalent: ${left} = ${right}.`);
    }
  }

  const derivativeMismatch = monomialDerivativeMismatch(text);
  if (derivativeMismatch) addIssue(issues, question, part, "maths-calculus", "error", derivativeMismatch);
  const rootsMismatch = quadraticRootMismatch(part.prompt, part.modelAnswer);
  if (rootsMismatch) addIssue(issues, question, part, "maths-equivalence", "error", rootsMismatch);
  const linearMismatch = linearRootMismatch(part.prompt, part.modelAnswer);
  if (linearMismatch) addIssue(issues, question, part, "maths-equivalence", "error", linearMismatch);
  const integralMismatch = monomialIntegralMismatch(part.prompt, part.modelAnswer);
  if (integralMismatch) addIssue(issues, question, part, "maths-calculus", "error", integralMismatch);
  const transformMismatch = graphTransformationMismatch(part.prompt, part.modelAnswer);
  if (transformMismatch) addIssue(issues, question, part, "maths-equivalence", "error", transformMismatch);
  const vectorMismatch = vectorDotMismatch(part.prompt, part.modelAnswer);
  if (vectorMismatch) addIssue(issues, question, part, "maths-equivalence", "error", vectorMismatch);
  const probabilityMismatch = probabilityProductMismatch(part.prompt, part.modelAnswer);
  if (probabilityMismatch) addIssue(issues, question, part, "maths-equivalence", "error", probabilityMismatch);
  const suvatError = suvatMismatch(part.prompt, part.modelAnswer);
  if (suvatError) addIssue(issues, question, part, "maths-mechanics", "error", suvatError);
  const meanError = arithmeticMeanMismatch(part.prompt, part.modelAnswer);
  if (meanError) addIssue(issues, question, part, "maths-statistics", "error", meanError);
  const logError = logExponentialMismatch(part.prompt, part.modelAnswer);
  if (logError) addIssue(issues, question, part, "maths-equivalence", "error", logError);
  if (!provisionalDepthDraft) {
    const coordinateError = coordinateGeometryMismatch(part.prompt, part.modelAnswer);
    if (coordinateError) addIssue(issues, question, part, "maths-equivalence", "error", coordinateError);
  }
  const radicalError = radicalExtraneousMismatch(part.prompt, part.modelAnswer);
  if (radicalError) addIssue(issues, question, part, "maths-domain", "error", radicalError);
  if (/∫\s*1\s*\/\s*x\b/i.test(text) && /(?:=|equals?)\s*1\s*\/\s*x\s*(?:\^|²)?\s*2\b/i.test(text) && !/ln\s*\|?x\|?/i.test(text)) {
    addIssue(issues, question, part, "maths-calculus", "error", "The integral of 1/x must use ln|x| + c, not a power-rule result.");
  }
  if (/(?:sin|cos)\s*[²2]\s*x\s*\+\s*(?:cos|sin)\s*[²2]\s*x/i.test(text) &&
      /(?:=|equals?)\s*2\b/i.test(text) && !/(?:not|incorrect|wrong|reject|should be 1)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-equivalence", "error", "The Pythagorean identity sin²x + cos²x equals 1, not 2.");
  }
  if (/(?:1\s*[-−]\s*cos\s*[²2]\s*x|1\s*[-−]\s*sin\s*[²2]\s*x)/i.test(text) &&
      /(?:=|equals?)\s*2\b/i.test(text) && !/(?:not|incorrect|wrong|reject|should be)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-equivalence", "error", "The complementary squared trigonometric identity must equal the other squared function, not 2.");
  }
  if (/P\s*\(\s*A\s*\|\s*B\s*\)\s*=\s*P\s*\([^)]*∩[^)]*\)\s*\/\s*P\s*\(\s*A\s*\)/i.test(text) &&
      !/(?:not|incorrect|wrong|correct denominator|should be)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-equivalence", "error", "Conditional probability P(A|B) is divided by P(B), not P(A).");
  }
  if (/\bx\s*>\s*0\b/i.test(part.prompt) && /\bx\s*=\s*-\s*\d/i.test(part.modelAnswer) &&
      !/(?:reject|invalid|outside|not allowed|cannot)/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-domain", "error", "The worked answer uses a root outside the stated x > 0 domain.");
  }

  if (advisoryChecksEnabled && /\b(?:ln|log|sqrt)\b|√/.test(text) && !/(?:domain|positive|x\s*[>≥]|argument|defined)/i.test(text)) {
    addIssue(issues, question, part, "maths-domain", "warning", "A logarithm or square root is used without an explicit domain condition.");
  }
  if (advisoryChecksEnabled && /\b(?:give|state|find|leave|write|express)\b[^.\n]{0,36}\bexact(?:\s+(?:answer|form|result|value))?\b/i.test(part.prompt) && /\b\d+\.\d+\b/.test(part.modelAnswer) && !/[√π]|fraction|surd/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-exact-form", "warning", "The prompt requests an exact result but the worked answer appears decimal-only.");
  }
  if (advisoryChecksEnabled && /\b(?:differentiat|derivative|integrat|antiderivative|gradient)\w*\b/i.test(text) &&
      /\b(?:therefore|hence|so)\b/i.test(part.prompt) && !/[=→]/.test(part.modelAnswer)) {
    addIssue(issues, question, part, "maths-calculus", "warning", "A calculus conclusion has no explicit symbolic result to check.");
  }
}
