import { checkEquationBalance, findUnbalancedEquations } from "./equation-balance";

import type { Question, QuestionPart } from "./types";
import type { SubjectAssessmentIssue } from "./subject-assessment-audit";

import { partText, addIssue } from "./subject-substantive";
function equationCandidates(text: string): string[] {
  const out: string[] = [];
  // Include charge signs and superscript signs at the end of an ionic
  // species. The previous extractor stopped before a trailing “−”, which
  // meant a charge-imbalanced equation could silently bypass the validator.
  // Requiring each side to begin with a formula token also prevents prose
  // immediately before an arrow (for example “check Fe²⁺ …”) becoming part of
  // the equation passed to the balancer.
  const species = String.raw`(?:\d+\s*)?(?:[A-Z]|e)[A-Za-z0-9()[\]₀-₉⁺⁻+\-^]*`;
  const equation = new RegExp(`(${species}(?:\\s*\\+\\s*${species})*\\s*(?:->|→|⟶|==>)\\s*${species}(?:\\s*\\+\\s*${species})*)`, "g");
  for (const match of text.matchAll(equation)) {
    const value = match[1]?.trim();
    if (value) out.push(value);
  }
  return out;
}

interface IonicSpecies {
  coefficient: number;
  formula: string;
  charge: number;
}

function ionicSpecies(side: string): IonicSpecies[] | null {
  const tokens = side.replace(/\((?:aq|s|l|g)\)/gi, "")
    .replace(/[⁺]/g, "+")
    .replace(/[⁻]/g, "-")
    .split(/\s+\+\s+|\s+\+\s*(?=[A-Z])/)
    .map((token) => token.trim())
    .filter(Boolean);
  const out: IonicSpecies[] = [];
  for (const token of tokens) {
    const coefficientMatch = token.match(/^(\d+)\s*/);
    const coefficient = coefficientMatch ? Number(coefficientMatch[1]) : 1;
    const body = token.replace(/^\d+\s*/, "");
    // Neutral molecules (for example Cl₂ or H₂O) are valid participants in
    // an ionic equation and contribute zero charge. Charged species may use
    // either a bare sign (Cl−) or a magnitude (Fe2+).
    const chargeMatch = body.match(/(\d*)([+-])$/);
    const charge = chargeMatch
      ? (chargeMatch[1] ? Number(chargeMatch[1]) : 1) * (chargeMatch[2] === "+" ? 1 : -1)
      : 0;
    const formula = chargeMatch ? body.slice(0, body.length - chargeMatch[0].length).replace(/\^$/, "") : body;
    if (!formula) return null;
    out.push({ coefficient, formula, charge });
  }
  return out.length ? out : null;
}

/** Atom and charge check for simple ionic equations, including half-equations. */
function ionicEquationUnbalanced(equation: string): "atoms" | "charge" | null {
  const halves = equation.replace(/[⇌⟶]/g, "->").split(/->/);
  if (halves.length !== 2) return null;
  const left = ionicSpecies(halves[0]!);
  const right = ionicSpecies(halves[1]!);
  if (!left || !right) return null;
  // The normal balancer is deliberately conservative. Reconstruct each side
  // for atom counting, but always perform charge accounting independently.
  const cleanLeft = left.filter((item) => item.formula !== "e").map((item) => `${item.coefficient}${item.formula}`).join(" + ");
  const cleanRight = right.filter((item) => item.formula !== "e").map((item) => `${item.coefficient}${item.formula}`).join(" + ");
  if (cleanLeft && cleanRight) {
    const atoms = checkEquationBalance(`${cleanLeft} -> ${cleanRight}`);
    if (atoms && !atoms.ok) return "atoms";
  }
  const leftCharge = left.reduce((sum, item) => sum + item.coefficient * item.charge, 0);
  const rightCharge = right.reduce((sum, item) => sum + item.coefficient * item.charge, 0);
  if (leftCharge !== rightCharge) return "charge";
  return null;
}

/** Compare a plainly stated two-reactant mole ratio with equation coefficients. */
function stoichiometricRatioMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:ratio|coefficient|stoichiometr)\w*\b/i.test(prompt)) return null;
  const equation = prompt.match(/\b(\d+\s*)?([A-Z][A-Za-z0-9()[\]₀-₉⁺⁻+-]*)\s*\+\s*(\d+\s*)?([A-Z][A-Za-z0-9()[\]₀-₉⁺⁻+-]*)\s*(?:->|→|⟶|⇌)\s*(?:\d+\s*)?[A-Z][A-Za-z0-9()[\]₀-₉⁺⁻+-]*/);
  if (!equation) return null;
  const expectedLeft = Number((equation[1] ?? "1").trim() || 1);
  const expectedRight = Number((equation[3] ?? "1").trim() || 1);
  if (!Number.isFinite(expectedLeft) || !Number.isFinite(expectedRight)) return null;
  const ratio = answer.match(/\b(?:mole\s+)?ratio\b[^.\n]*?(\d+)\s*:\s*(\d+)/i);
  if (!ratio) return null;
  const actualLeft = Number(ratio[1]);
  const actualRight = Number(ratio[2]);
  if (actualLeft * expectedRight === actualRight * expectedLeft) return null;
  if (/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The stated mole ratio is ${actualLeft}:${actualRight}, but the equation requires ${expectedLeft}:${expectedRight}.`;
}

/** Check powers in a simple Kc expression against a balanced equation. */
function equilibriumExponentMismatch(prompt: string, answer: string): string | null {
  if (!/\bKc\b/i.test(answer)) return null;
  const equation = prompt.match(/\b(\d+\s*)?([A-Z][A-Za-z0-9]*)\s*\+\s*(\d+\s*)?([A-Z][A-Za-z0-9]*)\s*(?:⇌|->|→)\s*(\d+\s*)?([A-Z][A-Za-z0-9]*)/);
  if (!equation) return null;
  const reactantA = equation[2]!;
  const reactantB = equation[4]!;
  const product = equation[6]!;
  const coefficientA = Number((equation[1] ?? "1").trim() || 1);
  const coefficientB = Number((equation[3] ?? "1").trim() || 1);
  const coefficientProduct = Number((equation[5] ?? "1").trim() || 1);
  const expression = answer.match(/\bKc\s*=\s*([^.;]+)/i)?.[1] ?? "";
  if (!new RegExp(`\\[${product}\\]`, "i").test(expression)) return null;
  const power = (species: string): number => {
    const escaped = species.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = expression.match(new RegExp(`\\[${escaped}\\](?:\\s*(?:\\^|²)\\s*(\\d+))?`, "i"));
    return Number(match?.[1] ?? 1);
  };
  const expected = new Map([[reactantA, coefficientA], [reactantB, coefficientB], [product, coefficientProduct]]);
  for (const [species, exponent] of expected) {
    if (exponent <= 1 || power(species) === exponent) continue;
    if (/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
    return `The Kc expression must raise [${species}] to power ${exponent}, matching its balanced-equation coefficient.`;
  }
  return null;
}

function normaliseChemicalToken(value: string): string {
  return value
    .replace(/[₀-₉]/g, (digit) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(digit)))
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Check that a simple Kc numerator/denominator follows the reaction arrow. */
function equilibriumExpressionMismatch(prompt: string, answer: string): string | null {
  if (!/\bKc\b/i.test(answer)) return null;
  const equation = prompt.match(/\b(?:\d+\s*)?([A-Z][A-Za-z0-9₀-₉]*)\s*(?:\+\s*(?:\d+\s*)?([A-Z][A-Za-z0-9₀-₉]*))?\s*(?:⇌|->|→)\s*(?:\d+\s*)?([A-Z][A-Za-z0-9₀-₉]*)/);
  if (!equation) return null;
  const reactants = [equation[1], equation[2]].filter((species): species is string => Boolean(species)).map(normaliseChemicalToken);
  const product = normaliseChemicalToken(equation[3]!);
  const expression = answer.match(/\bKc\s*=\s*([^.;]+)/i)?.[1];
  if (!expression || !expression.includes("/")) return null;
  const [numerator, ...denominatorParts] = expression.split("/");
  const denominator = denominatorParts.join("/");
  const n = normaliseChemicalToken(numerator ?? "");
  const d = normaliseChemicalToken(denominator);
  if (n.includes(product) && reactants.every((species) => d.includes(species))) return null;
  if (/(?:not|incorrect|wrong|correct|should be|reject|reverse)/i.test(answer)) return null;
  return "Kc must place product concentrations in the numerator and reactant concentrations in the denominator, with powers matching the balanced equation.";
}

/** Check charge/electron conservation for a plainly written half-equation. */
function electronBalanceMismatch(answer: string): string | null {
  if (!/(?:e\s*[⁻-]|electron|half[- ]equation)/i.test(answer) || !/(?:->|→|⟶)/.test(answer)) return null;
  const candidate = equationCandidates(answer).find((equation) => /e\s*[⁻-]/i.test(equation));
  if (!candidate) return null;
  const failure = ionicEquationUnbalanced(candidate);
  if (failure !== "charge") return null;
  if (/(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `The half-equation ${candidate} does not conserve charge; add or remove electrons on the side required by the oxidation/reduction change.`;
}

function parseSimpleFormula(value: string): Map<string, number> | null {
  const clean = value.replace(/[⁺⁻+-].*$/, "");
  const matches = [...clean.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (!matches.length || matches.map((match) => match[0]).join("") !== clean) return null;
  const counts = new Map<string, number>();
  for (const match of matches) counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + Number(match[2] || 1));
  return counts;
}

/** Recompute a simple C/H/O empirical formula from supplied masses. */
function empiricalFormulaMismatch(prompt: string, answer: string): string | null {
  if (!/\bempirical\s+formula\b/i.test(prompt)) return null;
  const atomicMass: Record<string, number> = { C: 12.011, H: 1.008, O: 15.999, N: 14.007, S: 32.06, Cl: 35.45 };
  const aliases: Record<string, string> = { carbon: "C", hydrogen: "H", oxygen: "O", nitrogen: "N", sulfur: "S", sulphur: "S", chlorine: "Cl" };
  const supplied = new Map<string, number>();
  const addComposition = (label: string, rawMass: string): void => {
    const symbol = aliases[label.toLowerCase()] ?? (label.length <= 2 ? label[0]!.toUpperCase() + label.slice(1).toLowerCase() : label);
    const mass = Number(rawMass);
    if (atomicMass[symbol] && Number.isFinite(mass)) supplied.set(symbol, mass);
  };
  // Authors use both “carbon 24.0 g” and the more common “24.0 g carbon”.
  for (const match of prompt.matchAll(/\b(carbon|hydrogen|oxygen|nitrogen|sul(?:f|ph)ur|chlorine|C|H|O|N|S|Cl)\b[^\d\n]{0,12}([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:g|%)?/gi)) {
    addComposition(match[1]!, match[2]!);
  }
  for (const match of prompt.matchAll(/([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:g|%)?\s*\b(carbon|hydrogen|oxygen|nitrogen|sul(?:f|ph)ur|chlorine|C|H|O|N|S|Cl)\b/gi)) {
    addComposition(match[2]!, match[1]!);
  }
  if (supplied.size < 2) return null;
  const moles = [...supplied.entries()].map(([symbol, mass]) => [symbol, mass / atomicMass[symbol]!] as const);
  const smallest = Math.min(...moles.map(([, amount]) => amount));
  if (!Number.isFinite(smallest) || smallest <= 0) return null;
  const expected = new Map(moles.map(([symbol, amount]) => [symbol, Math.max(1, Math.round(amount / smallest))] as const));
  const formulaMatch = answer.match(/\b(?:empirical\s+formula\s*(?:is|=)?\s*)?([A-Z][A-Za-z]?\d*(?:[A-Z][A-Za-z]?\d*)+)\b/);
  if (!formulaMatch) return null;
  const actual = parseSimpleFormula(formulaMatch[1]!);
  if (!actual) return null;
  const expectedRatios = [...expected.values()];
  const baseExpected = expectedRatios[0] ?? 1;
  const baseActual = actual.get([...expected.keys()][0]!) ?? 0;
  if (baseActual <= 0) return null;
  const proportional = [...expected.entries()].every(([symbol, count]) => Math.abs((actual.get(symbol) ?? 0) / baseActual - count / baseExpected) < 1e-9);
  if (proportional || /(?:not|incorrect|wrong|reject|should be)/i.test(answer)) return null;
  const expectedFormula = [...expected.entries()].map(([symbol, count]) => `${symbol}${count === 1 ? "" : count}`).join("");
  return `The supplied composition gives empirical formula ${expectedFormula}, not ${formulaMatch[1]}.`;
}

function formulaElementCounts(formula: string): Map<string, number> | null {
  const clean = formula.replace(/[⁺⁻+\-](?:\d+)?$/, "").replace(/\^(?:\d+)?[+-]$/, "").replace(/[₀-₉]/g, (digit) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(digit)));
  if (!clean || /[()·.]/.test(clean)) return null;
  const counts = new Map<string, number>();
  let consumed = "";
  for (const match of clean.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    consumed += match[0];
    counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + Number(match[2] || 1));
  }
  return consumed === clean ? counts : null;
}

/** Solve a simple oxidation-state question from charge balance and common ions. */
function oxidationStateMismatch(prompt: string, answer: string): string | null {
  const target = prompt.match(/\b(?:oxidation state|oxidation number)\s+of\s+([A-Z][a-z]?|oxygen|hydrogen|chlorine|bromine|iodine)\s+in\s+([A-Z][A-Za-z0-9₀-₉⁺⁻+\-^]*)/i);
  if (!target) return null;
  const symbol = ({ oxygen: "O", hydrogen: "H", chlorine: "Cl", bromine: "Br", iodine: "I" } as Record<string, string>)[target[1]!.toLowerCase()] ?? target[1]!;
  const counts = formulaElementCounts(target[2]!);
  if (!counts || !counts.has(symbol)) return null;
  const reported = answer.match(/(?:oxidation state|oxidation number)[^+\-\d]{0,30}([+-]?\d+)/i);
  if (!reported) return null;
  const actual = Number(reported[1]);
  if (!Number.isFinite(actual) || /(?:not|incorrect|wrong|correct|should be)/i.test(answer)) return null;
  const known: Record<string, number> = { H: 1, O: -2, F: -1, Cl: -1, Br: -1, I: -1, Li: 1, Na: 1, K: 1, Mg: 2, Ca: 2, Al: 3 };
  const formulaChargeMatch = target[2]!.match(/(?:\^(\d*)|)([+-])$/);
  const totalCharge = formulaChargeMatch ? (Number(formulaChargeMatch[1] || 1) * (formulaChargeMatch[2] === "+" ? 1 : -1)) : 0;
  let knownTotal = 0;
  for (const [element, count] of counts) {
    if (element === symbol) continue;
    const value = known[element];
    if (value === undefined) return null;
    knownTotal += value * count;
  }
  const expected = (totalCharge - knownTotal) / (counts.get(symbol) ?? 1);
  if (!Number.isFinite(expected) || Math.abs(actual - expected) < 1e-9) return null;
  return `${symbol} in ${target[2]} should have oxidation state ${expected > 0 ? "+" : ""}${expected}.`;
}

function significantFigures(value: string): number {
  const clean = value.replace(/[+\-]/g, "").replace(/^0+(?=\d)/, "");
  const [mantissa] = clean.split(/[eE]/);
  const digits = mantissa!.replace(/\./g, "").replace(/^0+/, "");
  return digits.length;
}

function chemistryPrecisionWarning(prompt: string, answer: string): string | null {
  const request = prompt.match(/\b(?:to|give|state)(?:\s+it)?\s+(\d+)\s+significant\s+figures?\b/i);
  if (!request) return null;
  const target = Number(request[1]);
  const values = [...answer.matchAll(/\b[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/g)].map((match) => match[0]);
  const final = values.sort((left, right) => significantFigures(right) - significantFigures(left))[0];
  if (!final || significantFigures(final) <= target) return null;
  return `The reported value ${final} has more than ${target} significant figures; round the final result only after the calculation.`;
}

function acidBasePHMismatch(prompt: string, answer: string): string | null {
  if (!/\bpH\b/i.test(prompt) || !/(?:\[H\+\]|hydrogen\s+ion|strong\s+acid)/i.test(prompt)) return null;
  const concentration = prompt.match(/(?:\[H\+\]|concentration)[^=]*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)\s*[+-]?\d+)?)/i);
  const answerValue = answer.match(/\bpH\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/i);
  if (!concentration || !answerValue) return null;
  const raw = concentration[1]!.replace(/\s+/g, "");
  const tenPower = raw.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:[×x]10(?:\^|\*\*)([+-]?\d+))?$/i);
  if (!tenPower) return null;
  const c = Number(tenPower[1]) * 10 ** Number(tenPower[2] ?? 0);
  const expected = -Math.log10(c);
  const actual = Number(answerValue[1]);
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(actual) || Math.abs(actual - expected) < 0.02 || /(?:not|incorrect|wrong|correct|should be)/i.test(answer)) return null;
  return `For [H⁺] = ${c}, pH should be approximately ${expected.toFixed(2)}.`;
}

/** Recompute n = cV for a plainly stated solution aliquot/titration. */
function solutionAmountMismatch(prompt: string, answer: string): string | null {
  if (!/\b(?:calculate|find|determine|amount|moles?)\b/i.test(prompt) || !/\bn\b/i.test(answer)) return null;
  const concentration = prompt.match(/\b([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*mol\s*dm\s*(?:\^?[-⁻]?3|[-⁻]³)/i);
  const volume = prompt.match(/\b([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*cm\s*(?:\^?3|³)/i);
  if (!concentration || !volume) return null;
  const c = Number(concentration[1]);
  const v = Number(volume[1]);
  // Keep the match in one clause: an "n = …" in one sentence and a later
  // concentration "0.500 mol" must not combine into a false amount claim.
  const reportedValues = [...answer.matchAll(/\bn\s*=\s*[^=;.\n]{0,60}?(?:=\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?)\s*mol\b/gi)]
    .map((match) => match[1]!.replace(/\s+/g, ""))
    .map((raw) => {
      const power = raw.match(/(?:×|x)10(?:\^|\*\*)([+-]?\d+)$/i);
      return Number(raw.replace(/(?:×|x)10(?:\^|\*\*)[+-]?\d+$/i, "")) * 10 ** Number(power?.[1] ?? 0);
    });
  const actual = reportedValues.at(-1);
  if (!Number.isFinite(c) || !Number.isFinite(v) || actual === undefined) return null;
  const expected = c * v / 1000;
  const tolerance = Math.max(1e-9, Math.abs(expected) * 0.005);
  if (Math.abs(actual - expected) <= tolerance || /(?:not|incorrect|wrong|correct|should be|reject)/i.test(answer)) return null;
  return `Using n = cV with ${v} cm³ = ${(v / 1000).toFixed(5)} dm³, the amount should be ${expected} mol, not ${actual} mol.`;
}

export function validateChemistryPart(question: Question, part: QuestionPart, issues: SubjectAssessmentIssue[]): void {
  const text = partText(part);
  const answer = part.modelAnswer;
  const advisoryChecksEnabled = !(question.source === "generated" && question.verification === "unverified");
  const equations = [...new Set([...equationCandidates(text), ...findUnbalancedEquations(text)])];
  for (const equation of equations) {
    const result = checkEquationBalance(equation);
    if (result && !result.ok) {
      addIssue(issues, question, part, "chemistry-equation-balance", "error", `Equation is not atom-balanced: ${equation}.`);
    }
    const ionicFailure = /[⁺⁻]|(?:[A-Za-z0-9)]\s*\^?\s*\d*[+-])(?:\s|$)/.test(equation) ? ionicEquationUnbalanced(equation) : null;
    if (ionicFailure) {
      addIssue(issues, question, part, "chemistry-equation-balance", "error", `Ionic equation is not ${ionicFailure === "charge" ? "charge" : "atom"}-balanced: ${equation}.`);
    }
  }
  const oxidationWater = answer.match(/\b(?:oxidation state|oxidation number)\b[^.\n]*\b(?:O|oxygen)\b[^.\n]*?([+-]?\d+)\b/i)
    ?? answer.match(/\b(?:O|oxygen)\b[^.\n]*\b(?:oxidation state|oxidation number)\b[^.\n]*?([+-]?\d+)\b/i);
  if (oxidationWater && /H2O/i.test(answer) && Number(oxidationWater[1]) !== -2 && !/(?:not|incorrect|wrong|correct|should be)/i.test(answer)) {
    addIssue(issues, question, part, "chemistry-oxidation-state", "error", "Oxygen in neutral H₂O has oxidation state −2.");
  }
  const oxidationMismatch = oxidationStateMismatch(part.prompt, answer);
  if (oxidationMismatch) addIssue(issues, question, part, "chemistry-oxidation-state", "error", oxidationMismatch);
  const ratioMismatch = stoichiometricRatioMismatch(part.prompt, answer);
  if (ratioMismatch) addIssue(issues, question, part, "chemistry-stoichiometry", "error", ratioMismatch);
  if (/\bKc\s*=\s*\[[A-Z]\]\s*\[[A-Z]\]\s*\/\s*\[[A-Z]\]/i.test(answer) && /(?:⇌|->|→)/.test(text) &&
      /\b(?:reactants?|A)\s*\+\s*(?:B)\b/i.test(text) && !/(?:reverse|incorrect|wrong|correct)/i.test(answer)) {
    // A simple two-reactant/one-product expression is a common place for a
    // numerator/denominator reversal. Leave more complex powers to review.
    const expression = answer.match(/Kc\s*=\s*([^.;]+)/i)?.[1] ?? "";
    if (/\[[A-Z]\]\s*\[[A-Z]\]\s*\/\s*\[[A-Z]\]/i.test(expression)) {
      addIssue(issues, question, part, "chemistry-equilibrium", "error", "Kc places product concentrations in the numerator and reactants in the denominator.");
    }
  }
  const exponentMismatch = equilibriumExponentMismatch(part.prompt, answer);
  if (exponentMismatch) addIssue(issues, question, part, "chemistry-equilibrium", "error", exponentMismatch);
  const expressionMismatch = equilibriumExpressionMismatch(part.prompt, answer);
  if (expressionMismatch) addIssue(issues, question, part, "chemistry-equilibrium", "error", expressionMismatch);
  const phMismatch = acidBasePHMismatch(part.prompt, answer);
  if (phMismatch) addIssue(issues, question, part, "chemistry-acid-base", "error", phMismatch);
  const amountMismatch = solutionAmountMismatch(part.prompt, answer);
  if (amountMismatch) addIssue(issues, question, part, "chemistry-stoichiometry", "error", amountMismatch);
  const electronError = electronBalanceMismatch(answer);
  if (electronError) addIssue(issues, question, part, "chemistry-stoichiometry", "error", electronError);
  const empiricalError = empiricalFormulaMismatch(part.prompt, answer);
  if (empiricalError) addIssue(issues, question, part, "chemistry-stoichiometry", "error", empiricalError);
  const precisionWarning = chemistryPrecisionWarning(part.prompt, answer);
  if (advisoryChecksEnabled && precisionWarning) addIssue(issues, question, part, "chemistry-precision", "warning", precisionWarning);
  if (/\bcm\s*(?:³|3)(?!\w)/i.test(part.prompt) && /\bmol\s*dm\s*(?:[-⁻]?3|⁻³)(?!\w)/i.test(part.prompt) &&
      /\bn\s*=\s*c\s*[×*]\s*\d+(?:\.\d+)?\b/i.test(answer) && !/(?:\/\s*1000|0\.0\d|dm\s*³)/i.test(answer)) {
    addIssue(issues, question, part, "chemistry-unit", "error", "A cm³ volume must be converted to dm³ before using n = cV.");
  }
  if (advisoryChecksEnabled && /\b(?:stoichiometr|mole ratio|coefficient)\w*\b/i.test(part.prompt) &&
      !/\b(?:ratio|coefficient|mole|mol|balanced|electron)\w*\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-stoichiometry", "warning", "The stoichiometric conclusion is not supported by a visible mole ratio or balanced relationship.");
  }
  if (advisoryChecksEnabled && /\b(?:oxidation state|oxidation number|redox|electron transfer)\b/i.test(part.prompt) &&
      !/\b(?:oxid|reduc|electron|charge|state|half-equation)\w*\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-oxidation-state", "warning", "The answer does not show an oxidation-state or electron-balance justification.");
  }
  if (advisoryChecksEnabled && /\b(?:calculate|concentration|amount|energy|volume|pressure|rate)\w*\b/i.test(part.prompt) &&
      /\b(?:mol|dm|cm|kJ|J|Pa|K|g|s|m)\b/i.test(part.prompt) &&
      !/\b(?:mol|dm|cm|kJ|J|Pa|K|g|s|m)\b/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-unit", "warning", "A numerical chemistry answer has no visible unit.");
  }
  const equilibriumTask = /\bK[cp]\b/i.test(part.prompt) ||
    (/(?:⇌|->|→)/.test(part.prompt) && /\b(?:equilibrium|concentration|partial pressure|quotient)\b/i.test(part.prompt));
  if (advisoryChecksEnabled && equilibriumTask && !/(?:\[|partial pressure|concentration|equilibrium|Q[cp])/i.test(part.modelAnswer)) {
    addIssue(issues, question, part, "chemistry-equilibrium", "warning", "The equilibrium answer does not expose the concentration or partial-pressure relationship.");
  }
}
