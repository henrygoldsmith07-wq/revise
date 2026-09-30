export function numericLiterals(text: string): string[] {
  return [...text.matchAll(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?/gi)]
    .map((match) => match[0]!.replace(/\s+/g, "").replace(/\.$/, "").toLowerCase());
}
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function normaliseEvidenceText(value: string): string {
  return value
    .replace(/[−–—]/g, "-")
    .replace(/[′’]/g, "'")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (digit) => String("⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(digit)))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function evidencePhrasePresent(text: string, phrase: string): boolean {
  const haystack = normaliseEvidenceText(text);
  const needle = normaliseEvidenceText(phrase);
  if (!needle) return false;
  const wordPhrase = /^[a-z0-9]+(?:[ -][a-z0-9]+)*$/i.test(needle);
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(needle)) {
    const escapedNumber = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Coefficients can be attached to a variable (40x) or a unit; guard only
    // against adjacent digits so a supplied 4 cannot match the middle of 40.
    const rawHaystack = text.replace(/[−–—]/g, "-");
    if (new RegExp(`(?<![\\d.])${escapedNumber}(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?(?![\\d.])`, "i").test(rawHaystack) ||
        new RegExp(`(?<![\\d.])${escapedNumber}(?![\\d.])`, "i").test(haystack)) return true;
  }
  // Long prose evidence is often stored as a bounded source excerpt. A
  // complete normalised substring is strong evidence even when the excerpt
  // ends mid-word and therefore cannot satisfy a word-boundary regex.
  if (needle.length >= 16 && haystack.includes(needle)) return true;
  if (wordPhrase) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suffix = /\s/.test(needle) ? "" : "(?:s|es|ed|d)?";
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}${suffix}(?:$|[^a-z0-9])`, "i").test(haystack)) return true;
  } else if (haystack.includes(needle)) {
    return true;
  }
  // Equation/chemical notation often differs only by spacing around symbols;
  // keep this compact comparison away from ordinary words so “factor” cannot
  // match the middle of “factory”.
  if (!wordPhrase && haystack.replace(/[\s,;:]+/g, "").includes(needle.replace(/[\s,;:]+/g, ""))) return true;
  // Allow only conservative word inflections.  A loose stem check made
  // “factor” match “factory”, allowing a topic word to masquerade as the
  // requested operation.  Exact boundaries plus plural/past endings keep
  // lexical evidence useful without allowing substring accidents.
  if (!/\s/.test(needle) && needle.length >= 3) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}(?:s|es|ed|d)?\\b`, "i").test(haystack);
  }
  return false;
}

const OPERATION_ALIASES: Record<string, readonly string[]> = {
  differentiate: ["differentiate", "differentiated", "derivative", "differentiable", "gradient", "tangent", "normal", "stationary", "rate"],
  integrate: ["integrate", "integrated", "integral", "antiderivative", "area", "displacement", "evaluate"],
  derive: ["derive", "derived", "derivation", "obtain", "obtains", "gives"],
  minimise: ["minimise", "minimize", "minimum", "minimised", "minimized", "optimise", "optimize"],
  maximize: ["maximise", "maximize", "maximum", "maximised", "maximized", "optimise", "optimize"],
  calculate: ["calculate", "calculated", "calculation", "compute", "computed", "find", "determine", "obtain", "convert", "report", "evaluate", "derive", "show", "measure", "measured", "distance", "area", "combine", "combined", "minimise", "minimize", "maximise", "maximize", "optimise", "optimize"],
  compare: ["compare", "compared", "comparison", "contrast", "rank", "classify", "distinguish"],
  condition: ["condition", "conditional", "conditioning", "conditioned", "given", "change", "changed", "changes"],
  conditional: ["conditional", "conditioning", "condition", "given"],
  normalise: ["normalise", "normalize", "normalised", "normalized"],
  uncertainty: ["uncertainty", "uncertainties", "error", "precision"],
  subtract: ["subtract", "subtracted", "difference", "minus"],
  multiply: ["multiply", "multiplied", "product", "times"],
  pressure: ["pressure", "partial pressure", "piston"],
  measure: ["measure", "measured", "measurement", "measurements", "read", "reading", "readings", "estimate", "estimated"],
  predict: ["predict", "predicted", "prediction", "infer", "inferred", "suggest", "suggests"],
  select: ["select", "selected", "choose", "chosen", "identify", "identified"],
  write: ["write", "writing", "written", "construct", "constructed", "draw", "drawn", "formulate", "formula", "configuration"],
  report: ["report", "reported", "reporting", "state", "list", "name", "identify"],
  identify: ["identify", "identified", "name", "list", "report", "select", "choose"],
  correct: ["correct", "corrected", "reject", "rejected", "repair", "fix"],
  justify: ["justify", "justified", "justify", "because", "therefore", "show"],
  combine: ["combine", "combined", "join", "together", "integrate", "link"],
  interpret: ["interpret", "interpreted", "analyse", "analyze", "read", "infer"],
  estimate: ["estimate", "estimated", "approximate", "read", "interpolate"],
  state: ["state", "stated", "define", "defined", "describe", "list", "name", "report"],
  find: ["find", "found", "determine", "obtain", "calculate", "solve"],
  determine: ["determine", "determined", "find", "obtain", "calculate"],
  show: ["show", "shown", "demonstrate", "derive", "prove", "report"],
  apply: ["apply", "applied", "use", "using", "implement"],
  factor: ["factor", "factored", "factorise", "factorize", "remainder", "divide"],
  probability: ["probability", "conditional", "bayes", "sample space", "event", "chance"],
  stoichiometry: ["stoichiometry", "stoichiometric", "mole ratio", "titration", "titre", "limiting reagent", "yield", "purity"],
  balance: ["balance", "balanced", "oxidise", "oxidize", "reduce", "half-equation", "charge balance"],
  control: ["control", "controlled", "controls", "replicate", "replicated", "hold", "held", "constant", "fixed"],
  reduce: ["reduce", "reduced", "reduction", "hydrolysis", "break", "breaks"],
  substitute: ["substitute", "substituted", "substitution", "insert", "inserted", "replace", "replaced"],
  rearrange: ["rearrange", "rearranged", "rearrangement", "isolate", "isolated"],
  evaluate: ["evaluate", "evaluated", "evaluation", "assess", "assessed"],
  divide: ["divide", "divided", "division", "dividing", "quotient", "ratio"],
  solve: ["solve", "solved", "find", "determine", "obtain", "calculate", "compute", "intersection", "root"],
  explain: ["explain", "explained", "why", "because", "justify", "describe", "state", "define", "identify", "predict", "evaluate", "compare", "relate", "link", "apply", "use", "trace", "follow", "correct"],
  simplify: ["simplify", "simplified", "simplification", "rationalise", "rationalize", "index", "exact form", "prove", "show"],
};

export function operationEvidencePresent(text: string, operation: string): boolean {
  if (evidencePhrasePresent(text, operation)) return true;
  const aliases = OPERATION_ALIASES[operation.toLowerCase()] ?? [];
  return aliases.some((alias) => evidencePhrasePresent(text, alias));
}

/**
 * Return only the part of a prompt that can provide setup evidence.  The
 * learner-facing task is retained (it may contain the operation), but
 * trailing capability labels such as “for surds and indices” are removed
 * before structure detection.  This prevents a label, learning claim or
 * authoring shorthand from satisfying a capability contract.
 */
