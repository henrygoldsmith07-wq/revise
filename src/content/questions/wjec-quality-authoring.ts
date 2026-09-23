import type { CapabilityEvidenceContract, LearningDemand, LearningProvenance, Question } from "@/domain/types";
import { capabilityStructureContract, learnerVisibleSetup, setupFingerprintFor } from "@/domain/subject-assessment-semantic";
import { defineQuestion } from "./authoring";
import { wjecCapabilityForSpecPoint } from "../wjec-subject-capabilities";

const OPERATION_WORDS = [
  "differentiate", "integrate", "substitute", "rearrange", "solve", "factor", "rationalise",
  "gradient", "interpolate", "condition", "compare", "normalise", "balance", "stoichiometry",
  "titrate", "dilute", "oxidise", "reduce", "calculate", "convert", "estimate", "interpret",
  "mechanism", "control", "predict", "justify", "classify", "evaluate", "derive", "reconstruct",
  "distinguish", "recall", "explain", "correct", "measure", "limit", "ratio", "proof",
  "state", "define", "describe", "identify", "apply", "show", "report", "find", "obtain",
  "use", "check", "select", "infer", "test", "reject", "divide", "multiply", "subtract", "add",
  "minimise", "minimize", "maximise", "maximize", "optimise", "optimize", "minimum", "maximum",
  "normal", "volume", "surface", "constraint", "root", "different", "posterior", "weight", "weighted",
  "conditional", "activity", "specific", "pressure", "partial", "amount", "concentration", "reaction",
  "neutralise", "neutralize", "equilibrium", "uncertainty", "percentage", "absolute", "relative",
] as const;

const TOPIC_ENTITIES: Record<string, string[]> = {
  differentiation: ["derivative", "gradient", "function", "tangent", "rate", "area", "volume", "maximum", "minimum", "optimise", "optimize", "constraint"],
  "conditional-probability": ["probability", "conditional", "event", "sample", "tree", "given", "P("],
  integration: ["integral", "area", "antiderivative", "bounds", "function"],
  algebra: ["equation", "root", "quadratic", "indices", "surd", "polynomial"],
  "coordinate-geometry": ["coordinate", "gradient", "circle", "line", "distance"],
  trigonometry: ["triangle", "angle", "sine", "cosine", "length"],
  enzymes: ["enzyme", "substrate", "active site", "rate", "assay"],
  "membranes-transport": ["membrane", "water potential", "osmosis", "solute", "mass"],
  "biological-molecules": ["protein", "starch", "lipid", "DNA", "molecule"],
  "cell-structure": ["cell", "nucleus", "mitochondria", "organelle", "micrograph"],
  "nucleic-acids": ["DNA", "RNA", "base", "sequence", "transcription"],
  moles: ["mole", "concentration", "volume", "titre", "stoichiometric", "amount", "aliquot", "solution"],
  equilibria: ["equilibrium", "Kc", "concentration", "pressure", "reaction"],
  bonding: ["bond", "electron", "shape", "lattice", "polarity"],
  kinetics: ["rate", "collision", "activation energy", "catalyst", "temperature"],
  "atomic-structure": ["atom", "ion", "electron", "isotope", "ionisation"],
  "acids-bases": ["acid", "base", "pH", "proton", "concentration"],
};

/**
 * A topic is still too broad to prove that a generated cell exercises the
 * mapped capability. These hints are the smallest concrete structures a
 * reviewer should see in the setup. When none is present the first hint is
 * retained in the contract so the audit rejects the cell rather than silently
 * downgrading it to a topic-level prompt.
 */
const CAPABILITY_STRUCTURE_HINTS: Array<{ match: RegExp; entities: string[] }> = [
  { match: /^math\.algebra\.sp-01$/, entities: ["surd", "√", "rationalise"] },
  { match: /^math\.algebra\.sp-02$/, entities: ["quadratic", "discriminant", "root"] },
  { match: /^math\.algebra\.sp-03$/, entities: ["polynomial", "factor theorem", "remainder", "root"] },
  { match: /^math\.algebra\.sp-04$/, entities: ["simultaneous", "equation"] },
  { match: /^math\.algebra\.sp-05$/, entities: ["inequality", "interval", "solution set"] },
  { match: /^math\.algebra\.sp-06$/, entities: ["transformation", "modulus", "curve"] },
  { match: /^math\.differentiation\.sp-01$/, entities: ["derivative", "function"] },
  { match: /^math\.differentiation\.sp-02$/, entities: ["chain rule", "product rule", "quotient rule"] },
  { match: /^math\.differentiation\.sp-03$/, entities: ["stationary", "maximum", "minimum"] },
  { match: /^math\.differentiation\.sp-04$/, entities: ["optim", "constraint", "maximum", "minimum"] },
  { match: /^math\.integration\.sp-01$/, entities: ["integral", "antiderivative"] },
  { match: /^math\.integration\.sp-02$/, entities: ["definite", "bounds", "area"] },
  { match: /^math\.integration\.sp-03$/, entities: ["substitution", "integration by parts"] },
  { match: /^math\.trigonometry\.sp-01$/, entities: ["triangle", "sine", "cosine"] },
  { match: /^math\.trigonometry\.sp-02$/, entities: ["identity", "double angle"] },
  { match: /^math\.trigonometry\.sp-03$/, entities: ["radian", "interval", "trigonometric equation"] },
  { match: /^math\.trigonometry\.sp-04$/, entities: ["small angle", "harmonic"] },
  { match: /^math\.conditional-probability\.sp-01$/, entities: ["P(", "conditional", "given"] },
  { match: /^math\.conditional-probability\.sp-02$/, entities: ["independent", "conditional"] },
  { match: /^math\.conditional-probability\.sp-03$/, entities: ["Bayes", "prior", "posterior"] },
  { match: /^bio\.biological-molecules\.sp-01$/, entities: ["condensation", "hydrolysis", "monomer"] },
  { match: /^bio\.biological-molecules\.sp-02$/, entities: ["carbohydrate", "starch", "glycogen"] },
  { match: /^bio\.biological-molecules\.sp-03$/, entities: ["lipid", "fatty acid", "phospholipid"] },
  { match: /^bio\.biological-molecules\.sp-04$/, entities: ["protein", "amino acid", "peptide"] },
  { match: /^bio\.cell-structure\.sp-01$/, entities: ["cell", "organelle", "nucleus"] },
  { match: /^bio\.membranes-transport\.sp-01$/, entities: ["membrane", "osmosis", "water potential"] },
  { match: /^bio\.membranes-transport\.sp-02$/, entities: ["diffusion", "gradient", "membrane"] },
  { match: /^bio\.enzymes\.sp-01$/, entities: ["enzyme", "substrate", "active site"] },
  { match: /^bio\.enzymes\.sp-02$/, entities: ["rate", "enzyme", "temperature"] },
  { match: /^bio\.nucleic-acids\.sp-01$/, entities: ["DNA", "RNA", "base sequence"] },
  { match: /^chem\.atomic-structure\.sp-01$/, entities: ["isotope", "mass spectrum", "m/z"] },
  { match: /^chem\.atomic-structure\.sp-02$/, entities: ["mass spectrum", "fragment"] },
  { match: /^chem\.atomic-structure\.sp-03$/, entities: ["electron", "sub-shell", "configuration"] },
  { match: /^chem\.moles\.sp-01$/, entities: ["mole", "Avogadro", "molar mass"] },
  { match: /^chem\.moles\.sp-02$/, entities: ["n =", "concentration", "volume"] },
  { match: /^chem\.moles\.sp-03$/, entities: ["pV =", "gas", "kelvin"] },
  { match: /^chem\.bonding\.sp-01$/, entities: ["ionic", "covalent", "dative"] },
  { match: /^chem\.bonding\.sp-02$/, entities: ["electronegativity", "dipole", "polar"] },
  { match: /^chem\.bonding\.sp-03$/, entities: ["intermolecular", "hydrogen bond", "dispersion"] },
  { match: /^chem\.kinetics\.sp-01$/, entities: ["rate", "graph", "gradient"] },
  { match: /^chem\.kinetics\.sp-02$/, entities: ["collision", "activation energy", "catalyst"] },
  { match: /^chem\.equilibria\.sp-01$/, entities: ["equilibrium", "reversible", "forward"] },
  { match: /^chem\.equilibria\.sp-02$/, entities: ["Le Chatelier", "pressure", "temperature"] },
  { match: /^chem\.acids-bases\.sp-01$/, entities: ["acid", "base", "proton"] },
];

function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  const normalised = text.toLowerCase().replace(/[−–—]/g, "-").replace(/\s+/g, " ");
  const wordPhrase = /^[a-z0-9]+(?:[ -][a-z0-9]+)*$/i.test(phrase.trim());
  if (!wordPhrase) {
    const compactText = normalised.replace(/\s+/g, "");
    const compactPhrase = phrase.toLowerCase().replace(/\s+/g, "");
    if (compactText.includes(compactPhrase)) return true;
  }
  const suffix = /\s/.test(phrase.trim()) ? "" : "(?:s|es|ed|d)?";
  if (new RegExp(`(?:^|[^a-z0-9])${escaped}${suffix}(?:$|[^a-z0-9])`, "i").test(normalised)) return true;
  if (!/\s/.test(phrase) && phrase.trim().length >= 5) {
    // A small explicit inflection set covers common authoring forms without
    // allowing a substring such as “optim” to match “optimum”.
    const word = phrase.trim().toLowerCase();
    const variants = word.endsWith("e") ? [word, `${word}d`, `${word}s`, `${word.slice(0, -1)}ing`] : [word, `${word}s`, `${word}ed`, `${word}ing`];
    return variants.some((variant) => new RegExp(`(?:^|[^a-z0-9])${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(normalised));
  }
  return false;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function capabilityOperationFor(
  prompt: string,
  observed: readonly string[],
  explicitCommand: string | undefined,
  contract: ReturnType<typeof capabilityStructureContract>,
): string {
  const candidates = uniqueStrings([...observed, ...(explicitCommand ? [explicitCommand] : [])]);
  const aliases: Record<string, readonly string[]> = {
    differentiate: ["differentiate", "differentiated", "differentiate", "derivative", "differentiable", "gradient", "tangent", "normal", "stationary", "rate"],
    integrate: ["integrate", "integrated", "integral", "antiderivative", "area", "displacement", "evaluate", "evaluating"],
    calculate: ["calculate", "compute", "find", "determine", "obtain", "convert", "evaluate", "report", "show", "measure", "measured", "distance", "area", "combine", "combined", "minimise", "minimize", "maximise", "maximize", "optimise", "optimize"],
    explain: ["explain", "why", "because", "justify", "describe", "state", "define", "identify", "predict", "compare", "relate", "apply", "use"],
    compare: ["compare", "contrast", "rank", "classify", "distinguish"],
    solve: ["solve", "find", "determine", "obtain", "calculate"],
    simplify: ["simplify", "rationalise", "rationalize", "prove", "show"],
    select: ["select", "choose", "decide", "identify"],
    predict: ["predict", "infer", "suggest"],
    measure: ["measure", "read", "estimate", "plot", "calculate"],
    control: ["control", "hold", "keep", "replicate", "randomise", "randomize"],
    state: ["state", "define", "describe", "name", "list"],
    write: ["write", "construct", "draw", "show"],
    balance: ["balance", "oxidise", "oxidize", "reduce", "half-equation"],
    probability: ["probability", "conditional", "bayes", "event", "sample space", "without replacement"],
    stoichiometry: ["stoichiometry", "stoichiometric", "mole ratio", "titration", "titre", "limiting reagent", "yield", "purity"],
  };
  const visible = (operation: string): boolean => observed.includes(operation.toLowerCase()) ||
    (aliases[operation.toLowerCase()] ?? [operation]).some((alias) => hasPhrase(prompt, alias));
  for (const required of contract?.requiredOperations ?? []) if (visible(required)) return required;
  for (const group of contract?.requiredOperationGroups ?? []) {
    const permitted = group.find((operation) => visible(operation));
    if (permitted) return permitted;
  }
  return candidates[0] ?? contract?.requiredOperations?.[0] ?? "derive";
}

/** Keep the learner-facing target separate from setup/context prose. */
function promptTargetFor(prompt: string): string {
  const command = prompt.match(/\b(?:state|define|describe|explain|calculate|find|determine|predict|compare|evaluate|identify|correct|show|derive|solve|simplify|apply|interpret|measure|report|justify|use|check|balance|classify|estimate|select|infer|obtain|test|reject|choose|give|name|list|write|draw|sketch)\b[^.!?\n]*/i)?.[0];
  return (command ?? prompt).replace(/[.!?]+$/, "").trim();
}

/**
 * Build an explicit capability contract from the authored item.  The
 * contract is deliberately small and inspectable: it records the concrete
 * entities, operations and (when present) relations that a reviewer should
 * be able to find in the prompt and solution.
 */
export function capabilityEvidenceFor(
  subject: "maths" | "biology" | "chemistry",
  topic: string,
  capabilityId: string,
  prompt: string,
  scheme: readonly string[],
  answer: string,
  reasoning: string,
): CapabilityEvidenceContract {
  const promptText = learnerVisibleSetup(prompt);
  const topicCandidates = TOPIC_ENTITIES[topic] ?? [];
  // The setup, rather than the model answer, must carry the concrete object
  // being assessed.  Looking at the answer first made a generic prompt appear
  // capability-specific simply because the worked solution named the topic.
  const structureHints = CAPABILITY_STRUCTURE_HINTS.find(({ match }) => match.test(capabilityId))?.entities ?? [];
  const hintedEntities = structureHints.filter((candidate) => hasPhrase(promptText, candidate));
  const topicEntities = topicCandidates.filter((candidate) => hasPhrase(promptText, candidate));
  const structuralContract = capabilityStructureContract(`wjec-alevel-${subject}`, capabilityId);
  const setupFingerprint = setupFingerprintFor(`wjec-alevel-${subject}`, promptText);
  const entities = uniqueStrings([
    ...hintedEntities.slice(0, 3),
    ...topicEntities.slice(0, 3),
  ]);
  if (!entities.length) {
    // Fall back to a concrete authored representation rather than a topic
    // label. If no structure is present, retain the contract's first
    // required structure so the audit fails loudly and the item becomes a
    // repair task instead of passing on answer-key prose.
    const representation = promptText.match(/\b[A-Za-z][A-Za-z0-9′']*\s*(?:\([^)]*\))?\s*(?:=|≈|≤|≥|→|⟶)\s*[^.;\n]{1,50}/)?.[0]?.trim();
    const subjectEntity = promptText.match(/\b(?:function|equation|gradient|probability|enzyme|substrate|membrane|cell|DNA|RNA|molecule|mole|solution|reaction|equilibrium|acid|base|ion|electron|bond|rate|data|sample|species|vector|triangle|quadratic|root|integral|derivative|tangent|circle|sequence|gas|pressure|volume|concentration|titre|titration)\w*\b/i)?.[0];
    entities.push(representation ?? subjectEntity ?? structuralContract?.requiredStructures?.[0] ?? "concrete setup structure");
  }
  // Prefer commands and transformations that are actually visible in the
  // prompt.  A route operation copied only into the answer is not evidence
  // that the setup asked for that capability.
  // Keep only canonical operations that are observable in the setup plus an
  // explicit command word.  Treating every topic noun (“factor”, “different”
  // or “volume”) as a required operation made the contract self-contradictory
  // and allowed labels to stand in for actual work.
  const setupOperations = setupFingerprint.operations;
  const explicitCommands = [...promptText.matchAll(/\b(?:state|define|describe|explain|calculate|recalculate|find|determine|predict|compare|evaluate|identify|correct|show|derive|write|give|classify|suggest|justify|use|deduce|sketch|solve|estimate|outline|apply|choose|decide|interpret|reconstruct|combine|check|convert|minimi[sz]e|maximi[sz]e|optimise|optimize|select|repair|test|reject|name|list|construct|formulate|balance|draw|infer|read|plot|measure|obtain|verify|confirm|discuss|assess|analyse|analyze|track|follow|build|relate|separate|map|translate|recover|weight|rank|distinguish|match|report|differentiate|simplify|rationalise|rationalize|integrate|factor|substitute|rearrange|prove)\b/gi)];
  const explicitCommand = explicitCommands.at(-1)?.[0];
  const promptOperations = uniqueStrings([...setupOperations, ...(explicitCommand ? [explicitCommand] : [])]);
  // Operations are sourced from the learner-visible task only. A worked
  // answer can add derivation detail but cannot invent the capability being
  // assessed.
  const operations = uniqueStrings(promptOperations);
  if (!operations.length) {
    const command = promptText.match(/\b(?:state|define|describe|explain|calculate|find|determine|predict|compare|evaluate|identify|correct|show|derive|solve|apply|interpret|measure|report|justify|use|check|balance|classify|estimate|select|infer|obtain|test|reject)\w*\b/i)?.[0];
    operations.push(command ?? structuralContract?.requiredOperations?.[0] ?? `${subject} operation`);
  }
  const relations = uniqueStrings((promptText.match(/(?:[A-Za-z][A-Za-z0-9′']*\s*(?:=|≈|≤|≥|→|⟶)\s*[^.;\n]{1,70})/g) ?? []).slice(0, 2));
  const capabilityOperation = capabilityOperationFor(promptText, setupOperations, explicitCommand, structuralContract) ||
    operations[0] || structuralContract?.requiredOperations?.[0] || (reasoning.trim() || `${subject} operation`);
  const derivation = {
    setupStructures: setupFingerprint.structures,
    capabilityOperation,
    intermediateResults: scheme.slice(0, 12),
    finalResult: answer.trim() || "authored result",
  };
  return {
    capabilityId,
    requiredEntities: entities,
    requiredOperations: operations.slice(0, 4),
    ...(relations.length ? { requiredRelations: relations } : {}),
    ...(structuralContract ? { structuralContract } : {}),
    setupFingerprint,
    derivation,
  };
}

/** Split prose without treating decimal points as sentence boundaries. */
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
    const value = text.slice(start, index + (character === "\n" ? 0 : 1)).trim();
    if (value) segments.push(value);
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail) segments.push(tail);
  return segments;
}

function numericLiterals(text: string): string[] {
  return [...text.matchAll(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?/gi)]
    .map((match) => match[0]!.replace(/\s+/g, "").replace(/\.$/, "").toLowerCase());
}

function sourceEvidenceFromPrompt(prompt: string): string[] {
  // Use decimal-safe segments first. The old `[^.]` expression truncated
  // `0.55` to `0`, which made a provenance source appear present whenever a
  // prompt happened to contain the same leading digit.
  const equations = evidenceSegments(prompt)
    .filter((segment) => /(?:\b[A-Za-z][A-Za-z0-9′']*\s*(?:\([^)]*\))?\s*=|P\s*\([^)]*\)\s*=)/.test(segment))
    .map((segment) => segment.trim());
  // Record numeric atoms rather than a number plus an open-ended “unit”
  // suffix.  A permissive suffix consumed the next prose word (“6 non-owner”
  // or “1 is a local mini”), so the source was no longer literally present
  // and otherwise sound items looked like invented provenance.
  const quantities = numericLiterals(prompt);
  const named = prompt.match(/\b(?:[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)+|DNA|RNA|ATP|Kc|Kp|pH|NH₃|BF₃|N₂O₄|NO₂)\b/g) ?? [];
  return uniqueStrings([...equations, ...quantities.filter((value) => /\d/.test(value)), ...named]).slice(0, 8);
}

/** Attach inspectable source → operation → intermediate → final provenance. */
export function provenanceFor(
  prompt: string,
  scheme: readonly string[],
  answer: string,
  reasoning: string,
): LearningProvenance {
  const sourceEvidence = sourceEvidenceFromPrompt(prompt);
  const answerSegments = evidenceSegments(answer);
  const answerEquations = answerSegments.filter((segment) => /(?:=|≈|≤|≥|→|⟶)/.test(segment));
  const knownNumbers = new Set(numericLiterals(`${prompt}\n${scheme.join("\n")}`));
  // Include prose calculations (for example “9/16”) only when the segment
  // also shows a supplied/intermediate value.  This records a genuine route
  // while leaving an isolated invented answer (for example “x = 42”) for the
  // provenance gate to reject.
  const answerCalculationSegments = answerSegments.filter((segment) => {
    if (!/\d/.test(segment)) return false;
    const routeCue = /[+−\-×x*/^=≈≤≥→⟶]/.test(segment) ||
      /\b(?:from|using|substitut\w*|rearrang\w*|gives?|equals?|difference|change|ratio|percent|combined?|adding|sum|total|contribut\w*|exact(?:ly)?|approximately|about|round(?:ed|ing)?|precision)\b/i.test(segment);
    if (!routeCue) return false;
    const values = numericLiterals(segment);
    return values.length >= 1 && (values.length >= 2 || values.some((value) => knownNumbers.has(value)));
  });
  const intermediateResults = uniqueStrings([
    ...scheme.map((point) => point.trim()),
    ...answerEquations,
    ...answerCalculationSegments,
  ]).slice(0, 12);
  const explicitFinal = [...answerSegments].reverse().find((segment) =>
    /\b(?:therefore|thus|hence|so|result|answer|conclusion|equals?|gives?|yields?|obtains?)\b/i.test(segment) ||
    /(?:=|≈|≤|≥|→|⟶)/.test(segment),
  );
  const finalResult = (explicitFinal ?? answerSegments.at(-1) ?? scheme.at(-1) ?? answer).trim();
  const workedText = `${scheme.join("\n")}\n${answer}`;
  const reasoningTokens = reasoning.trim().split(/\s+/).map((word) => word.replace(/[^A-Za-z-]/g, "")).filter((word) => word.length >= 5);
  const carriedTokens = reasoningTokens.filter((word) => {
    const stem = word.slice(0, Math.max(5, word.length - 2));
    return new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\w*`, "i").test(workedText);
  }).slice(0, 3);
  const workedOperations = uniqueStrings(OPERATION_WORDS.filter((operationWord) => hasPhrase(workedText, operationWord)));
  const operation = carriedTokens.join(" ") || workedOperations.slice(0, 2).join(" ") || reasoning.trim() || "Author-specified subject operation";
  return {
    sourceEvidence: sourceEvidence.length ? sourceEvidence : [prompt.slice(0, 120).trim()],
    operation,
    intermediateResults,
    finalResult,
  };
}

/** Formatting helper only. Prompts, reasoning, rubrics and solutions are authored
 * separately for every item; this helper never produces question variants.
 */
export function qualityItem(subject: "maths" | "biology" | "chemistry", topic: string, point: number,
  slug: string, demand: LearningDemand, family: string, reasoning: string,
  prompt: string, scheme: string[], answer: string): Question {
  const subjectId = `wjec-alevel-${subject}`;
  const specPoint = `${subjectId}.${topic}.sp-${String(point).padStart(2, "0")}`;
  // Keep the convenience helper honest: if an author accidentally passes one
  // of the old shared-template cues, the cell is a scaffold until it is
  // rewritten with a concrete target and worked evidence. Real quality-pack
  // rows contain their own values, structures and reasoning and therefore
  // remain substantive.
  const authoredText = `${prompt}\n${scheme.join("\n")}\n${answer}`;
  const hasConcreteValues = /\d|[=→⟶]|\b(?:cm|mm|m|s|kg|g|mol|dm|Pa|J|K|°C|%|probability|concentration|mass|volume|rate|data|sample)\b/i.test(prompt);
  const hasConcreteTarget = /(?:\b[A-Za-z]\s*\([^)]*\)\s*=|\b[A-Za-z](?:['′]\s*)?\s*=|\b[A-Za-z]\s*\([^)]*\)|\bP\s*\([^)]*\)|\b(?:probability|gradient|derivative|integral|root|concentration|amount|ratio|percentage|rate|mass|volume|force|energy|yield|purity|uncertainty|titre|titration)\b)/i.test(prompt);
  const hasAuthoredOperation = /\b(?:differentiat\w*|integrat\w*|substitut\w*|rearrang\w*|solv\w*|calculat\w*|convert\w*|divid\w*|multipl\w*|ratio|fraction|gradient|probabil\w*|stoichiometr\w*|equation|formula|mechanism|causal|deriv\w*|power\s+rule|chain\s+rule|mole|charge|balance)\b/i.test(authoredText);
  const fallbackMatch = /appropriate method|stated (?:value|context|constraint|conditions?)|requested (?:value|quantity|result)|target (?:value|quantity|result)|trace\b[^.\n]{0,80}\bto\s+(?:the\s+)?target|cross-check\b[^.\n]{0,80}\binvariant|complete (?:answer|response) must|according to (?:the|your) (?:brief|metadata|mapping)|\bcombine\s+(?:this|the)\s+(?:idea|concept|result)\b[^.\n]{0,80}\b(?:another|a second|an additional)\s+(?:idea|concept|result)\b|(?:the|a|an)\s+(?:relationship|method|concept|invariant)\s+(?:above|given|stated)|(?:the|a|an)\s+(?:diagram|figure|apparatus|spectrum|micrograph|circuit)\s+(?:above|below|shown|provided)|(?:from|in|per)\s+(?:the\s+)?(?:author(?:ing)?\s+)?(?:metadata|brief|mapping|notes?|record)|\b(?:reasoning\s+move|family\s+id|context\s+id|capability\s+mapping|spec(?:ification)?\s+mapping)\b|\{\{[^}]+\}\}|<\s*(?:value|quantity|target|data|variable|compound|organism)\s*>|\[(?:value|quantity|target|data|variable|compound|organism)\]/i.test(authoredText);
  // A generic cue is scaffold only while it remains uninstantiated. If a
  // concrete operation, data and target surround it, the author has supplied
  // enough evidence for the substantive gate to judge the cell itself.
  const genericInstantiated = hasConcreteValues && hasConcreteTarget && hasAuthoredOperation &&
    !/according to (?:the|your) (?:brief|metadata|mapping)/i.test(authoredText) &&
    !/\bcombine\s+(?:this|the)\s+(?:idea|concept|result)\b[^.\n]{0,80}\b(?:another|a second)\s+(?:idea|concept|result)\b/i.test(authoredText);
  const likelyScaffold = fallbackMatch && !genericInstantiated;
  const capabilityId = wjecCapabilityForSpecPoint(specPoint)!;
  const baseCapabilityEvidence = capabilityEvidenceFor(subject, topic, capabilityId, prompt, scheme, answer, reasoning);
  const joiningDependency = `The primary ${capabilityId} step and the ${family} constraint combine to determine the conclusion.`;
  const capabilityEvidence = demand === "synoptic"
    ? {
        ...baseCapabilityEvidence,
        secondaryCapability: family,
        joiningDependency,
        derivation: {
          ...baseCapabilityEvidence.derivation!,
          // Keep the two attributable steps separate. The final mark-scheme
          // point normally states the combined implication, so it is the
          // strongest secondary/conclusion anchor for the removal test.
          primaryEvidence: [scheme[0] ?? answer],
          secondaryEvidence: [scheme[1] ?? scheme.at(-1) ?? answer],
          joiningDependency,
        },
      }
    : baseCapabilityEvidence;
  const provenance = provenanceFor(prompt, scheme, answer, reasoning);
  const promptTarget = promptTargetFor(prompt);
  const expectedResult = provenance.finalResult;
  const derivation = uniqueStrings([provenance.operation, ...provenance.intermediateResults]).slice(0, 16);
  const evidenceSources = provenance.sourceEvidence.slice(0, 16);
  const learning = {
    familyId: `${subject}:${family}`,
    contextId: `${subject}:${slug}`,
    demand,
    reasoningMoves: [reasoning],
    // A generated cell is only substantive when its capability has an
    // explicit structural contract.  Unknown capabilities stay in the
    // authoring queue instead of gaining depth credit from a generic prompt.
    quality: likelyScaffold || !baseCapabilityEvidence.structuralContract ? "scaffold" as const : "substantive" as const,
    promptTarget,
    expectedResult,
    derivation,
    evidenceSources,
    capabilityEvidence,
    setupFingerprint: capabilityEvidence.setupFingerprint,
    provenance,
  };
  return defineQuestion({ slug: `wjec-quality-${subject}-${slug}`, subjectId, topics: [topic], stem: prompt,
    kind: subject === "maths" || demand === "calculation" ? "calculation" : "short",
    source: "generated", verification: "unverified", reviewer: null, lastChecked: null,
    difficulty: demand === "recall" ? 1 : ["transfer", "synoptic"].includes(demand) ? 4 : 3,
    learning: { ...learning, expectedMinutes: Math.max(1, scheme.length * 1.25) },
    parts: [{ prompt, marks: scheme.length, scheme, answer, specPointIds: [specPoint],
      capabilityIds: [capabilityId], learning,
      learningClaims: demand === "synoptic" ? [capabilityId, family] : undefined,
      aos: demand === "recall" ? ["AO1"] : ["transfer", "synoptic"].includes(demand) ? ["AO2", "AO3"] : ["AO2"] }],
  });
}
