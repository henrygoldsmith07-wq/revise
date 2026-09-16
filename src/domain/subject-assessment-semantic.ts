import type { CapabilityEvidenceContract, LearningProvenance, QuestionPart } from "./types";

function numericLiterals(text: string): string[] {
  return [...text.matchAll(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?/gi)]
    .map((match) => match[0]!.replace(/\s+/g, "").replace(/\.$/, "").toLowerCase());
}
function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function normaliseEvidenceText(value: string): string {
  return value
    .replace(/[−–—]/g, "-")
    .replace(/[′’]/g, "'")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => String("⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit)))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function evidencePhrasePresent(text: string, phrase: string): boolean {
  const haystack = normaliseEvidenceText(text);
  const needle = normaliseEvidenceText(phrase);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  // Equation/chemical notation often differs only by spacing around symbols.
  if (haystack.replace(/[\s,;:]+/g, "").includes(needle.replace(/[\s,;:]+/g, ""))) return true;
  // Allow ordinary grammatical inflections for a single authored operation
  // (differentiate/differentiated, compare/comparison) without making a
  // multi-word prose sentence count as evidence by accident.
  if (!/\s/.test(needle) && needle.length >= 5) {
    const stem = needle.slice(0, Math.max(5, needle.length - 2));
    return new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\w*`, "i").test(haystack);
  }
  return false;
}

const OPERATION_ALIASES: Record<string, readonly string[]> = {
  differentiate: ["differentiate", "differentiated", "derivative", "differentiable"],
  integrate: ["integrate", "integrated", "integral", "antiderivative"],
  derive: ["derive", "derived", "derivation", "obtain", "obtains", "gives", "gives"],
  minimise: ["minimise", "minimize", "minimum", "minimised", "minimized", "optimise", "optimize"],
  maximize: ["maximise", "maximize", "maximum", "maximised", "maximized", "optimise", "optimize"],
  maximise: ["maximise", "maximize", "maximum", "maximised", "maximized", "optimise", "optimize"],
  calculate: ["calculate", "calculated", "calculation", "compute", "computed"],
  compare: ["compare", "compared", "comparison", "contrast", "rank"],
  condition: ["condition", "conditional", "conditioning", "given"],
  normalise: ["normalise", "normalize", "normalised", "normalized"],
  stoichiometry: ["stoichiometry", "stoichiometric", "mole ratio", "ratio"],
  uncertainty: ["uncertainty", "uncertainties", "error", "precision"],
  subtract: ["subtract", "subtracted", "difference", "minus"],
  multiply: ["multiply", "multiplied", "product", "times"],
  divide: ["divide", "divided", "quotient", "ratio"],
  pressure: ["pressure", "partial pressure", "piston"],
};

function operationEvidencePresent(text: string, operation: string): boolean {
  if (evidencePhrasePresent(text, operation)) return true;
  const aliases = OPERATION_ALIASES[operation.toLowerCase()] ?? [];
  return aliases.some((alias) => evidencePhrasePresent(text, alias));
}

function evidenceSegments(text: string): string[] {
  const segments: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1] ?? "";
    const previous = text[index - 1] ?? "";
    const decimalPoint = character === "." && /\d/.test(previous) && /\d/.test(next);
    const boundary = character === ";" || character === "\n" || (character === "." && !decimalPoint);
    if (!boundary) continue;
    const segment = text.slice(start, index + (character === "\n" ? 0 : 1)).trim();
    if (segment) segments.push(segment);
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) segments.push(tail);
  return segments;
}

const RESULT_QUANTITY = /\b((?:the\s+)?(?:[A-Za-z][A-Za-z0-9′'/-]*\s+){0,3}(?:probability|concentration|amount|mass|volume|force|energy|gradient|derivative|root|ratio|yield|purity|rate|value|answer|result|share|length|area|distance|temperature|pressure|current|charge|frequency|wavelength|momentum|potential|electrons?|q|x|y))\s*(?:is|are|equals?|=|will\s+be|should\s+be|,|:)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[/:+-]\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+))*(?:\s+[A-Za-zμΩ°][A-Za-z0-9μΩ°⁻¹⁻²³/.-]*)?)(?![A-Za-z])/gi;

/**
 * Extract only values that a prompt explicitly presents as an answer or
 * conclusion.  Source equations (for example f(x)=x²) are deliberately
 * ignored unless a command word makes the equality the requested result.
 */
export function promptAnswerClaims(prompt: string): string[] {
  const claims: string[] = [];
  const command = /\b(?:calculate|find|determine|obtain|report|give|show|derive|solve|simplify|evaluate|state|predict|conclude|identify|select|choose|pick|tick)\b/gi;
  // A deliberately permissive left-hand expression recognises the forms that
  // occur in the bank (f′(3), P(A|B), √50/(√2+1), [H+], c and a species),
  // while the command/window rules below stop source equations from being
  // mistaken for leaked answers.
  const assignment = /(?:^|\b)([^=,;.!?\n]{1,100}?)\s*(?:=|≈|\bis\b|\bequals\b|\bwill\s+be\b|\bshould\s+be\b)\s*([^,;.!?\n]{1,120})/i;
  for (const match of prompt.matchAll(command)) {
    const start = match.index ?? 0;
    // A method named after “using/by/via” is source instruction, not an
    // answer.  Without this guard a route such as “using solve f' = 0 then
    // compare values” looks like a leaked equality.
    const prefix = prompt.slice(Math.max(0, start - 24), start);
    if (/\b(?:using|by|via|through|with)\s*$/i.test(prefix)) continue;
    const remainder = evidenceSegments(prompt.slice(start + match[0].length))[0] ?? "";
    // Definitions introduced after “using/where/from/given” are source data,
    // not leaked answers.  Keep the part immediately attached to the command.
    const targetWindow = (remainder.split(/\b(?:using|where|from|given|with|for|when)\b/i, 1)[0] ?? remainder).replace(/[.!?]\s*$/, "");
    const found = targetWindow.match(assignment);
    const assignmentPrefix = found && found.index !== undefined ? targetWindow.slice(0, found.index) : "";
    const assignmentIsEmbeddedInRoute = /\b(?:using|by|via|with|from|where|given|supplied|stated|according\s+to|applied|apply|route|method|to|for|on)\b/i.test(assignmentPrefix);
    if (found && !assignmentIsEmbeddedInRoute) {
      const lhs = found[1]!.replace(/^(?:the|a|an)\s+/i, "").trim();
      const rhs = found[2]!.trim();
      // “solve f' = 0 then compare…” is a method route.  An equality that
      // contains an action cue is not a supplied final result.
      const sourceRelation = /\b(?:using|by|via|with|from|where|given|supplied|stated|according\s+to)\b/i.test(remainder) &&
        /[A-Za-z]/.test(rhs);
      if (lhs && !sourceRelation && !/\b(?:then|using|by|via|with|from|before|after|compare|apply|check|show|identify|to)\b/i.test(rhs) &&
          !(match[0]!.toLowerCase() === "solve" && /^0(?:\b|\s)/.test(rhs))) {
        claims.push(`${lhs}=${rhs}`);
      }
    }
    // “Simplify … to 3 + 2√2” and “give … as 0.5” have no equality symbol,
    // but still reveal the expected result. Exclude precision instructions
    // such as “to 2 decimal places/significant figures”.
    const targetPhrase = targetWindow.match(/\b(?:to|as)\s+(.+)$/i);
    const targetPrefix = targetPhrase && targetPhrase.index !== undefined ? targetWindow.slice(0, targetPhrase.index) : "";
    const targetIsSuppliedRoute = /\b(?:applied|apply|using|method|route|convert|choose|select|equation|relation|formula|identity)\b/i.test(targetPrefix);
    const target = targetPhrase?.[1]?.replace(/[.!?]\s*$/, "").trim() ?? "";
    if (target && !targetIsSuppliedRoute && !/^\d+\s+(?:decimal|significant)\s+(?:places?|figures?)$/i.test(target) &&
        /\d|[√π^=+*/]|\b(?:zero|one|two|three|increase|decrease|higher|lower|positive|negative|left|right|trigonal|planar|pyramidal)\b/i.test(target)) {
      claims.push(target);
    }

    // A bare quantity after a command (“find the concentration, 0.25 mol
    // dm−3”) is still an answer leak even without an equality. Stop at source
    // cues such as “from” or “using” so supplied data remain legitimate.
    const quantityClaim = [...targetWindow.matchAll(RESULT_QUANTITY)][0];
    if (quantityClaim && !/\b(?:using|by|via|through|from|where|given|supplied|stated|with|according\s+to)\b/i.test(targetWindow.slice(0, quantityClaim.index ?? 0))) {
      claims.push(`${quantityClaim[1]!.trim()} is ${quantityClaim[2]!.trim()}`);
    }

    // Selection instructions can embed a numerical or option answer without
    // an equality (“select 14 as the concentration”, “tick option C”).
    // Restrict this to an explicit selection command so ordinary supplied
    // values following “calculate” remain source data.
    if (/\b(?:select|choose|pick|tick)\b/i.test(match[0]!)) {
      const selected = remainder.match(/^\s*(?:option\s+([A-H])\b|([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?)(?=\s*(?:as|,|\.|;|$))|([A-H])(?=\s*(?:as|,|\.|;|$)))/i);
      const selectedValue = selected?.[1] ?? selected?.[2] ?? selected?.[3];
      if (selectedValue) claims.push(selectedValue.trim());
    }
  }
  // “The concentration/result/effect is …; explain why” is a conclusion leak
  // even when no calculation command precedes it.  Require an explanatory
  // command later in the same sentence to avoid treating ordinary supplied
  // data as an answer.
  const conclusionPattern = /\b(?:the\s+)?(?:result|outcome|effect|conclusion|rate|probability|gradient|value|answer|concentration|amount|mass|volume|force|energy|derivative|root|ratio|yield|purity)\s*(?:=|≈|\bis\b|\bequals\b|\bwill\s+be\b|\bshould\s+be\b)\s*(.+)$/i;
  let searchOffset = 0;
  for (const segment of evidenceSegments(prompt)) {
    const found = segment.match(conclusionPattern);
    if (found) {
      const absoluteEnd = searchOffset + (found.index ?? 0) + found[0].length;
      if (/\b(?:explain|justify|why|reason|predict|comment|interpret|show|infer|deduce)\b/i.test(prompt.slice(absoluteEnd))) {
        claims.push(`${found[0]}`);
      }
    }
    searchOffset += segment.length + 1;
  }

  // A predictive/inferential clause can leak a qualitative answer without an
  // equality (“predict that water moves into the cell”). Require an explicit
  // that-clause and a concrete outcome cue; open questions such as “predict
  // what happens” remain valid prompts.
  const directConclusion = /\b(?:predict|infer|deduce|conclude|state|identify)\s+that\s+([^.;!?\n]+)/gi;
  for (const match of prompt.matchAll(directConclusion)) {
    const conclusion = match[1]!.trim();
    if (/\d|[=→⟶]|\b(?:increase|decrease|rise|fall|move|enter|leave|diffus|react|bind|denatur|higher|lower|positive|negative|zero|same|different|proportional|independent|dependent|favou?r|product|reactant|active\s+site|water\s+potential|concentration|rate|gradient|mechanism|structure|function)\w*/i.test(conclusion)) {
      claims.push(conclusion);
    }
  }
  return unique(claims);
}

function expectedResultFragments(expectedResult: string): string[] {
  const normalised = normaliseEvidenceText(expectedResult).replace(/[.!?]+(?=\s|$)/g, "").trim();
  if (!normalised) return [];
  const fragments: string[] = [];
  // Keep the complete authored conclusion when it contains a concrete value
  // or outcome. This catches prose such as “the concentration is 0.25 mol
  // dm−3” even when the prompt has no command/equality for the parser to use.
  if (/(?:\d|\b(?:increase|decrease|rise|fall|move|enter|leave|diffus|react|bind|denatur|higher|lower|positive|negative|zero|same|different|proportional|independent|dependent|favou?r|product|reactant)\w*)/i.test(normalised) &&
      !/\b(?:conclusion|result)\s+follows\b/i.test(normalised)) {
    fragments.push(normalised);
  }
  // Also expose individual equations so a prompt that embeds only the final
  // assignment (rather than the whole prose sentence) is still rejected.
  for (const match of normalised.matchAll(/\b[A-Za-z][A-Za-z0-9′']*(?:\([^)]*\))?\s*(?:=|≈|\bis\b|\bequals?\b)\s*[^,.;\n]+/gi)) {
    const fragment = match[0]!.trim();
    if (/\d|[√π]|\b(?:increase|decrease|rise|fall|move|enter|leave|higher|lower|positive|negative|zero|same|different)\w*/i.test(fragment)) fragments.push(fragment);
  }
  // Keep a compact quantity assertion as well as the full sentence. This
  // catches “find the concentration, 0.25 mol dm−3” when the hidden trace
  // says “the concentration is 0.25 mol dm−3”, while still requiring the
  // target noun/variable (a supplied domain bound such as x ≤ 12 cannot
  // satisfy the assertion).
  for (const match of normalised.matchAll(RESULT_QUANTITY)) {
    fragments.push(`${match[1]!.trim()} ${match[2]!.trim()}`);
  }
  return unique(fragments);
}

function compactClaim(value: string): string {
  return normaliseEvidenceText(value)
    .replace(/[.!?]+(?=\s|$)/g, "")
    .replace(/[\s,;:]+/g, "");
}

function claimMatches(text: string, claim: string, options: { allowRhs?: boolean } = {}): boolean {
  const compactText = compactClaim(text);
  const compact = compactClaim(claim);
  if (!compact) return false;
  if (compactText.includes(compact)) return true;
  if (options.allowRhs === false) return false;
  const rhs = claim.split("=").slice(1).join("=").trim();
  // A full equality may be re-rendered with a different lhs (for example a
  // prose answer says “the gradient is 2”). Only compare a sufficiently
  // specific RHS; a lone supplied digit is never enough evidence.
  return rhs.length >= 2 && /\d|[A-Za-z]{2,}|[√π]/.test(rhs) && compactText.includes(compactClaim(rhs));
}

/** Return a hard error when the prompt already contains the expected answer. */
export function answerLeakageDetail(prompt: string, workedAnswer: string, expectedResult?: string): string | null {
  for (const claim of promptAnswerClaims(prompt)) {
    if (claimMatches(workedAnswer, claim)) return `Prompt states the expected result/conclusion (${claim}) before the learner responds.`;
  }
  for (const claim of expectedResultFragments(expectedResult ?? "")) {
    // For the hidden expected-result trace, require the complete authored
    // assertion to be present. Matching only a right-hand-side value would
    // confuse supplied data such as a domain bound (x ≤ 12) or a prior
    // probability (1/2) with the learner's derived answer (x = 12).
    if (claimMatches(prompt, claim, { allowRhs: false })) return `Prompt contains the authored expected result/conclusion (${claim}) before the learner responds.`;
  }
  return null;
}

export function validateCapabilityEvidence(
  contract: CapabilityEvidenceContract | undefined,
  part: QuestionPart,
  text: string,
): string[] {
  if (!contract) return [];
  const failures: string[] = [];
  if (!part.capabilityIds?.includes(contract.capabilityId)) {
    failures.push(`Capability evidence is for ${contract.capabilityId}, but the part maps to ${part.capabilityIds?.join(", ") || "no capability"}.`);
  }
  for (const entity of contract.requiredEntities) {
    // A concrete entity must be present in the student-facing setup.  Finding
    // it only in the answer would make a generic prompt appear specific after
    // the fact.
    if (!evidencePhrasePresent(part.prompt, entity)) failures.push(`Required capability entity/representation is absent from the prompt: ${entity}.`);
  }
  for (const operation of contract.requiredOperations) {
    if (!operationEvidencePresent(text, operation)) failures.push(`Required capability operation is absent: ${operation}.`);
  }
  for (const relation of contract.requiredRelations ?? []) {
    if (!evidencePhrasePresent(part.prompt, relation)) failures.push(`Required capability relation is absent from the prompt: ${relation}.`);
  }
  if (contract.secondaryCapability && !evidencePhrasePresent(
    `${part.prompt}\n${part.learningClaims?.join("\n") ?? ""}\n${text}`,
    contract.secondaryCapability,
  )) {
    failures.push(`Secondary synoptic capability is not explicit: ${contract.secondaryCapability}.`);
  }
  return failures;
}

function commonPhysicalConstant(value: string): boolean {
  const canonical = value.replace(/\s+/g, "").toLowerCase();
  // Only values that are genuinely constants independent of the authored
  // setup belong here.  Coefficients such as 2, 3 or 100 must be traced to a
  // supplied relation or an explicit intermediate instead of being waved
  // through as “constants”.
  return new Set(["0", "1", "273.15", "9.81", "8.31", "8.314", "6.02e23", "6.022e23", "1.6e-19", "3.00e8", "3e8", "π"]).has(canonical);
}

function numericOccurrenceContext(text: string, value: string, radius = 56): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`));
  if (!match || match.index === undefined) return text.slice(0, radius * 2);
  return text.slice(Math.max(0, match.index - radius), Math.min(text.length, match.index + value.length + radius));
}

function numericClaimHasDerivation(text: string, value: string, sourceValues: ReadonlySet<string>, intermediateValues: ReadonlySet<string>): boolean {
  const values = numericLiterals(text);
  const hasRelation = /[=≈≃≤≥→⟶]|\b(?:therefore|thus|hence|using|from|substitut|rearrang|divide|multiply|add|subtract|difference|ratio|percent|gradient|area|gives?|obtains?|equals?|combined?|adding|sum|total|contribut\w*|exact(?:ly)?|approximately|about|round(?:ed|ing)?|precision)\b/i.test(text);
  const hasPriorValue = values.some((candidate) => candidate !== value && (sourceValues.has(candidate) || intermediateValues.has(candidate)));
  const globalSourceCue = sourceValues.size > 0 && /\b(?:from|using|given|supplied|substitut|based\s+on|via|through|according\s+to|combined?|adding|sum|total|contribut\w*|exact(?:ly)?|approximately|about|round(?:ed|ing)?|precision)\b/i.test(text);
  return hasRelation && (hasPriorValue || globalSourceCue);
}

/** Recompute a plainly written two-operand arithmetic step. */
function arithmeticMismatches(text: string): string[] {
  const mismatches: string[] = [];
  const equality = /(?<![A-Za-z\d.])([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([+−×x*/])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?![\d.])/g;
  for (const segment of evidenceSegments(text)) {
    if (/\b(?:incorrect(?:ly)?|wrong|invalid|not|would\s+(?:give|yield)|rather\s+than|counterfactual|should\s+be|reject(?:ed)?)\b/i.test(segment)) continue;
    for (const match of segment.matchAll(equality)) {
      const prefix = segment.slice(0, match.index ?? 0).trimEnd();
      const suffix = segment.slice((match.index ?? 0) + match[0]!.length).trimStart();
      // Do not validate a binary sub-expression inside a longer chain
      // (`a×b + c×d = total`) or a fraction whose denominator continues after
      // the matched numerator (`15/29`). Only an independently written step
      // is safe to recompute here.
      if (/[=+\-−×x*/(]$/.test(prefix) || /^[+\-−×x*/)]/.test(suffix)) continue;
      const left = Number(match[1]);
      const right = Number(match[3]);
      const actual = Number(match[4]);
      const operator = match[2] === "−" ? "-" : match[2] === "×" || match[2]!.toLowerCase() === "x" ? "*" : match[2];
      const expected = operator === "+" ? left + right : operator === "-" ? left - right : operator === "*" ? left * right : right === 0 ? Number.NaN : left / right;
      if (!Number.isFinite(expected) || !Number.isFinite(actual)) continue;
      if (Math.abs(expected - actual) > Math.max(1e-9, Math.abs(expected) * 1e-6)) {
        mismatches.push(`${match[1]} ${match[2]} ${match[3]} = ${match[4]} (expected ${expected})`);
      }
    }
  }
  return mismatches;
}

export function validateProvenance(
  provenance: LearningProvenance | undefined,
  prompt: string,
  scheme: readonly string[],
  answer: string,
  subjectId?: string,
): string[] {
  if (!provenance) return [];
  const failures: string[] = [];
  const workedText = `${scheme.join("\n")}\n${answer}`;
  for (const mismatch of arithmeticMismatches(workedText)) {
    failures.push(`Arithmetic step is inconsistent: ${mismatch}.`);
  }
  for (const source of provenance.sourceEvidence) {
    if (!evidencePhrasePresent(prompt, source)) failures.push(`Provenance source is not supplied by the prompt: ${source}.`);
  }
  if (!evidencePhrasePresent(workedText, provenance.operation)) {
    const operationWords = provenance.operation.toLowerCase().split(/\s+/).map((word) => word.replace(/[^a-z-]/g, "")).filter((word) => word.length >= 5);
    const overlap = operationWords.filter((word) => evidencePhrasePresent(workedText, word)).length;
    // A concise authored route often changes tense (“compare” →
    // “comparison”) or uses a near synonym. One attributable operation is
    // enough; a long sentence still has to contribute more than a stop word.
    if (overlap < 1) failures.push("Provenance operation is not carried out in the scheme or worked answer.");
  }
  for (const intermediate of provenance.intermediateResults) {
    if (!evidencePhrasePresent(workedText, intermediate)) failures.push(`Provenance intermediate is not shown in the worked route: ${intermediate}.`);
  }
  if (!evidencePhrasePresent(answer, provenance.finalResult)) failures.push("Provenance final result is not established by the worked answer.");
  // The independent answer-leak detector handles explicit result equations or
  // conclusions.  A whole final sentence commonly repeats supplied species
  // (for example “...for B ⇌ 0.5A”), so comparing that sentence literally with
  // the prompt creates a false positive.  Only report a provenance leak when
  // the final claim itself contains a concrete result assignment/value.
  const finalIsConcrete = /(?:=|≈|≤|≥|→|⟶)\s*[^\s.;]+/.test(provenance.finalResult) ||
    /\b(?:therefore|thus|hence|equals?|gives?|yields?|is|are)\b[^.;\n]*\d/i.test(provenance.finalResult);
  if (finalIsConcrete && evidencePhrasePresent(prompt, provenance.finalResult)) failures.push("Provenance final result is already present in the prompt (answer leakage).");

  // Values not supplied, declared as constants or connected to a checkable
  // intermediate derivation are unresolved rather than silently accepted as
  // authored facts. Equation results are allowed only when the provenance
  // explicitly accounts for a source value, which keeps “answer is 42” or an
  // invented mole amount from passing as a calculation.
  const supplied = new Set(numericLiterals(prompt));
  const intermediateText = provenance.intermediateResults.join("\n");
  const declared = new Set(numericLiterals(`${intermediateText} ${provenance.finalResult}`));
  const intermediateValues = new Set(numericLiterals(intermediateText));
  for (const value of unique(numericLiterals(`${scheme.join("\n")}\n${answer}`))) {
    const index = normaliseEvidenceText(answer).indexOf(normaliseEvidenceText(value));
    const nearby = index >= 0 ? answer.slice(Math.max(0, index - 24), index + value.length + 24) : answer;
    const magnitude = value.replace(/^[+-]/, "");
    const signedVariantDeclared = (declared.has(`-${magnitude}`) || declared.has(`+${magnitude}`)) &&
      /\b(?:loss|magnitude|absolute|difference|change|amount)\b/i.test(nearby);
    const signlessMagnitudeDeclared = declared.has(magnitude) &&
      /\b(?:loss|magnitude|absolute|difference|change|amount)\b/i.test(nearby);
    if (supplied.has(value) || signedVariantDeclared || signlessMagnitudeDeclared || commonPhysicalConstant(value)) continue;
    // Worked solutions often mention a deliberately rejected counterfactual
    // (for example “substituting amounts would incorrectly give 7.50”). That
    // value is evidence about a misconception, not an untraced claimed result.
    if (/\b(?:incorrect(?:ly)?|wrong|invalid|not|would\s+(?:give|yield)|rather\s+than|counterfactual)\b/i.test(nearby)) continue;
    const intermediateEvidence = provenance.intermediateResults.some((intermediate) =>
      numericLiterals(intermediate).includes(value) && numericClaimHasDerivation(intermediate, value, supplied, intermediateValues));
    const answerEvidence = numericClaimHasDerivation(nearby, value, supplied, intermediateValues);
    if (declared.has(value) && (intermediateEvidence || answerEvidence)) continue;
    if (/[=≈≃≤≥→⟶]/.test(nearby) || /\b(?:therefore|thus|hence|result|value|amount|rate|concentration|probability|difference|change|rise|increase|decrease|higher|lower|measurement|observation|gives?|obtains?|equals?)\b/i.test(nearby)) {
      failures.push(`Unexplained numerical claim ${value} has no source-linked derivation in the provenance.`);
    }
  }

  if (subjectId === "wjec-alevel-maths") {
    // A derivative/integral route must remain attached to the function named
    // in the setup. This catches a copied answer such as g′(x) when only f(x)
    // was supplied, even when the numbers happen to look plausible.
    const promptFunctions = new Set([...prompt.matchAll(/\b([A-Za-z])\s*\([^)]*\)\s*(?:=|is|represents)/g)].map((match) => match[1]!.toLowerCase()));
    const answerFunctions = [...answer.matchAll(/\b([A-Za-z])\s*(?:[′']|\([^)]*\))\s*(?:\([^)]*\))?\s*(?:=|≈|is|equals?)/g)]
      .map((match) => match[1]!.toLowerCase())
      .filter((name) => !["p", "q", "r", "s", "t", "x", "y"].includes(name));
    for (const name of unique(answerFunctions)) {
      if (promptFunctions.size && !promptFunctions.has(name)) failures.push(`Maths provenance uses ${name}(…) although the prompt supplies a different function.`);
    }
  }

  if (subjectId === "wjec-alevel-chemistry") {
    // Formulae with a digit or multiple element symbols are conservative
    // anchors for species identity. A species that appears only in the answer
    // is not treated as an invented reagent/product when the prompt already
    // supplies a reaction containing it; otherwise keep the item unresolved.
    const elements = new Set([
      "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
    ]);
    const species = (text: string): string[] => [...text.matchAll(/(?<![A-Za-z])(?:[A-Z][a-z]?(?:[0-9₀-₉]+)?)+(?:\s*(?:\^?\d*[+−-]|[⁺⁻]))?(?=$|[^A-Za-z0-9₀-₉])/g)]
      .map((match) => match[0]!.replace(/\s+/g, ""))
      .filter((formula) => {
        const bare = formula.replace(/[0-9₀-₉()[\]{}^+−-]/g, "");
        const symbols = [...bare.matchAll(/[A-Z][a-z]?/g)].map((match) => match[0]!);
        const parsesAsElements = symbols.length > 0 && symbols.join("") === bare && symbols.every((symbol) => elements.has(symbol));
        const hasCountOrCharge = /[0-9₀-₉⁺⁻^+−-]/.test(formula);
        // SI/RT/PV/IR are common variable or unit abbreviations in authored
        // equations, not species. Exclude them unless a chemical count or
        // charge makes the token unambiguous.
        const looksLikeUnitOrVariable = /^(?:SI|RT|PV|IR|RC|Kc|Kp)$/i.test(formula);
        const indexedVolumeVariable = symbols.length === 1 && /^V[0-9₀-₉]+$/.test(formula);
        return parsesAsElements && !looksLikeUnitOrVariable && !indexedVolumeVariable && (hasCountOrCharge || symbols.length >= 2);
      })
      .map((formula) => formula.toLowerCase());
    const suppliedSpecies = new Set(species(prompt));
    for (const formula of unique(species(answer))) {
      if (!suppliedSpecies.has(formula) && !commonPhysicalConstant(formula)) failures.push(`Chemistry provenance introduces species ${formula} that is not supplied by the prompt.`);
    }
  }
  return failures;
}

export type NumericalClaimRole = "supplied" | "constant" | "reference" | "derived-intermediate" | "derived-final" | "graph-derived" | "unresolved";

export interface NumericalClaimClassification {
  value: string;
  role: NumericalClaimRole;
  location: "prompt" | "scheme" | "answer";
  evidence: string;
}

/** Classify numeric claims without pretending supplied data were verified. */
export function classifyNumericalClaims(part: QuestionPart): NumericalClaimClassification[] {
  const output: NumericalClaimClassification[] = [];
  const provenance = part.learning?.provenance;
  const finalValues = new Set(numericLiterals(provenance?.finalResult ?? ""));
  const intermediateValues = new Set(numericLiterals((provenance?.intermediateResults ?? []).join(" ")));
  const classify = (value: string, location: NumericalClaimClassification["location"], evidence: string): NumericalClaimRole => {
    if (location === "prompt") {
      if (/\b(?:assum(?:e|ed|ption)|reference|standard|typical|nominal|approximately|approx\.?|take\s+as|use\s+the\s+value)\b/i.test(evidence)) return "reference";
      // Plotted/table values are supplied observations.  Only a quantity read
      // from a gradient/area/intercept (rather than a raw datum) is a
      // graph-derived claim.
      const canonical = value.replace(/\s+/g, "").toLowerCase();
      if (!new Set(["0", "1"]).has(canonical) && commonPhysicalConstant(value)) return "constant";
      if (/\b(?:raw|reading|measured|measurement|observation|data\s+point)\b/i.test(evidence)) return "supplied";
      if (/\b(?:gradient|slope|area\s+under|intercept|read\w*\s+from|extrapolat\w*\s+from|estimate\w*\s+from)\b/i.test(evidence)) return "graph-derived";
      return "supplied";
    }
    if (commonPhysicalConstant(value)) return "constant";
    if (finalValues.has(value) && /\b(?:graph|gradient|area|axis|plot|table|dataset|data)\b/i.test(evidence)) return "graph-derived";
    if (finalValues.has(value)) return "derived-final";
    if (intermediateValues.has(value)) return "derived-intermediate";
    return "unresolved";
  };
  for (const [location, text] of [["prompt", part.prompt], ["scheme", part.markScheme.join("\n")], ["answer", part.modelAnswer]] as const) {
    for (const value of unique(numericLiterals(text))) {
      const evidence = numericOccurrenceContext(text, value);
      output.push({ value, location, role: classify(value, location, evidence), evidence });
    }
  }
  return output;
}

export type TransferNoveltyClass = "representation" | "information-structure" | "hidden-state" | "constraint" | "data" | "concept-combination";

/**
 * Transfer is earned by a change in the information the learner must reason
 * over, not by the words “unfamiliar” or a renamed context. Keep the classes
 * deliberately observable so an author can repair a failed item.
 */
export function transferNoveltyClasses(prompt: string): TransferNoveltyClass[] {
  const classes: TransferNoveltyClass[] = [];
  if (/\b(?:diagram|graph|table|spectrum|micrograph|vector|matrix|coordinate|sequence|formula|equation|representation|map|plot|image|apparatus|circuit|chromatogram)\b/i.test(prompt)) classes.push("representation");
  if (/\b(?:protocol|operator|reports?|reporting|selected|ordered|without\s+replacement|sample\s+space|case(?:s)?|mixture|strat(?:um|ified)|pooled|conditional|given\s+that|information\s+structure|permeat\w*|initial(?:ly)?|long[- ]term|over\s+time|slow(?:ly)?|hypertonic|artificial\s+(?:cell|membrane))\b/i.test(prompt)) classes.push("information-structure");
  if (/\b(?:hidden|latent|unobserved|unknown\s+(?:state|parameter|source)|prior|posterior|inferred|infer\w*\s+(?:from|the)|missing\s+value)\b/i.test(prompt)) classes.push("hidden-state");
  if (/\b(?:constraint|domain|boundary|admissible|feasible|limiting|integer|discrete|fixed|constant|conservation|units?|significant\s+figures?|error\s+carried|pressure\s+potential|water\s+potential|osmotic)\b/i.test(prompt)) classes.push("constraint");
  if (/\b(?:data|dataset|data\s+set|measurement|observ(?:ation|ed)|assay|uncertaint|error\s+bar|gradient|area\s+under|trend|residual|yield|titre|titration)\b/i.test(prompt)) classes.push("data");
  if (/\b(?:combine|both|simultaneous|link|connect|relate|together|interaction|coupled|secondary|another\s+capability|two\s+concepts?)\b/i.test(prompt)) classes.push("concept-combination");
  return unique(classes);
}

export function hasSynopticAttribution(part: QuestionPart, subjectId: string): boolean {
  const steps = [...(part.markScheme ?? []), ...part.modelAnswer.split(/[.;\n]+/).map((step) => step.trim()).filter(Boolean)];
  if (steps.length < 2) return false;
  const patterns = subjectId === "wjec-alevel-maths"
      ? [
        /\b(?:derivative|differentiat|integrat|gradient|tangent|normal|calculus|rate)\w*|\b[A-Za-z]\s*[′']|\bd[A-Za-z]\s*\/\s*d[A-Za-z]\b/i,
        /\b(?:geometry|area|volume|radius|length|distance|coordinate|circle|shape)\w*|\bA\s*(?:\(|=)|\br\s*(?:=|²)/i,
        /\b(?:probabilit\w*|conditional|event|distribution|sample|binomial)\w*/i,
        /\b(?:mechanic|force|moment|velocity|acceleration|motion|count|exactly|at\s+least|mixture|pooled|course|weight)\w*/i,
        /\b(?:algebra|equation|root|domain|sequence|exponential|logarithm)\w*/i,
      ]
    : subjectId === "wjec-alevel-biology"
      ? [
          /\b(?:enzyme|substrate|active\s+site|respiration|photosynthesis|metabol|activity|specific\s+activity|protein)\w*/i,
          /\b(?:membrane|transport|osmosis|water\s+potential|diffusion|turgor|solute|pressure\s+potential|cell\s+wall)\w*/i,
          /\b(?:gene|DNA|RNA|allele|protein|mutation|inherit)\w*/i,
          /\b(?:cell|tissue|organ|organell|structure|function)\w*/i,
          /\b(?:control|uncertaint|data|assay|experiment|sample|replicat|variable|observation|comparison)\w*/i,
        ]
      : [
          /\b(?:mole|stoichiometr\w*|titration|titre|concentration|amount|ratio|yield|purity)\w*/i,
          /\b(?:equilibrium|Kc|Kp|acid|base|pH|buffer)\w*/i,
          /\b(?:energy|enthalpy|bond|entropy|kinetic|rate|catalys|temperature)\w*/i,
          /\b(?:electron|oxid|reduc|charge|electrochem|cell)\w*/i,
          /\b(?:atom|periodic|compound|organic|isomer|spectr|structure|gas|pressure|volume)\w*/i,
          /\b(?:uncertaint|precision|significant|error|repeat|accuracy)\w*/i,
        ];
  const operation = /\b(?:calculate|substitut|rearrang|differentiat|integrat|compare|interpret|predict|explain|because|derive|balance|stoichiometr|control|measure|infer|justify|evaluate|combine|constrain|select|reject|convert|rate|gradient|area|ratio|mechanism|evidence|units?|percentage|uncertaint|absolute|relative|titre|titration|subtract|add|activity|specific|pressure|volume|mass|amount|equilibrium|structure|function|supports?|suggests?|conclusion|result|gives?|yields?)\w*/i;
  const represented = new Set<number>();
  const allRepresented = new Set<number>();
  let attributableSteps = 0;
  let checkableSteps = 0;
  for (const step of steps) {
    const hits = patterns.map((pattern, index) => pattern.test(step) ? index : -1).filter((index) => index >= 0);
    hits.forEach((index) => allRepresented.add(index));
    const carriedOut = operation.test(step) || (/[=→⟶]/.test(step) && /\d/.test(step));
    const independentlyCheckable = carriedOut || /\d|[=→⟶]|\b(?:because|therefore|thus|so|while|whereas|supports?|suggests?|higher|lower|increases?|decreases?)\b/i.test(step);
    if (hits.length && independentlyCheckable) checkableSteps += 1;
    if (!hits.length || !carriedOut) continue;
    hits.forEach((index) => represented.add(index));
    attributableSteps++;
  }
  // Qualitative solution steps can be checkable without an equation.  Keep a
  // fallback that still requires two subject areas and two concrete
  // comparison/numeric/causal steps, so bare topic names cannot pass.
  return (represented.size >= 2 && attributableSteps >= 2) ||
    (allRepresented.size >= 2 && checkableSteps >= 2);
}
