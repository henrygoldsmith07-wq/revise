import type {
  CapabilityEvidenceContract,
  CapabilitySetupFingerprint,
  CapabilityStructureContract,
  CapabilityStructureKind,
  LearningProvenance,
  QuestionPart,
} from "./types";

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
export function learnerVisibleSetup(prompt: string): string {
  let value = prompt.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return value;
  const labelTerms = /\b(?:surd|surds|indices?|rationalis(?:e|ing)|factor(?:ing)?(?:\s+and\s+remainder)?\s+theorem|quadratic(?:s|\s+roots?)?|simultaneous\s+equations?|inequalit(?:y|ies)|curve\s+transformations?|coordinate\s+geometry|differentiation|derivative|optimisation|optimization|integration|trigonometry|trigonometric|conditional\s+probability|probability|biological\s+molecules?|carbohydrates?|lipids?|proteins?|cell\s+structure|organelles?|membranes?|diffusion|osmosis|enzymes?|nucleic\s+acids?|DNA|RNA|atomic\s+structure|mass\s+spectr(?:um|a)|electron\s+configurations?|moles?|stoichiometr(?:y|ic)|gases?|bonding|polarity|intermolecular|kinetics|equilibr(?:ium|ia)|acids?\s+and\s+bases?|redox|oxidation|reduction)\b/i;
  const trailing = [...value.matchAll(/\s+(?:for|about|on|covering|testing|assessing)\s+([^.!?]{2,140})[.!?]?$/gi)];
  const candidate = trailing.at(-1);
  if (candidate?.index !== undefined && labelTerms.test(candidate[1] ?? "") &&
      !/[=→⟶⇌√∫]|\b(?:x|y|t|n|p|c)\s*[<>≤≥]=?\s*[-+]?\d/i.test(candidate[1] ?? "")) {
    value = value.slice(0, candidate.index).trim();
  }
  // Authoring labels are sometimes separated by a dash or colon rather than
  // “for”.  Remove only a final label-like fragment; equations and data in
  // the setup are left intact.
  value = value.replace(/\s*(?:[-–—:]\s*)?(?:capability|skill|specification)\s*:\s*[^.!?]+$/i, "").trim();
  return value;
}

function subjectFamily(subjectId: string): "maths" | "biology" | "chemistry" | "physics" | undefined {
  if (subjectId === "maths" || subjectId === "wjec-alevel-maths" || subjectId.startsWith("math.")) return "maths";
  if (subjectId === "biology" || subjectId === "wjec-alevel-biology" || subjectId.startsWith("bio.")) return "biology";
  if (subjectId === "chemistry" || subjectId === "wjec-alevel-chemistry" || subjectId.startsWith("chem.")) return "chemistry";
  if (subjectId === "physics" || subjectId === "wjec-alevel-physics" || subjectId.startsWith("physics.")) return "physics";
  return undefined;
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function equationFragments(text: string): string[] {
  return unique((text
    .replace(/[−–—]/g, "-")
    .match(/[^.;!?\n]*(?:=|≈|≤|≥|→|⟶|⇌|<|>)[^.;!?\n]*/g) ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 2));
}

function hasExplicitFunction(text: string): boolean {
  return /\b[A-Za-z]\s*\(\s*[A-Za-z]\s*\)\s*(?:=|is|represents)\s*[^.;!?\n]+/i.test(text) ||
    /\b(?:y|s|v|P|A|V)\s*(?:\(\s*[A-Za-z]\s*\))?\s*=\s*[^.;!?\n]*(?:[A-Za-z]|\d)/i.test(text) ||
    /\bd[A-Za-z]\s*\/\s*d[A-Za-z]\s*=/i.test(text);
}

function hasNumericData(text: string): boolean {
  return /[-+]?\d+(?:\.\d+)?/.test(text) && /(?:=|,|;|%|\b(?:cm|mm|m|s|kg|g|mol|dm|Pa|J|K|°C|Hz|V|A|N|μm|ng|μmol|kPa|MHz)\b)/i.test(text);
}

function hasChemicalSpecies(text: string): boolean {
  return /(?<![A-Za-z])(?:[A-Z][a-z]?(?:\d+)?){2,}(?:\s*(?:\^?\d*[+−-]))?(?![A-Za-z])/u.test(text) ||
    /\b(?:H\s*[+]\s*|OH|NH|NO|CO|SO|Cl|Fe|Cu|Na|K|Mg|Ca|Mn|Zn|Ag|Br|I)\b/.test(text) ||
    // Unfamiliar redox questions may deliberately use symbolic species such
    // as “X ion” and “Y ion”.  The qualifier makes these genuine species,
    // while a bare A/B variable remains insufficient evidence of chemistry.
    /\b[A-Z](?:\s*\^?\s*[+-]?\d+)?\s+ions?\b/.test(text) ||
    /\b(?:carbon|hydrogen|oxygen|nitrogen|sulfur|sulphur|chlorine|sodium|potassium|magnesium|calcium|phosphorus)\b/i.test(text);
}

/** Runtime list used when a contract names a structure as an entity. */
export const CAPABILITY_STRUCTURE_KINDS: readonly CapabilityStructureKind[] = [
  "polynomial", "quadratic", "radical-expression", "factor-theorem-instance",
  "simultaneous-equations", "inequality-domain", "transformation-graph",
  "exponential-function", "logarithmic-expression",
  "coordinate-geometry", "function", "derivative-target", "tangent-normal",
  "rate-of-change", "optimisation-constraint", "integral", "definite-integral",
  "trigonometric-triangle", "trigonometric-identity", "trigonometric-equation",
  "probability-events", "probability-tree", "conditional-probability",
  "vector-components", "table-dataset", "graph-dataset", "membrane-gradient",
  "membrane-model", "enzyme-assay", "micrograph", "dna-sequence",
  "controlled-experiment", "biological-molecule", "cell-ultrastructure",
  "chemical-equation", "stoichiometric-data", "titration-dataset",
  "equilibrium-system", "mass-spectrum", "electron-configuration",
  "molecular-structure", "redox-species", "gas-data", "bonding-model",
  "particle-model", "numeric-data",
];

function canonicalOperations(text: string, subject?: "maths" | "biology" | "chemistry" | "physics"): string[] {
  const operations: string[] = [];
  const patterns: Array<[string, RegExp]> = [
    ["differentiate", subject === "maths" ? /\b(?:differentiat\w*|derivative|gradient|tangent|normal|rate\s+of\s+change)\b|dy\s*\/\s*dx|\b(?:f|g|h|y|u|v|s)\s*[′']\s*(?:\(|=)/i : /a^/],
    ["integrate", subject === "maths" ? /\b(?:integral|integrat\w*|antiderivative|area\s+under|displacement)\b|∫/i : /a^/],
    ["simplify", subject === "maths" ? /\b(?:simplif\w*|rationalis\w*|index\s+law|exact\s+form)\b/i : /a^/],
    ["factor", subject === "maths" ? /\b(?:factor(?:ing|ed|s)?|remainder|synthetic\s+division|divide\s+by)\b/i : /a^/],
    ["solve", subject === "maths" ? /\b(?:solv\w*|root\w*|intersection\w*|find\s+all)\b/i : /a^/],
    ["substitute", subject === "maths" ? /\b(?:substitut\w*|evaluat\w*\s+at|plug\s+in)\b/i : /a^/],
    ["compare", /\b(?:compar\w*|contrast|rank|classif\w*|distinguish\w*)\b/i],
    ["calculate", /\b(?:calculat\w*|comput\w*|determin\w*|obtain\w*|work\s+out|evaluat\w*|report\w*|find\w*|convert\w*|measur\w*|distance|area)\b/i],
    ["explain", /\b(?:explain\w*|why|because|justify|mechanism)\b/i],
    ["probability", subject === "maths" ? /\b(?:probabil\w*|conditional|bayes|sample\s+space|tree)\b|P\s*\([^)]*\|/i : /a^/],
    ["stoichiometry", subject === "chemistry" ? /\b(?:stoichiometr\w*|mole\s+ratio|titr\w*|limiting\s+reagent|yield|purity)\b/i : /a^/],
    ["balance", subject === "chemistry" ? /\b(?:balanc\w*|oxid(?:is|iz)\w*|reduc\w*|half[- ]equation|charge\s+balance)\b/i : /a^/],
    ["measure", /\b(?:measur\w*|read\w*|plot\w*|gradient|area\s+under|data)\b/i],
    ["control", /\b(?:control\w*|replicat\w*|randomis\w*|variable|uncertaint\w*)\b/i],
    ["predict", /\b(?:predict\w*|infer\w*|deduc\w*|forecast\w*|suggest\w*)\b/i],
    ["select", /\b(?:select\w*|choos\w*|decid\w*|pick\w*)\b/i],
    ["write", /\b(?:writ\w*|construct\w*|draw\w*|formulat\w*)\b/i],
  ];
  for (const [operation, pattern] of patterns) if (pattern.test(text)) operations.push(operation);
  return operations;
}

// Fingerprints are deterministic projections of the learner-visible setup.
// Audits revisit the same parts through the substantive, transfer and
// dashboard passes, so cache by subject family and normalised setup to keep
// bank-scale audits bounded without changing their result.
const setupFingerprintCache = new Map<string, CapabilitySetupFingerprint>();

/** Derive an observable fingerprint from the setup a learner receives. */
export function setupFingerprintFor(subjectId: string, prompt: string): CapabilitySetupFingerprint {
  const subject = subjectFamily(subjectId);
  const text = learnerVisibleSetup(prompt);
  const cacheKey = `${subject ?? subjectId}\u0000${text}`;
  const cached = setupFingerprintCache.get(cacheKey);
  if (cached) return cached;
  const structures: CapabilityStructureKind[] = [];
  const representations: string[] = [];
  const relationships = equationFragments(text).slice(0, 12);
  const operations = canonicalOperations(text, subject);
  const outputTypes: string[] = [];
  const add = (kind: CapabilityStructureKind, condition: boolean): void => { if (condition) pushUnique(structures, kind); };
  const addRep = (value: string, condition: boolean): void => { if (condition) pushUnique(representations, value); };

  addRep("equation", relationships.length > 0);
  addRep("numeric-data", hasNumericData(text));
  addRep("graph", /\bgraph|plot|axis|coordinate\s+grid\b/i.test(text) && (hasNumericData(text) || /\([+-]?\d[^)]*,[^)]*\)/.test(text)));
  addRep("table", /\btable|dataset|data\s+set\b/i.test(text) && /\d/.test(text));
  addRep("diagram", /\bdiagram|apparatus|circuit|figure\b/i.test(text) && /\d|[A-Za-z]/.test(text));
  addRep("sequence", /\b(?:sequence|codon|anticodon)\b/i.test(text) && /[ATCG]{3,}/i.test(text));
  addRep("spectrum", /\bspectr(?:um|a)|m\s*\/\s*z\b/i.test(text) && /\d/.test(text));
  addRep("micrograph", /\bmicrograph\b/i.test(text) && /\d|scale\s+bar/i.test(text));
  addRep("chemical-formula", hasChemicalSpecies(text));
  addRep("vector", /\bvector|dot\s+product|components?\b/i.test(text) && /\(|,/.test(text));

  if (subject === "maths") {
    // A capability label such as “polynomial” is not an input structure. An
    // actual polynomial expression must be attached to a function/equation
    // (or an explicit x/y power equation) before it can satisfy a contract.
    const polynomial = (hasExplicitFunction(text) && /\b(?:x|y)\s*(?:\^|\*\*)\s*[2-9]|x²|x³/i.test(text)) ||
      /\b(?:x|y)\s*(?:\^|\*\*)\s*[2-9]\s*[+-].*=/.test(text);
    const quadratic = /x\s*(?:\^|\*\*)\s*2|x²|quadratic\s+equation/i.test(text) && polynomial;
    const candidate = /\b[A-Za-z]\s*\(\s*[+-]?\d+(?:\.\d+)?\s*\)|\bx\s*=\s*[+-]?\d+(?:\.\d+)?/i.test(text);
    add("function", hasExplicitFunction(text));
    add("polynomial", polynomial);
    add("quadratic", quadratic);
    add("radical-expression", /√|\bsqrt\s*\(|\b[A-Za-z0-9]+\s*\^\s*\(?\s*\d+\s*\/\s*\d+\s*\)?/i.test(text));
    add("factor-theorem-instance", polynomial && candidate && ( /\b(?:factor|remainder|root|divide|polynomial)\b/i.test(text) || /\b[A-Za-z]\s*\(\s*[+-]?\d/i.test(text) ));
    const equationCount = (text.match(/\b[A-Za-z]\s*(?:\([^)]*\))?\s*=|\b[xy]\s*=/gi) ?? []).length;
    add("simultaneous-equations", equationCount >= 2 && /\b(?:simultaneous|system|equation|line|curve|sensor)\b/i.test(text));
    add("inequality-domain", /(?:[A-Za-zxy)]\s*[<>≤≥]|[<>≤≥]\s*[A-Za-zxy(])\s*[-+]?\d|\b(?:inequality|interval|domain|solution\s+set)\b[^.;!?]*(?:[<>≤≥]|\[[^\]]+\])/i.test(text));
    add("transformation-graph", /\b[A-Za-z]\s*\(\s*x\s*[+-]|\|\s*[A-Za-z]\s*\(|\b(?:translate|reflect|stretch|transform)\w*\b[^.;!?]*(?:graph|curve|f\s*\()/i.test(text));
    // Allow the base e to follow a coefficient (for example 3e^(0.2t)); a
    // word-boundary before `e` would incorrectly reject that standard form
    // because the preceding coefficient digit is itself a word character.
    add("exponential-function", /(?:^|[^A-Za-z])e\s*(?:\^|\*\*)\s*[A-Za-z0-9(]|\bexp\s*\(/i.test(text));
    add("logarithmic-expression", /\b(?:ln|log(?:arithm)?(?:\s*[_₀-₉0-9]+)?)\s*(?:\(|[_₀-₉0-9]|\d)/i.test(text));
    add("coordinate-geometry", (/\([+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?\)/.test(text) ||
      (equationCount >= 2 && /\b(?:circle|line|tangent|diameter)\b/i.test(text)) ||
      (/\b(?:circle|line|tangent|diameter)\b/i.test(text) && /\b[xy]\s*=/.test(text))) && /\b(?:coordinate|circle|line|tangent|distance|gradient|point|diameter)\b/i.test(text));
    add("derivative-target", hasExplicitFunction(text) && /\b(?:differentiat\w*|derivative(?:s)?|gradient|tangent|normal|stationary|d\s*[A-Za-z]\s*\/\s*d[A-Za-z])\b|\b(?:f|g|h|y|u|v|s)\s*[′']\s*(?:\(|=)/i.test(text));
    add("tangent-normal", /\b(?:tangent|normal)\b/i.test(text) && /\b(?:gradient|slope|perpendicular|curve|point|line)\b/i.test(text));
    add("rate-of-change", /\bd[A-Za-z]\s*\/\s*d[A-Za-z]\b|\b(?:rate\s+of\s+change|increases?\s+at|decreases?\s+at|per\s+(?:second|hour|minute))\b/i.test(text));
    add("optimisation-constraint", /\b(?:maximum|minimum|optim(?:ise|ization)|constraint|enclosure|area|profit|cost|feasible|admissible)\b/i.test(text) && /\d|\b(?:interval|domain|side|length|width|radius|volume|budget|available)\b/i.test(text));
    add("integral", (/∫|\b(?:integrat\w*|antiderivative|integral)\b/i.test(text)) && (hasExplicitFunction(text) || /∫/.test(text)));
    add("definite-integral", structures.includes("integral") && (/∫\s*[_^]|\b(?:between|from)\s+[-+]?\d[^.;!?]*\b(?:to|and)\b|\bbounds?\b|\barea\b/i.test(text)));
    add("trigonometric-triangle", /\btriangle\b/i.test(text) && /\b(?:sin|cos|tan|angle|included|opposite)\b/i.test(text) && /\d/.test(text));
    add("trigonometric-identity", /\b(?:sin|cos|tan)\b[^=.;!?]{0,80}=/.test(text) && /\b(?:identity|prove|show)\b/i.test(text));
    add("trigonometric-equation", /\b(?:sin|cos|tan)\b[^=.;!?]{0,80}=/.test(text));
    const hasConditionalCue = /P\s*\([^)]*\|[^)]*\)|\b(?:given\s+(?:that|a|an|the)|conditional\s+probability|without\s+replacement|after\s+being\s+told|report(?:ed|ing)?\s+(?:is|was)|within\s+(?:each|the)|overall\s+(?:rate|probability|success)|randomly\s+selected|probability\s+(?:it|that)|came\s+from|selected\s+from|success(?:es)?\s+within)\b/i.test(text);
    const hasEventContext = /P\s*\([^)]*\)|\b(?:event|probability|students?|draw|box|bag|source|component|respondent|factory|defect(?:ive)?|success(?:es)?|course|coin|card|counter|birth|outcome|sample\s+space|independent|conditional|report|colour|color|heads?|tails?|item|component|machine|population|group)\b/i.test(text);
    const hasConditionalStructure = hasConditionalCue && hasEventContext;
    // A number plus a generic context (for example a population model) is
    // not a probability structure. Require an explicit probability/event
    // cue before recording this fingerprint kind.
    const hasProbabilityCue = /P\s*\(|\b(?:probabil\w*|event\w*|sample\s+space|conditional|bayes|tree|without\s+replacement)\b/i.test(text);
    add("probability-events", hasProbabilityCue && hasEventContext && (hasConditionalCue || /\d/.test(text)));
    add("probability-tree", /\btree\b/i.test(text) && /\b(?:branch|probability|event)\b/i.test(text) && /\d/.test(text));
    add("conditional-probability", hasConditionalStructure || /P\s*\([^)]*\|[^)]*\)/.test(text) ||
      /\b(?:without\s+replacement|after\s+being\s+told|report(?:ed|ing)?\s+(?:is|was)|within\s+(?:each|the)|overall\s+(?:rate|probability|success))\b/i.test(text) && hasEventContext);
    add("vector-components", /\bvector|dot\s+product|components?\b/i.test(text) && /\([+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d/.test(text));
  } else if (subject === "biology") {
    add("table-dataset", /\b(?:table|dataset|data\s+set)\b/i.test(text) && /\d/.test(text));
    add("graph-dataset", /\b(?:graph|plot|trend|gradient)\b/i.test(text) && /\d/.test(text));
    add("membrane-model", /\b(?:membrane|bilayer|phospholipid|cholesterol|integral|peripheral\s+protein)\b/i.test(text) && /\b(?:protein|phospholipid|cholesterol|bilayer|fluid|component|structure|permeab\w*|pigment|beetroot|dye|disc|solvent\s+control|controlled\s+experiment)\b/i.test(text));
    // A qualitative membrane question can be structurally valid without a
    // table of values. Require a membrane/cell context plus a real gradient
    // or water-potential cue; numerical data are only needed for a
    // calculation/data demand.
    const membraneBoundary = /\b(?:partially\s+permeable|selectively\s+permeable|membrane|bilayer|cell|tissue|potato|visking)\b/i.test(text);
    const waterPotentialGradient = /\b(?:gradient|water\s+potential|concentration|concentrat\w*|higher|lower|solute|osmotic|MPa)\b/i.test(text);
    const osmosisAssay = /\b(?:sucrose|solution)\b/i.test(text) && /\b(?:mass|height|volume|water\s+moves?|osmosis)\b/i.test(text);
    // “Osmosis” plus an answer-like percentage is not itself a supplied
    // membrane/gradient problem.  Require a boundary and either an explicit
    // potential/concentration gradient or the paired sucrose assay structure.
    add("membrane-gradient", membraneBoundary && (waterPotentialGradient || osmosisAssay));
    // The assay structure is the enzyme/substrate/rate relationship itself;
    // requiring a number here incorrectly rejects explanation and
    // misconception cells that intentionally reason about the mechanism.
    add("enzyme-assay", /\b(?:enzyme|substrate|active\s+site|product\s+readings?|initial\s+rate)\b/i.test(text) && /\b(?:rate|assay|product|activity|temperature|pH|concentration|time|saturat|denatur|inhibit|readings?|data)\b/i.test(text));
    add("graph-dataset", ( /\b(?:readings?|initial\s+rates?|rate\s+data|product\s+concentration)\b/i.test(text) && /\d/.test(text)) || ( /\b(?:graph|plot|trend|gradient)\b/i.test(text) && /\d/.test(text)) );
    add("micrograph", /\bmicrograph|electron\s+microscop\w*\b/i.test(text) && /\b(?:scale\s+bar|μm|µm|magnification|resolution|\d)/i.test(text));
    // Require a token bounded by non-letters: the word “data” contains “ata”
    // and used to masquerade as a DNA sequence in otherwise generic prompts.
    const dnaSequence = /(?<![A-Za-z])[ATCGU]{3,}(?![A-Za-z])/i.test(text);
    add("dna-sequence", /\bDNA|RNA|mRNA|codon|anticodon\b/i.test(text) && dnaSequence);
    add("controlled-experiment", /\b(?:control(?:led)?|independent\s+variable|dependent\s+variable|replicat\w*|randomis\w*|valid\w*|reliab\w*)\b/i.test(text) && /\b(?:experiment|investigation|assay|sample|treatment|condition)\b/i.test(text));
    const moleculeEntity = /\b(?:glucose|starch|glycogen|cellulose|lipid|phospholipid|fatty\s+acid|amino\s+acid|peptide|protein|DNA|RNA|nucleotide|monomer|polymer)\b/i.test(text);
    const moleculeStructure = /\b(?:glycerol|fatty\s+acid|amino\s+acid|peptide\s+bond|hydrogen\s+bond|monomers?|polymers?|condensation|hydrolysis|polypeptides?|residues?|sequences?|chains?|primary|secondary|tertiary|quaternary|fold(?:ing)?|disulfide)\b/i.test(text);
    add("biological-molecule", moleculeEntity && moleculeStructure);
    const cellEvidence = /\b(?:organelle|nucleus|nuclei|mitochondri\w*|ribosome|rough\s+ER|Golgi|lysosome|vesicle|micrograph|electron\s+microscop\w*|pellet|fraction|chloroplast|nucleoid|plasmid)\b/i.test(text);
    const cellStructureRelation = /\b(?:structure|function|visible|electron|μm|µm|magnification|resolution|secretory|pellet|fraction|homogenate|hierarchy|level)\b/i.test(text);
    add("cell-ultrastructure", cellEvidence && cellStructureRelation);
    add("numeric-data", hasNumericData(text));
  } else if (subject === "chemistry") {
    const reaction = /(?:[A-Z][A-Za-z0-9()₀-₉^+−-]*\s*){1,5}(?:→|⟶|⇌|->|<=>)\s*(?:[A-Z][A-Za-z0-9()₀-₉^+−-]*\s*){1,5}/u.test(text);
    add("chemical-equation", reaction);
    add("stoichiometric-data", (hasChemicalSpecies(text) || reaction) &&
      /\b(?:mole|moles|mol|amount|mass|mass\s+of|concentration|volume|titre|yield|ratio|reagent|aliquot|stoichiometr\w*|molar|solution|produces?|reacts?|g\s+(?:of|carbon|hydrogen|oxygen|[A-Z])|particles?|molar\s+mass|Mᵣ|M\s*=|N_A|Avogadro|empirical\s+formula|atomic\s+masses?|sample|requires?|electron\w*|ion\w*|assay|purity)\b/i.test(text) && /\d/.test(text));
    add("titration-dataset", /\b(?:titr\w*|titre|burette|aliquot|endpoint|equivalence|pipette|acid|alkali|neutralis\w*)\b/i.test(text) &&
      /\b(?:concentration|volume|cm³|dm³|mol|neutralis\w*|rinsed|flask|titre|titr\w*|equivalence)\b/i.test(text) &&
      (/\d/.test(text) || /\b(?:pipette|titration|titre|equivalence|neutralis\w*)\b/i.test(text)));
    add("table-dataset", /\b(?:table|dataset|data\s+set)\b/i.test(text) && /\d/.test(text));
    add("graph-dataset", /\b(?:graph|plot|trend|gradient|profile)\b/i.test(text) && /\d/.test(text));
    // An authored equilibrium may state Kc/Kp, partial pressures or a gas
    // mixture without printing the reversible arrow. Those cues still form
    // a concrete equilibrium system when the species are supplied.
    const equilibriumRelation = /(?:⇌|<=>|->|→|⟶)/u.test(text);
    add("equilibrium-system", /(?:⇌|<=>|\breversible\b|\bequilibrium\b|\bKc\b|\bKp\b|partial\s+pressure)/i.test(text) &&
      (hasChemicalSpecies(text) || equilibriumRelation || /\b(?:A|B|C|D)\s*(?:⇌|<=>|->|→|⟶)\s*[A-Z]/.test(text)) &&
      /\b(?:equilibrium|concentration|Kc|Kp|pressure|mixture|gas|reaction|reactor|reactant|catalyst|rate|quotient|compress\w*|temperature|position|composition|sealed|perturb\w*|forward|reverse)\b/i.test(text));
    add("mass-spectrum", /\bmass\s+spectr|m\s*\/\s*z\b/i.test(text) && /\b(?:peak|abundance|fragment|isotope|M\+?2?)\b/i.test(text) && /\d/.test(text));
    add("electron-configuration", /\b(?:electron\s+configur|sub[- ]shell|ionisation\s+energy|1s\s*\d|2p\s*\d|3d\s*\d|4s\s*\d|1s|2s|2p|3s|3p|4s|3d)\b/i.test(text) && /\b(?:atom|ion|electron|element|shell|sub[- ]shell|atomic\s+number)\b/i.test(text));
    add("molecular-structure", hasChemicalSpecies(text) && /\b(?:molecule|structure|shape|Lewis|VSEPR|bond|dipole|electronegativ|isomer|formula)\b/i.test(text));
    add("redox-species", /\b(?:oxid(?:ation|ise|ize)|reduc(?:tion|e)|redox|half[- ]equation|electron\s+transfer)\b/i.test(text) && (hasChemicalSpecies(text) || /[+−-]\s*\d|\be-/.test(text)));
    add("gas-data", /\b(?:ideal\s+gas|gas\s+syringe|pV\s*=|pressure|volume|temperature)\b/i.test(text) && /\b(?:pressure|volume|temperature|kelvin|K|Pa|kPa|dm³|m³)\b/i.test(text) && /\d/.test(text));
    add("bonding-model", hasChemicalSpecies(text) && /\b(?:bond|shape|lattice|electronegativ|dipole|intermolecular|hydrogen|metallic|ionic|covalent)\b/i.test(text) && /\b(?:molecule|solid|ion|electron|shape|structure|compound|bond|dipole)\b/i.test(text));
    add("particle-model", /\b(?:particle|atom|ion|electron|molecule|collision|activation\s+energy)\b/i.test(text) && (hasChemicalSpecies(text) || /\b(?:particle|collision|activation\s+energy|energy\s+profile)\b/i.test(text)));
    add("numeric-data", hasNumericData(text));
  }

  if (/\b(?:state|define|name|list|identify|recall)\b/i.test(text)) pushUnique(outputTypes, "statement");
  if (/\b(?:explain|why|justify|mechanism|because)\b/i.test(text)) pushUnique(outputTypes, "explanation");
  if (/\b(?:calculate|find|determine|obtain|solve|evaluate|measure|estimate)\b/i.test(text)) pushUnique(outputTypes, "numeric");
  if (/\b(?:simplif\w*|exact\s+form|rationalis\w*)\b/i.test(text)) pushUnique(outputTypes, "exact-form");
  if (/\b(?:prove|identity|show\s+that)\b/i.test(text)) pushUnique(outputTypes, "proof");
  if (/\b(?:classif\w*|identify|select|choose|decide|which)\b/i.test(text)) pushUnique(outputTypes, "classification");
  if (/\b(?:predict|infer|deduc\w*|conclude|compare|evaluate)\b/i.test(text)) pushUnique(outputTypes, "inference");
  if (!outputTypes.length) pushUnique(outputTypes, "prose");
  const fingerprint = { ...(subject ? { subject } : {}), structures, representations, operations, relationships, outputTypes };
  setupFingerprintCache.set(cacheKey, fingerprint);
  return fingerprint;
}

function makeStructureContract(
  requiredStructures: CapabilityStructureKind[],
  options: Omit<CapabilityStructureContract, "requiredStructures"> = {},
): CapabilityStructureContract {
  return { requiredStructures, requireDerivationOperation: true, ...options };
}

function derivationOperationMatchesContract(
  operation: string,
  contract: CapabilityStructureContract | undefined,
): boolean {
  if (!contract) return true;
  const required = contract.requiredOperations ?? [];
  const groups = contract.requiredOperationGroups ?? [];
  if (required.length && !required.some((candidate) => operationEvidencePresent(operation, candidate))) return false;
  if (groups.length && !groups.every((group) => group.some((candidate) => operationEvidencePresent(operation, candidate)))) return false;
  return true;
}

function arraysEqualAsSets(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left.map((value) => value.toLowerCase()))].sort();
  const b = [...new Set(right.map((value) => value.toLowerCase()))].sort();
  return a.join("|") === b.join("|");
}

/**
 * Return the canonical structural requirements that an authored contract has
 * weakened or omitted.  Extra constraints are allowed, but a generated item
 * cannot remove a required structure, operation, relationship or output from
 * the subject contract and still claim substantive evidence.
 */
export function structuralContractDeficits(
  actual: CapabilityStructureContract,
  canonical: CapabilityStructureContract,
): string[] {
  const deficits: string[] = [];
  const hasAll = (present: readonly string[] | undefined, required: readonly string[] | undefined, label: string): void => {
    const actualValues = new Set((present ?? []).map((value) => value.toLowerCase()));
    for (const value of required ?? []) {
      if (!actualValues.has(value.toLowerCase())) deficits.push(`${label}: ${value}`);
    }
  };
  hasAll(actual.requiredStructures, canonical.requiredStructures, "required structure");
  hasAll(actual.requiredRepresentations, canonical.requiredRepresentations, "required representation");
  hasAll(actual.requiredOperations, canonical.requiredOperations, "required operation");
  hasAll(actual.requiredRelationships, canonical.requiredRelationships, "required relationship");
  hasAll(actual.expectedOutputTypes, canonical.expectedOutputTypes, "expected output");
  hasAll(actual.invalidSubstituteStructures, canonical.invalidSubstituteStructures, "invalid substitute");
  for (const requiredGroup of canonical.requiredStructureGroups ?? []) {
    const represented = (actual.requiredStructureGroups ?? []).some((group) => arraysEqualAsSets(group, requiredGroup)) ||
      (actual.requiredStructures ?? []).some((value) => requiredGroup.includes(value));
    if (!represented) deficits.push(`required structure group: ${requiredGroup.join(" | ")}`);
  }
  for (const requiredGroup of canonical.requiredOperationGroups ?? []) {
    const represented = (actual.requiredOperationGroups ?? []).some((group) => arraysEqualAsSets(group, requiredGroup)) ||
      (actual.requiredOperations ?? []).some((value) => requiredGroup.includes(value));
    if (!represented) deficits.push(`required operation group: ${requiredGroup.join(" | ")}`);
  }
  if (canonical.requireDerivationOperation && !actual.requireDerivationOperation) {
    deficits.push("derivation operation");
  }
  return deficits;
}

interface CapabilityRouteCueGroups {
  /** A concrete object/representation cue, rather than a topic label alone. */
  object: readonly RegExp[];
  /** A second cue showing that the object is actually operated on. */
  operation: readonly RegExp[];
}

/**
 * Conservative route cues used by the capability-necessity check.  A single
 * topic word is deliberately insufficient: the worked route must mention
 * both the supplied object and an operation/relationship that acts on it.
 * This catches a prompt that happens to contain a radical, membrane or
 * reaction while the requested result is solved by unrelated arithmetic.
 */
const CAPABILITY_ROUTE_CUES: Partial<Record<CapabilityStructureKind, CapabilityRouteCueGroups>> = {
  "radical-expression": { object: [/√|sqrt\s*\(|\bsurd\w*\b|\bradical\w*\b/i], operation: [/conjugate|rationalis\w*|index\s+law|simplif\w*/i] },
  polynomial: { object: [/\bpolynomial\w*\b|\bquadratic\w*\b|discriminant|[xy]\s*(?:\^|\*\*)\s*[2-9]|x[²³⁴]/i], operation: [/substitut\w*|factor\w*|root\w*|discriminant|complete\s+the\s+square|divide/i] },
  quadratic: { object: [/\bquadratic\w*\b|discriminant|x\s*(?:\^|\*\*)\s*2|x²/i], operation: [/root\w*|discriminant|complete\s+the\s+square|boundary|solve|compare/i] },
  "factor-theorem-instance": { object: [/factor\s+theorem|remainder|polynomial|f\s*\([^)]*\)/i], operation: [/substitut\w*|divide|synthetic|factor\w*|root\w*|remainder/i] },
  "simultaneous-equations": { object: [/simultaneous|system|two\s+equations?|intersection|coordinates?/i], operation: [/substitut\w*|eliminat\w*|solve|admissib|check\w*\s+both/i] },
  "inequality-domain": { object: [/inequalit\w*|admissible|solution\s+set|interval|modulus|[<>≤≥]/i], operation: [/sign\s+chart|endpoint|interval|boundary|critical|set\s+notation|inclusion/i] },
  "transformation-graph": { object: [/transform\w*|graph|curve|branch|modulus|coordinate/i], operation: [/map\w*|reflect\w*|translate\w*|stretch|intercept|coordinate|branch/i] },
  "exponential-function": { object: [/exponential|\be\s*\^|exp\s*\(/i], operation: [/logarithm|ln|inverse|linear|positive|isolate|exponentiat/i] },
  "logarithmic-expression": { object: [/logarithm|\bln\b|log\s*[_₀-₉0-9]*\s*\(/i], operation: [/law\w*|base|change|simplif\w*|solve|positive|domain|inverse/i] },
  "coordinate-geometry": { object: [/coordinate|circle|line|tangent|point|radius|gradient/i], operation: [/distance|gradient|perpendicular|intersect|determinant|projection|radius|tangent/i] },
  function: { object: [/\b(?:function|curve|model|stationary|derivative|point|component\s+functions?)s?\b|[A-Za-z]\s*\([^)]*\)\s*=|\bd[A-Za-z]\s*\/\s*d[A-Za-z]/i], operation: [/differentiat\w*|derivative|integrat\w*|gradient|substitut\w*|antiderivative|rate|stationary|endpoint|second\s+derivative|classif\w*|product\s+rule|tangent|normal|slope/i] },
  "derivative-target": { object: [/derivative|differentiat\w*|d[A-Za-z]\s*\/\s*d[A-Za-z]|[A-Za-z]\s*[′']|tangent|normal|gradient/i], operation: [/power\s+rule|chain\s+rule|product\s+rule|quotient\s+rule|gradient|stationary|differentiat\w*|derivative\w*|substitut\w*|tangent|normal|slope/i] },
  "tangent-normal": { object: [/tangent|normal|curve|line/i], operation: [/gradient|perpendicular|point|equation|differentiat\w*/i] },
  "rate-of-change": { object: [/rate\s+of\s+change|\b(?:instantaneous\s+)?rate\b|d[A-Za-z]\s*\/\s*d[A-Za-z]|gradient/i], operation: [/differentiat\w*|per\s+(?:second|time)|gradient|slope|change|d[A-Za-z]\s*\/\s*d[A-Za-z]|product\s+rule/i] },
  "optimisation-constraint": { object: [/optim\w*|maximum|minimum|constraint|feasible|admissible|enclosure/i], operation: [/differentiat\w*|derivative|endpoint|domain|compare|constraint|critical/i] },
  integral: { object: [/integral|integrat\w*|antiderivative|∫/i], operation: [/bound|area|substitut\w*|parts|reverse\s+differentiation|constant|integrat\w*/i] },
  "definite-integral": { object: [/definite\s+integral|integral|bounds?|∫/i], operation: [/bound|area|split|root|signed|integrat\w*|between/i] },
  "trigonometric-triangle": { object: [/triangle|sine\s+rule|cosine\s+rule|sin|cos|tan/i], operation: [/opposite|included|angle|area|side|sine|cosine|half\s*[- ]?ab/i] },
  "trigonometric-identity": { object: [/identity|sin|cos|tan|double\s+angle/i], operation: [/prove|equivalent|factor|double|rewrite|simplif\w*/i] },
  "trigonometric-equation": { object: [/sin|cos|tan|trigonometric\s+equation/i], operation: [/solve|root|angle|factor|identity|interval|general\s+solution/i] },
  "probability-events": { object: [/probabil\w*|event|sample\s+space|P\s*\(|outcomes?|report(?:ed)?\s+colour/i], operation: [/multiply|conditional|independent|tree|union|intersection|given|Bayes|count|probabil\w*|outcomes?|sample\s+space|∩|×|ratio|share|among|\|/i] },
  "probability-tree": { object: [/tree|branch|event/i], operation: [/probabil\w*|multiply|conditional|branch|without\s+replacement/i] },
  "conditional-probability": { object: [/conditional|conditioning|P\s*\([^)]*\|[^)]*\)|given\s+that|without\s+replacement|condition\w*|ordered\s+outcomes?/i], operation: [/divide|intersection|given|conditional|conditioning|Bayes|denominator|event|ratio|fraction|share|among|condition\w*|outcomes?|sample\s+space|\|/i] },
  "vector-components": { object: [/vector|component|dot\s+product/i], operation: [/dot|component|magnitude|scalar|product|direction|coordinate/i] },
  "membrane-gradient": { object: [/membrane|\bwater\b|water[- ]?potential|solute|concentration|osmosis|gradient|transport|carrier|pump|ATP|energy|sucrose|potato|tissue|solution|mass\s+change/i], operation: [/gradient|water[- ]?potential|potential|osmosis|solute|turgor|direction|flow|higher|lower|active|facilitated|diffusion|ATP|energy|movement|mass|sucrose|concentration|zero|crossing|isotonic|blot/i] },
  "membrane-model": { object: [/membrane|bilayer|phospholipid|cholesterol|protein/i], operation: [/fluid|component|permeab\w*|lateral|transport|structure|function|disrupt/i] },
  "enzyme-assay": { object: [/enzyme|substrate|active\s+site|assay|initial\s+rate|product\s+readings?|rate\s+data/i], operation: [/rate|catalys\w*|temperature|pH|inhibit\w*|denatur\w*|active\s+site|substrate|product|factor|gradient/i] },
  micrograph: { object: [/micrograph|microscop\w*|scale\s+bar/i], operation: [/magnif\w*|resol\w*|scale|image|object|size|convert/i] },
  "dna-sequence": { object: [/\bDNA\b|\bRNA\b|codon|sequence|strand/i], operation: [/complement|base|transcrib\w*|translat\w*|codon|strand|pair/i] },
  "controlled-experiment": { object: [/experiment|investigation|assay|sample|treatment|control\w*|measurement|data|absorbance|disc|solvent/i], operation: [/control\w*|variable|replicat\w*|random|uncertaint\w*|valid\w*|reliab\w*|measure|temperature|absorbance|permeab\w*|equal|compare|disc|solvent/i] },
  "biological-molecule": { object: [/polymer|monomer|carbohydrat\w*|lipid|protein|amino\s+acid|DNA|RNA/i], operation: [/bond|structure|hydrolys\w*|condens\w*|glycerol|fatty\s+acid|peptide|fold\w*|function/i] },
  "cell-ultrastructure": { object: [/cell|organelle|nucleus|mitochond\w*|ribosome|micrograph|pellet|fraction|hierarchy|organisation|organization|tissue|level/i], operation: [/structure|function|visible|magnif\w*|resolution|homogenate|centrifug\w*|pellet|fraction|hierarch|nested|order|level/i] },
  "table-dataset": { object: [/table|dataset|data\s+set|readings?|measurements?|data|volume|energy|radii|values?/i], operation: [/gradient|trend|compare|plot|calculate|rate|mean|uncertaint\w*|interpret|radii|electronegativ|dipole|boiling|volume|time/i] },
  "graph-dataset": { object: [/graph|plot|trend|gradient|profile|data|rate|temperature/i], operation: [/gradient|area|plot|read|trend|rate|intercept|interpret|compare|factor|increase|calculate|ratio/i] },
  "chemical-equation": { object: [/equation|reaction|reactant|product|species|formula|→|⟶|⇌/i], operation: [/balance|stoichiometr\w*|charge|coefficient|react\w*|product|equation/i] },
  "stoichiometric-data": { object: [/mole|\bmol\b|amount|mass|concentration|volume|ratio|reagent|solution|yield|purity|\bn\s*\([^)]*\)|\bc\s*\([^)]*\)/i], operation: [/equation|react\w*|ratio|convert|molar|titr\w*|limiting|yield|mass|volume|concentration|calculate|amount|\bn\s*\([^)]*\)|\bc\s*\([^)]*\)/i] },
  "titration-dataset": { object: [/titr\w*|titre|burette|aliquot|endpoint|equivalence|cm³|dm³|\bmol\b|acid|alkali|base|volume/i], operation: [/concentration|neutralis\w*|volume|titre|average|endpoint|pipette|calculate|amount|ratio|\bn\s*\([^)]*\)/i] },
  "equilibrium-system": { object: [/equilibrium|reversible|Kc|Kp|⇌|partial\s+pressure|\[[A-Z][^\]]*\]|p\s*\([^)]*\)/i], operation: [/rate|Le\s+Chatelier|position|quotient|compress\w*|temperature|concentration|reactant|product|forward|reverse|Kc|Kp|ratio|substitut\w*|\[[A-Z][^\]]*\]|p\s*\([^)]*\)/i] },
  "mass-spectrum": { object: [/mass\s+spectr|m\s*\/\s*z|isotope|peak/i], operation: [/fragment|abundance|molecular|ion|ratio|identify|assign/i] },
  "electron-configuration": { object: [/electron\s+configur|sub[- ]shell|shell|1s|2p|3d|ionisation|ionisation[- ]energy|shell\s+boundary/i], operation: [/fill|remove|order|jump|occup\w*|configuration|electron|sub[- ]shell|ionisation|trend|exception|boundary/i] },
  "molecular-structure": { object: [/molecule|structure|Lewis|VSEPR|formula|shape|isomer|intermolecular|bond|compound|dipole|electronegativ\w*|boiling|melting/i], operation: [/bond|dipole|angle|electron|lone\s+pair|shape|geometry|isomer|force|attraction|boil\w*|melt\w*|polar|electronegativ\w*/i] },
  "redox-species": { object: [/oxid\w*|reduc\w*|redox|half[- ]equation|electron\s+transfer/i], operation: [/electron|charge|balance|half[- ]equation|oxidation|reduction|transfer/i] },
  "gas-data": { object: [/ideal\s+gas|gas|pV\s*=|pressure|volume|temperature|kelvin/i], operation: [/SI|rearrang\w*|pV\s*=|substitut\w*|kelvin|absolute|gas\s+equation|pressure|volume/i] },
  "bonding-model": { object: [/bond|lattice|molecule|ionic|covalent|metallic|dipole|electronegativ|intermolecular|force/i], operation: [/electron|sharing|transfer|delocal|shape|attraction|conduct|melting|hydrogen|polar|surface|boiling|force/i] },
  "particle-model": { object: [/particle|collision|activation\s+energy|energy\s+profile|catalyst/i], operation: [/successful|surface|temperature|catalys\w*|activation|collision|rate|energy/i] },
  "numeric-data": { object: [/data|measurement|reading|value|table|rate|temperature|concentration|volume|radii|values?/i], operation: [/calculate|gradient|ratio|percentage|convert|compare|mean|rate|substitut\w*|factor|increase|trend|difference|divide|multiply|interpolat\w*|extrapolat\w*|average/i] },
};

function capabilityRouteUsesStructure(kind: CapabilityStructureKind, route: string): boolean {
  const cues = CAPABILITY_ROUTE_CUES[kind];
  if (!cues) return false;
  // Keep the object and operation in the same short reasoning window.  A
  // route that says “use the supplied radical” in one paragraph and then
  // solves an unrelated numeric expression in another must not pass merely
  // because both words occur somewhere in the worked answer.
  const segments = evidenceSegments(route);
  return segments.some((segment, index) => {
    const window = `${segment}\n${segments[index + 1] ?? ""}`;
    return cues.object.some((pattern) => pattern.test(window)) &&
      cues.operation.some((pattern) => pattern.test(window));
  });
}

function requiredRouteStructures(
  structural: CapabilityStructureContract,
  actual: ReadonlySet<CapabilityStructureKind>,
): { direct: CapabilityStructureKind[]; alternatives: CapabilityStructureKind[][] } {
  return {
    direct: (structural.requiredStructures ?? []).filter((kind) => actual.has(kind)),
    // A structure group is an alternative representation of the same skill.
    // Keep every represented alternative so the route can demonstrate the one
    // it actually uses; choosing the first item would make the ordering of a
    // contract create false “not required” failures.
    alternatives: (structural.requiredStructureGroups ?? [])
      .map((group) => group.filter((kind) => actual.has(kind)))
      .filter((group) => group.length > 0),
  };
}

/**
 * Return a hard failure when a mapped non-recall capability is merely
 * decorative.  Structural presence in the prompt is necessary but not
 * sufficient: the worked route must carry out an operation on each required
 * structure.  This is intentionally a conservative ablation proxy; it does
 * not claim to prove a full symbolic solution, but it reliably rejects an
 * unrelated target such as “use the supplied radical to calculate 2 + 2”.
 */
export function capabilityNotRequiredReason(
  contract: CapabilityEvidenceContract | undefined,
  part: QuestionPart,
): string | null {
  const structural = contract?.structuralContract;
  const derivation = contract?.derivation;
  if (!contract || !structural || !derivation || part.learning?.demand === "recall") return null;
  const setup = learnerVisibleSetup(part.prompt);
  const fingerprint = setupFingerprintFor(contract.capabilityId, setup);
  const actual = new Set(fingerprint.structures);
  const requirements = requiredRouteStructures(structural, actual);
  // Other capability-evidence diagnostics own missing setup structures. Do
  // not add a second “not required” message when the task is incomplete.
  const expectedDirect = structural.requiredStructures ?? [];
  const expectedGroups = structural.requiredStructureGroups ?? [];
  if (!expectedDirect.length && !expectedGroups.length) return null;
  if (expectedDirect.some((kind) => !actual.has(kind)) ||
      expectedGroups.some((group) => !group.some((kind) => actual.has(kind)))) return null;
  const route = `${derivation.intermediateResults.join("\n")}\n${derivation.finalResult}\n${part.markScheme.join("\n")}\n${part.modelAnswer}`.trim();
  if (!route) return `Mapped capability ${contract.capabilityId} has no worked route; the task can be completed without demonstrating it.`;
  for (const kind of requirements.direct) {
    if (!capabilityRouteUsesStructure(kind, route)) {
      return `Mapped capability structure ${kind} is supplied, but the worked route never uses it; the task can be completed without ${kind}.`;
    }
  }
  for (const alternatives of requirements.alternatives) {
    if (!alternatives.some((kind) => capabilityRouteUsesStructure(kind, route))) {
      const kinds = alternatives.join(" | ");
      return `Mapped capability structure group ${kinds} is supplied, but the worked route never uses any permitted representation; the task can be completed without the mapped capability.`;
    }
  }
  return null;
}

function meaningfulEvidenceTokens(value: string): string[] {
  const stopWords = new Set([
    "about", "after", "before", "because", "could", "gives", "given", "into", "rather", "result", "results",
    "stated", "their", "there", "these", "using", "which", "with", "from", "then", "than", "this", "that",
    "supplied", "displayed", "derived", "derives", "conclusion", "conclusions", "constraint", "constraints",
    "capability", "primary", "secondary", "route", "step", "steps", "quantity", "quantities", "value", "values",
    "answer", "answers", "reports", "report", "shows", "shown", "therefore", "hence", "thus", "would", "should",
  ]);
  const aliases: Record<string, string> = {
    activity: "rate", activities: "rate", specific: "normalised", normalised: "normalised", normalized: "normalised",
    rates: "rate", amount: "amount", amounts: "amount", mole: "amount", moles: "amount", molar: "concentration",
    concentrations: "concentration", concentration: "concentration", pressures: "pressure", pressure: "pressure",
    volumes: "volume", volume: "volume", areas: "area", area: "area", lengths: "length", length: "length",
    gradients: "gradient", gradient: "gradient", probabilities: "probability", probability: "probability",
    equations: "equation", equation: "equation", roots: "root", root: "root", derivatives: "derivative", derivative: "derivative",
    integrals: "integral", integral: "integral", energies: "energy", energy: "energy", masses: "mass", mass: "mass",
    proteins: "protein", protein: "protein", enzymes: "enzyme", enzyme: "enzyme", membranes: "membrane", membrane: "membrane",
    potentials: "potential", potential: "potential", reactions: "reaction", reaction: "reaction", products: "product", product: "product",
    reactants: "reactant", reactant: "reactant", faster: "fast", slower: "slow", higher: "high", lower: "low",
  };
  return [...new Set((value.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [])
    .filter((token) => !stopWords.has(token))
    .map((token) => aliases[token] ?? token))];
}

/**
 * Extract anchors that survive ordinary prose paraphrase.  A symbolic
 * variable/equation anchor is only used as a supplement to semantic words;
 * this prevents a shared “x” from making unrelated synoptic steps appear
 * dependent while still recognising a result such as A(r) = ….
 */
function symbolicEvidenceAnchors(value: string): string[] {
  const normalised = value.replace(/[′’]/g, "'").replace(/\s+/g, " ");
  const anchors = [
    ...[...normalised.matchAll(/\b(?:d[A-Za-z]\s*\/\s*d[A-Za-z]|[A-Za-z][A-Za-z0-9]*(?:\s*'|\s*\([^)]*\))?|[A-Za-z]\d+)\b/g)]
      .map((match) => match[0]!.replace(/\s+/g, "").toLowerCase())
      .filter((value) => value.length <= 12 || /[()='\/]/.test(value)),
    ...numericLiterals(normalised).map((number) => `number:${number}`),
  ];
  return [...new Set(anchors)];
}

function evidenceContributesToConclusion(evidence: string, conclusion: string): boolean {
  const evidenceWords = new Set(meaningfulEvidenceTokens(evidence));
  if (meaningfulEvidenceTokens(conclusion).some((token) => evidenceWords.has(token))) return true;
  const evidenceAnchors = symbolicEvidenceAnchors(evidence);
  const conclusionAnchors = new Set(symbolicEvidenceAnchors(conclusion));
  const sharedNumbers = evidenceAnchors.filter((anchor) => anchor.startsWith("number:") && conclusionAnchors.has(anchor));
  const sharedSymbols = evidenceAnchors.filter((anchor) => !anchor.startsWith("number:") && conclusionAnchors.has(anchor));
  // A shared equation/variable is meaningful when the conclusion also states
  // a derived numeric value or unit; a bare repeated variable is not enough.
  if (sharedSymbols.length > 0 && (sharedNumbers.length > 0 || /(?:=|≈|therefore|hence|so|gives?|yields?|is|are)\b/i.test(conclusion))) return true;
  return sharedNumbers.length > 0 && /(?:=|≈|\b(?:cm|mm|m|s|kg|g|mol|dm|MPa|kPa|J|N|Pa|%|μmol)\b)/i.test(`${evidence} ${conclusion}`);
}

function validateSynopticDerivationStructure(
  contract: CapabilityEvidenceContract,
  part: QuestionPart,
  derivation: NonNullable<CapabilityEvidenceContract["derivation"]> | undefined,
): string[] {
  const failures: string[] = [];
  if (!contract.secondaryCapability && !contract.secondaryCapabilityId) {
    failures.push("Synoptic capability evidence must identify a secondary capability.");
  }
  if (!derivation?.primaryEvidence?.length || !derivation.secondaryEvidence?.length) {
    failures.push("Synoptic derivation must attribute worked evidence to both primary and secondary capabilities.");
  }
  const joiningDependency = derivation?.joiningDependency ?? contract.joiningDependency;
  if (!joiningDependency?.trim()) {
    failures.push("Synoptic derivation must state the dependency joining the two capabilities.");
  }
  if (derivation?.primaryEvidence?.length && derivation.secondaryEvidence?.length) {
    const primary = derivation.primaryEvidence.join(" ");
    const secondary = derivation.secondaryEvidence.join(" ");
    const primaryWords = meaningfulEvidenceTokens(primary);
    const secondaryWords = meaningfulEvidenceTokens(secondary);
    // Symbolic-only steps (for example r² = … followed by A′ = …) often
    // have no prose tokens.  An empty/empty comparison is inconclusive and
    // must not turn every exact-maths synoptic into a false duplicate.
    if (primaryWords.length > 0 && secondaryWords.length > 0 && arraysEqualAsSets(primaryWords, secondaryWords)) {
      failures.push("Synoptic primary and secondary evidence collapse to the same reasoning step.");
    }
    const worked = `${part.markScheme.join("\n")}\n${part.modelAnswer}`;
    for (const evidence of [...derivation.primaryEvidence, ...derivation.secondaryEvidence]) {
      if (!evidencePhrasePresent(worked, evidence)) failures.push(`Synoptic attributed step is not present in the worked route: ${evidence}.`);
    }
    const primaryOverlap = evidenceContributesToConclusion(primary, derivation.finalResult);
    const secondaryOverlap = evidenceContributesToConclusion(secondary, derivation.finalResult);
    if (!primaryOverlap || !secondaryOverlap) {
      failures.push("Synoptic final conclusion does not depend on evidence from both capabilities.");
    }
  }
  if (joiningDependency && !/\b(?:because|therefore|while|whereas|using|through|depends?|requires?|constrain|link|connect|combine|together|so|when|if|and)\b/i.test(joiningDependency)) {
    failures.push("Synoptic joining dependency must describe how the two capabilities interact.");
  }
  return failures;
}

/** Capability contracts for the current deep-covered Maths/Biology/Chemistry
 * queue.  The fallback is intentionally undefined: an uncontracted
 * capability is a scaffold until an author defines its setup schema. */
export function capabilityStructureContract(subjectId: string, capabilityId: string): CapabilityStructureContract | undefined {
  const id = capabilityId.toLowerCase();
  const family = subjectFamily(subjectId) ?? subjectFamily(capabilityId);
  if (family === "maths" || id.startsWith("math.")) {
    if (/math\.algebra\.sp-01$/.test(id)) return makeStructureContract(["radical-expression"], { requiredOperations: ["simplify"], expectedOutputTypes: ["exact-form"], invalidSubstituteStructures: ["polynomial"] });
    if (/math\.algebra\.sp-02$/.test(id)) return makeStructureContract(["polynomial", "quadratic"], { requiredOperationGroups: [["solve", "correct", "identify", "combine", "explain", "calculate"]], invalidSubstituteStructures: ["radical-expression"] });
    if (/math\.algebra\.sp-03$/.test(id)) return makeStructureContract(["polynomial", "factor-theorem-instance"], { requiredOperations: ["factor"], invalidSubstituteStructures: ["quadratic"] });
    if (/math\.algebra\.sp-04$/.test(id)) return makeStructureContract(["simultaneous-equations"], { requiredOperationGroups: [["solve", "calculate", "explain", "identify", "correct", "compare"]] });
    if (/math\.algebra\.sp-05$/.test(id)) return makeStructureContract(["inequality-domain"], { requiredOperationGroups: [["solve", "correct", "identify", "combine", "explain", "calculate", "justify"]], invalidSubstituteStructures: ["polynomial"] });
    if (/math\.algebra\.sp-06$/.test(id)) return makeStructureContract(["transformation-graph"], { requiredOperationGroups: [["compare", "calculate", "explain", "identify", "correct", "predict", "combine", "justify"]] });
    if (/math\.exponentials\.sp-01$/.test(id)) return makeStructureContract(["exponential-function", "logarithmic-expression"], { requiredOperationGroups: [["solve", "calculate", "simplify", "explain", "compare"]] });
    if (/math\.exponentials\.sp-02$/.test(id)) return makeStructureContract(["logarithmic-expression"], { requiredOperationGroups: [["simplify", "solve", "calculate", "explain", "compare"]] });
    if (/math\.exponentials\.sp-03$/.test(id)) return makeStructureContract(["exponential-function", "logarithmic-expression"], { requiredOperationGroups: [["solve", "calculate", "simplify", "explain", "compare"]] });
    if (/math\.coordinate-geometry\.sp-/.test(id)) return makeStructureContract(["coordinate-geometry"], { requiredOperationGroups: [["calculate", "find", "determine", "show", "compare", "explain", "identify", "correct"]] });
    if (/math\.differentiation\.sp-01$/.test(id)) return makeStructureContract(["function", "derivative-target"], { requiredOperations: ["differentiate"] });
    if (/math\.differentiation\.sp-02$/.test(id)) return makeStructureContract(["function", "derivative-target"], { requiredOperations: ["differentiate"] });
    if (/math\.differentiation\.sp-03$/.test(id)) return makeStructureContract(["function", "derivative-target"], { requiredOperations: ["differentiate"], requiredRelationships: ["stationary"] });
    if (/math\.differentiation\.sp-04$/.test(id)) return makeStructureContract([], { requiredStructureGroups: [["function", "derivative-target", "tangent-normal", "rate-of-change", "optimisation-constraint", "coordinate-geometry"]] });
    if (/math\.integration\.sp-01$/.test(id)) return makeStructureContract(["function", "integral"], { requiredOperations: ["integrate"] });
    if (/math\.integration\.sp-02$/.test(id)) return makeStructureContract(["integral", "definite-integral"], { requiredOperations: ["integrate"] });
    if (/math\.integration\.sp-03$/.test(id)) return makeStructureContract(["integral"], { requiredOperations: ["integrate"] });
    if (/math\.trigonometry\.sp-01$/.test(id)) return makeStructureContract(["trigonometric-triangle"], { requiredOperationGroups: [["calculate", "solve", "show", "explain", "compare", "identify", "correct"]] });
    if (/math\.trigonometry\.sp-02$/.test(id)) return makeStructureContract(["trigonometric-identity"], { requiredOperationGroups: [["simplify", "prove", "show", "explain", "identify", "correct"]] });
    if (/math\.trigonometry\.sp-03$/.test(id)) return makeStructureContract(["trigonometric-equation"], { requiredOperationGroups: [["solve", "calculate", "show", "explain", "identify", "correct"]] });
    if (/math\.trigonometry\.sp-04$/.test(id)) return makeStructureContract(["trigonometric-equation"], { requiredOperationGroups: [["calculate", "solve", "show", "explain", "identify", "correct"]] });
    if (/math\.conditional-probability\.sp-01$/.test(id)) return makeStructureContract(["conditional-probability", "probability-events"], { requiredOperations: ["probability"] });
    if (/math\.conditional-probability\.sp-02$/.test(id)) return makeStructureContract(["conditional-probability", "probability-events"], { requiredOperations: ["probability"] });
    if (/math\.conditional-probability\.sp-03$/.test(id)) return makeStructureContract(["conditional-probability", "probability-events"], { requiredOperations: ["probability"] });
    if (/math\.probability/.test(id)) return makeStructureContract(["probability-events"], { requiredOperations: ["probability"] });
  }
  if (family === "biology" || id.startsWith("bio.")) {
    if (/bio\.biological-molecules\.sp-01$/.test(id)) return makeStructureContract(["biological-molecule"], { requiredOperations: ["explain"] });
    if (/bio\.biological-molecules\.sp-02$/.test(id)) return makeStructureContract(["biological-molecule"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate", "select"]] });
    if (/bio\.biological-molecules\.sp-03$/.test(id)) return makeStructureContract(["biological-molecule"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate"]] });
    if (/bio\.biological-molecules\.sp-04$/.test(id)) return makeStructureContract(["biological-molecule"], { requiredOperationGroups: [["explain", "calculate", "compare", "identify", "correct", "predict"]] });
    if (/bio\.biological-molecules\.sp-05$/.test(id)) return makeStructureContract(["biological-molecule"], { requiredOperations: ["compare"] });
    if (/bio\.biological-molecules\.sp-06$/.test(id)) return makeStructureContract(["membrane-gradient"], { requiredOperationGroups: [["explain", "calculate", "measure", "compare", "identify", "correct", "predict"]] });
    if (/bio\.cell-structure\.sp-01$/.test(id)) return makeStructureContract(["cell-ultrastructure"], { requiredOperationGroups: [["compare", "identify", "correct", "explain"]] });
    if (/bio\.cell-structure\.sp-02$/.test(id)) return makeStructureContract(["cell-ultrastructure"], { requiredOperationGroups: [["explain", "compare", "calculate", "identify", "correct", "predict"]] });
    if (/bio\.cell-structure\.sp-03$/.test(id)) return makeStructureContract(["micrograph"], { requiredOperationGroups: [["calculate", "explain", "compare", "identify", "correct"]] });
    if (/bio\.cell-structure\.sp-04$/.test(id)) return makeStructureContract(["cell-ultrastructure"], { requiredOperationGroups: [["compare", "identify", "correct", "explain", "calculate", "report"]] });
    if (/bio\.cell-structure\.sp-05$/.test(id)) return makeStructureContract(["cell-ultrastructure"], { requiredOperationGroups: [["explain", "compare", "calculate", "identify", "correct", "predict"]] });
    if (/bio\.membranes-transport\.sp-01$/.test(id)) return makeStructureContract(["membrane-model"], { requiredOperationGroups: [["explain", "calculate", "compare", "identify", "correct", "predict"]], invalidSubstituteStructures: ["enzyme-assay"] });
    if (/bio\.membranes-transport\.sp-02$/.test(id)) return makeStructureContract(["membrane-gradient"], { requiredOperationGroups: [["compare", "explain", "calculate", "predict", "identify", "correct", "select"]] });
    if (/bio\.membranes-transport\.sp-03$/.test(id)) return makeStructureContract(["membrane-gradient"], { requiredOperationGroups: [["explain", "compare", "calculate", "predict", "identify", "correct"]] });
    if (/bio\.membranes-transport\.sp-04$/.test(id)) return makeStructureContract(["membrane-model", "controlled-experiment"], { requiredOperationGroups: [["compare", "interpret", "calculate", "explain", "identify", "correct"]] });
    if (/bio\.membranes-transport\.sp-05$/.test(id)) return makeStructureContract(["membrane-gradient"], { requiredOperationGroups: [["explain", "compare", "calculate", "predict", "identify", "correct"]] });
    if (/bio\.enzymes\.sp-01$/.test(id)) return makeStructureContract(["enzyme-assay"], { requiredOperations: ["explain"] });
    if (/bio\.enzymes\.sp-02$/.test(id)) return makeStructureContract(["enzyme-assay"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate", "predict"]] });
    // Rate-versus-substrate, temperature and inhibition questions can be
    // qualitative enzyme-assay work or graph/data interpretation. Requiring
    // both structures made a valid mechanism explanation look incomplete.
    if (/bio\.enzymes\.sp-03$/.test(id)) return makeStructureContract([], { requiredStructureGroups: [["enzyme-assay", "graph-dataset", "numeric-data"]], requiredOperationGroups: [["compare", "calculate", "estimate", "explain", "predict", "identify", "correct"]] });
    if (/bio\.enzymes\.sp-04$/.test(id)) return makeStructureContract(["enzyme-assay", "graph-dataset"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate", "predict"]] });
    if (/bio\.enzymes\.sp-05$/.test(id)) return makeStructureContract(["graph-dataset"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate", "predict"]] });
    if (/bio\.nucleic-acids\.sp-01$/.test(id)) return makeStructureContract(["dna-sequence"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate"]] });
    if (/bio\.nucleic-acids/.test(id)) return makeStructureContract(["dna-sequence"], { requiredOperationGroups: [["explain", "compare", "calculate", "identify", "correct", "predict"]] });
  }
  if (family === "chemistry" || id.startsWith("chem.")) {
    if (/chem\.atomic-structure\.sp-01$/.test(id)) return makeStructureContract(["mass-spectrum"], { requiredOperationGroups: [["calculate", "find", "determine", "identify", "explain"]] });
    if (/chem\.atomic-structure\.sp-02$/.test(id)) return makeStructureContract(["mass-spectrum"], { requiredOperationGroups: [["compare", "calculate", "identify", "explain"]] });
    if (/chem\.atomic-structure\.sp-03$/.test(id)) return makeStructureContract(["electron-configuration"], { requiredOperationGroups: [["calculate", "write", "identify", "explain"]] });
    if (/chem\.atomic-structure\.sp-04$/.test(id)) return makeStructureContract(["electron-configuration"], { requiredOperationGroups: [["calculate", "write", "identify", "explain"]] });
    if (/chem\.atomic-structure\.sp-05$/.test(id)) return makeStructureContract([], { requiredStructureGroups: [["electron-configuration", "numeric-data", "bonding-model"]], requiredOperationGroups: [["explain", "calculate", "identify", "compare"]] });
    if (/chem\.moles\.sp-01$/.test(id)) return makeStructureContract(["stoichiometric-data"], { requiredOperationGroups: [["calculate", "explain", "identify", "correct", "compare", "state"]] });
    if (/chem\.moles\.sp-02$/.test(id)) return makeStructureContract(["stoichiometric-data"], { requiredOperationGroups: [["calculate", "explain", "identify", "correct", "compare", "state"]] });
    if (/chem\.moles\.sp-03$/.test(id)) return makeStructureContract(["gas-data"], { requiredOperationGroups: [["calculate", "explain", "identify", "correct", "compare", "state"]] });
    if (/chem\.moles\.sp-04$/.test(id)) return makeStructureContract(["stoichiometric-data"], { requiredOperationGroups: [["calculate", "explain", "identify", "correct", "compare", "state"]] });
    if (/chem\.moles\.sp-05$/.test(id)) return makeStructureContract(["stoichiometric-data"], { requiredOperationGroups: [["calculate", "explain", "identify", "correct", "compare", "state"]] });
    if (/chem\.moles\.sp-06$/.test(id)) return makeStructureContract([], { requiredStructureGroups: [["titration-dataset", "stoichiometric-data"]], requiredOperationGroups: [["calculate", "explain", "compare", "identify", "correct", "state"]] });
    if (/chem\.bonding\.sp-01$/.test(id)) return makeStructureContract(["bonding-model", "molecular-structure"], { requiredOperationGroups: [["explain", "compare", "identify", "correct", "calculate"]], invalidSubstituteStructures: ["gas-data"] });
    if (/chem\.bonding\.sp-02$/.test(id)) return makeStructureContract(["bonding-model", "molecular-structure"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate"]] });
    if (/chem\.bonding\.sp-03$/.test(id)) return makeStructureContract(["bonding-model", "molecular-structure"], { requiredOperationGroups: [["compare", "explain", "identify", "correct", "calculate"]] });
    if (/chem\.kinetics\.sp-01$/.test(id)) return makeStructureContract(["table-dataset", "numeric-data"], { requiredOperationGroups: [["calculate", "measure", "compare", "explain"]] });
    if (/chem\.kinetics\.sp-02$/.test(id)) return makeStructureContract(["particle-model"], { requiredOperationGroups: [["explain", "compare", "identify", "correct", "calculate"]] });
    if (/chem\.equilibria\.sp-01$/.test(id)) return makeStructureContract(["equilibrium-system"], { requiredOperationGroups: [["explain", "calculate", "compare", "identify", "correct", "state", "write"]] });
    if (/chem\.equilibria\.sp-02$/.test(id)) return makeStructureContract(["equilibrium-system"], { requiredOperationGroups: [["compare", "calculate", "explain", "predict", "identify", "correct", "state", "write"]] });
    if (/chem\.equilibria\.sp-03$/.test(id)) return makeStructureContract(["equilibrium-system"], { requiredOperationGroups: [["compare", "calculate", "explain", "predict", "identify", "correct", "state", "write"]] });
    if (/chem\.acids-bases\.sp-01$/.test(id)) return makeStructureContract(["chemical-equation"], { requiredOperations: ["explain"] });
    if (/chem\.moles/.test(id)) return makeStructureContract(["stoichiometric-data"], { requiredOperations: ["calculate"] });
    if (/chem\.equilibria/.test(id)) return makeStructureContract(["equilibrium-system"], { requiredOperationGroups: [["compare", "calculate", "explain", "predict", "identify", "correct", "state"]] });
    if (/chem\.bonding/.test(id)) return makeStructureContract(["bonding-model"], { requiredOperationGroups: [["explain", "compare", "identify", "correct", "calculate"]] });
    if (/chem\.redox/.test(id)) return makeStructureContract(["redox-species", "chemical-equation"], { requiredOperations: ["balance"] });
  }
  return undefined;
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
  const setup = learnerVisibleSetup(part.prompt);
  const fingerprint = setupFingerprintFor(contract.capabilityId, setup);
  const structureKinds = new Set<CapabilityStructureKind>(CAPABILITY_STRUCTURE_KINDS);
  const structural = contract.structuralContract;
  const demand = part.learning?.demand;
  if (!part.capabilityIds?.includes(contract.capabilityId)) {
    failures.push(`Capability evidence is for ${contract.capabilityId}, but the part maps to ${part.capabilityIds?.join(", ") || "no capability"}.`);
  }
  for (const entity of contract.requiredEntities) {
    // A concrete entity must be present in the student-facing setup.  Finding
    // it only in the answer would make a generic prompt appear specific after
    // the fact.
    const entityKind = entity as CapabilityStructureKind;
    const entityIsStructural = structureKinds.has(entityKind) &&
      Boolean(structural?.requiredStructures?.includes(entityKind) ||
        (demand !== "recall" && structural?.requiredStructureGroups?.some((group) => group.includes(entityKind))));
    if (entityIsStructural) {
      if (!fingerprint.structures.includes(entity as CapabilityStructureKind)) {
        failures.push(`Required capability structure is absent from the learner-visible setup: ${entity}.`);
      }
    } else if (!evidencePhrasePresent(setup, entity)) {
      failures.push(`Required capability entity/representation is absent from the learner-visible setup: ${entity}.`);
    }
  }
  // A recall definition may legitimately name the rule without carrying out
  // the operation.  Every other demand must expose the operation in the
  // learner-visible task; an answer-key verb cannot repair a missing task.
  if (demand !== "recall") for (const operation of contract.requiredOperations) {
    if (!operationEvidencePresent(setup, operation) && !fingerprint.operations.includes(operation.toLowerCase())) {
      failures.push(`Required capability operation is absent from the learner-visible task: ${operation}.`);
    }
  }
  for (const relation of contract.requiredRelations ?? []) {
    if (!evidencePhrasePresent(setup, relation)) failures.push(`Required capability relation is absent from the learner-visible setup: ${relation}.`);
  }

  if (structural) {
    const actual = new Set(fingerprint.structures);
    const canonical = capabilityStructureContract(contract.capabilityId, contract.capabilityId);
    if (canonical) {
      for (const deficit of structuralContractDeficits(structural, canonical)) {
        failures.push(`Stored capability contract is weaker than the canonical contract (${deficit}).`);
      }
    }
    // A recall cell can assess a definition or relationship directly.  The
    // richer problem structure is required as soon as the learner must use,
    // interpret or transfer the capability.  This keeps conceptual recall
    // from being rejected merely because it has no data artefact while still
    // preventing a calculation/application cell from passing on labels.
    if (demand !== "recall") {
      for (const required of structural.requiredStructures ?? []) {
        if (!actual.has(required)) failures.push(`Required capability structure is absent from the learner-visible setup: ${required}.`);
      }
      for (const group of structural.requiredStructureGroups ?? []) {
        if (!group.some((required) => actual.has(required))) {
          failures.push(`No permitted structure in the learner-visible setup satisfies this capability group: ${group.join(" | ")}.`);
        }
      }
      for (const representation of structural.requiredRepresentations ?? []) {
        if (!fingerprint.representations.some((value) => value.toLowerCase() === representation.toLowerCase())) {
          failures.push(`Required capability representation is absent from the learner-visible setup: ${representation}.`);
        }
      }
    }
    if (demand !== "recall") for (const operation of structural.requiredOperations ?? []) {
      if (!operationEvidencePresent(setup, operation) && !fingerprint.operations.includes(operation)) {
        failures.push(`Required structural operation is absent from the learner-visible task: ${operation}.`);
      }
    }
    if (demand !== "recall") for (const group of structural.requiredOperationGroups ?? []) {
      const present = group.some((operation) => operationEvidencePresent(setup, operation) || fingerprint.operations.includes(operation));
      if (!present) failures.push(`No permitted operation in the learner-visible task satisfies this capability group: ${group.join(" | ")}.`);
    }
    for (const relation of structural.requiredRelationships ?? []) {
      const relationMatch = fingerprint.relationships.some((candidate) => evidencePhrasePresent(candidate, relation)) ||
        evidencePhrasePresent(setup, relation);
      if (!relationMatch) failures.push(`Required structural relationship is absent from the learner-visible setup: ${relation}.`);
    }
    const expectedOutput = structural.expectedOutputTypes ?? [];
    if (demand !== "recall" && expectedOutput.length && !expectedOutput.some((value) => fingerprint.outputTypes.includes(value))) {
      failures.push(`Capability output type is not exposed by the learner-visible task: ${expectedOutput.join(", ")}.`);
    }
    const substitutes = (structural.invalidSubstituteStructures ?? []).filter((value) => actual.has(value));
    const required = structural.requiredStructures ?? [];
    const groups = structural.requiredStructureGroups ?? [];
    const hasValidStructure = required.some((value) => actual.has(value)) || groups.some((group) => group.some((value) => actual.has(value)));
    if (substitutes.length && !hasValidStructure) {
      failures.push(`Learner-visible setup contains only invalid substitute structure(s): ${substitutes.join(", ")}.`);
    }
    const authoredFingerprints = [contract.setupFingerprint, part.learning?.setupFingerprint].filter((value): value is CapabilitySetupFingerprint => Boolean(value));
    if (authoredFingerprints.length) {
      const fingerprintFields: Array<Exclude<keyof CapabilitySetupFingerprint, "subject">> = ["structures", "representations", "operations", "relationships", "outputTypes"];
      for (const authoredFingerprint of authoredFingerprints) {
        if (authoredFingerprint.subject && authoredFingerprint.subject !== fingerprint.subject) {
          failures.push("Stored setup fingerprint has the wrong subject family; recompute it from the learner-visible setup.");
        }
        for (const field of fingerprintFields) {
          if (!arraysEqualAsSets((authoredFingerprint[field] ?? []).map(String), (fingerprint[field] ?? []).map(String))) {
            failures.push(`Stored setup fingerprint is stale for ${field}; recompute it from the learner-visible setup.`);
          }
        }
      }
    }
  }
  const derivation = contract.derivation;
  if (structural?.requireDerivationOperation && !derivation) {
    failures.push("Capability contract requires a capability-linked derivation trace.");
  }
  if (derivation) {
    const actual = new Set(fingerprint.structures);
    const worked = `${part.markScheme.join("\n")}\n${part.modelAnswer}`;
    for (const structure of derivation.setupStructures) {
      if (!actual.has(structure)) failures.push(`Capability derivation cites ${structure}, but that structure is not supplied by the setup.`);
    }
    const recallDefinition = demand === "recall" && /^(?:state|define|describe|name|list|identify)$/i.test(derivation.capabilityOperation.trim());
    if (!recallDefinition && !fingerprint.operations.includes(derivation.capabilityOperation.toLowerCase()) &&
        !operationEvidencePresent(setup, derivation.capabilityOperation)) {
      failures.push(`Capability derivation operation is not attributable to the mapped capability: ${derivation.capabilityOperation}.`);
    }
    if (!recallDefinition && !derivationOperationMatchesContract(derivation.capabilityOperation, structural)) {
      failures.push(`Capability derivation operation is not permitted by the mapped capability contract: ${derivation.capabilityOperation}.`);
    }
    if (!recallDefinition && structural?.requireDerivationOperation && derivation.intermediateResults.length === 0) {
      failures.push("Capability derivation must include at least one intermediate result for a non-recall task.");
    }
    for (const intermediate of derivation.intermediateResults) {
      if (!evidencePhrasePresent(worked, intermediate) && !claimMatches(worked, intermediate)) {
        failures.push(`Capability derivation intermediate is not present in the worked route: ${intermediate}.`);
      }
    }
    if (derivation.finalResult && !evidencePhrasePresent(part.modelAnswer, derivation.finalResult)) {
      failures.push("Capability derivation final result is not established by the worked answer.");
    }
  }
  // Legacy synoptic rows carried a free-text family label.  It is not a
  // trustworthy structural claim by itself, so only validate a secondary
  // capability when the author supplied its explicit structural contract.
  if (contract.secondaryCapability && (contract.secondaryCapabilityId || contract.secondaryStructuralContract) && !evidencePhrasePresent(
    `${setup}\n${text}`,
    contract.secondaryCapability,
  )) {
    failures.push(`Secondary synoptic capability is not explicit: ${contract.secondaryCapability}.`);
  }
  if (demand === "synoptic") failures.push(...validateSynopticDerivationStructure(contract, part, derivation));
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
  const operationIsCheckable = /\b(?:calculate|comput\w*|find|determin\w*|obtain|convert|substitut\w*|rearrang\w*|differentiat\w*|integrat\w*|solv\w*|factor\w*|simplif\w*|rationalis\w*|compar\w*|contrast|rank|classif\w*|explain|justif\w*|predict|infer\w*|derive|measure|estimate|condition\w*|probabil\w*|titr\w*|balance|reduc\w*|control\w*|select|identify|correct|divide|multiply|add|subtract)\b/i.test(provenance.operation);
  if (operationIsCheckable && !operationEvidencePresent(workedText, provenance.operation)) {
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

export interface TransferStructureComparison {
  /** True only when the learner must reason over a materially different
   * structure, representation, operation, dependency or output. */
  meaningful: boolean;
  changes: string[];
  base: CapabilitySetupFingerprint;
  transfer: CapabilitySetupFingerprint;
}

function structuralShape(value: string): string {
  return normaliseEvidenceText(value)
    .replace(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function setDifference(left: readonly string[], right: readonly string[]): string[] {
  const other = new Set(right.map((value) => value.toLowerCase()));
  return left.filter((value) => !other.has(value.toLowerCase()));
}

/**
 * Compare a transfer prompt with its baseline at the level of the supplied
 * problem rather than the question id or its prose label.  Pure number swaps
 * and cosmetic context changes deliberately produce no meaningful change.
 */
export function compareTransferStructures(
  subjectId: string,
  basePrompt: string,
  transferPrompt: string,
): TransferStructureComparison {
  const base = setupFingerprintFor(subjectId, basePrompt);
  const transfer = setupFingerprintFor(subjectId, transferPrompt);
  const changes: string[] = [];
  const recordSetChange = (label: string, before: readonly string[], after: readonly string[]): void => {
    const removed = setDifference(before, after);
    const added = setDifference(after, before);
    if (removed.length || added.length) changes.push(`${label}: ${removed.join(", ") || "∅"} → ${added.join(", ") || "∅"}`);
  };
  recordSetChange("structures", base.structures, transfer.structures);
  recordSetChange("representations", base.representations, transfer.representations);
  recordSetChange("operations", base.operations, transfer.operations);
  recordSetChange("outputs", base.outputTypes, transfer.outputTypes);
  const baseRelations = unique(base.relationships.map(structuralShape));
  const transferRelations = unique(transfer.relationships.map(structuralShape));
  recordSetChange("relationship shape", baseRelations, transferRelations);
  // A different set of structural classes is meaningful. A relationship that
  // differs only in numeric literals is intentionally ignored above.
  return { meaningful: changes.length > 0, changes, base, transfer };
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
