// ---------------------------------------------------------------------------
// Structural reasoning graphs and setup fingerprints for transfer/synoptic
// diversity.
//
// Labels alone ("transfer", "synoptic", "Route B") cannot prove that a learner
// meets a new information structure or a new solution path. This module makes
// that structure explicit and comparable:
//
// - SetupFingerprint captures the task setup across eight structural
//   dimensions. Pure number substitution normalises away completely.
// - ReasoningGraph captures the ordered solution path as stable semantic
//   nodes: evidence → operation → intermediate → constraint/check →
//   conclusion. Prose rewordings, numbers, context names, family ids,
//   modeA/modeB labels and "substitute vs recompute" wording contribute
//   nothing; only the semantic nodes count.
// - compareTransferStructures() requires at least one structural change and
//   at least one reasoning-path change.
// - reasoningGraphDistance() + isSupersetRoute() gate Route A/B diversity.
//
// Pure and deterministic; no storage, network or model calls.
// ---------------------------------------------------------------------------

import type {
  Id,
  QuestionPart,
  ReasoningGraph,
  ReasoningGraphNode,
  ReasoningGraphNodeKind,
  SetupFingerprint,
} from "./types";
import {
  evidencePhrasePresent,
  hasSynopticAttribution,
  operationEvidencePresent,
} from "./subject-assessment-semantic";

export type { ReasoningGraph, ReasoningGraphNode, ReasoningGraphNodeKind, SetupFingerprint };

/** Minimum graph distance for two routes to count as materially different. */
export const MIN_REASONING_GRAPH_DISTANCE = 0.35;

/** Words that must never contribute to novelty or distance. */
const NULL_WORDS = new Set([
  "unfamiliar",
  "unfamiliarity",
  "novel",
  "new",
  "different",
  "another",
  "alternative",
  "unknown",
  "unseen",
  "representation",
  "representations",
  "context",
  "contexts",
  "contextual",
  "scenario",
  "situation",
  "case",
  "wrapper",
  "costume",
  "story",
]);

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
  "is", "it", "its", "of", "on", "or", "the", "this", "that", "to", "with",
  "using", "use", "via", "through", "given", "stated", "supplied", "displayed",
]);

function stripNumbers(text: string): string {
  return text
    .replace(/[−–—]/g, "-")
    .replace(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x]\s*10\s*(?:\^|\*\*)?\s*[+-]?\d+)?/gi, "#")
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, "#");
}

function contentTokens(text: string): string[] {
  return stripNumbers(text)
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && token !== "#" && !STOP_WORDS.has(token) && !NULL_WORDS.has(token));
}

/** Canonical operation families. Synonyms collapse; distinct families stay apart. */
const OPERATION_FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ["differentiate", /\b(?:differentiat\w*|derivative|gradient\s+function|power\s+rule|chain\s+rule|product\s+rule|quotient\s+rule)\b/i],
  ["integrate", /\b(?:integrat\w*|antiderivative|area\s+under|definite\s+integral)\b/i],
  ["solve-roots", /\b(?:solve|root|quadratic|discriminant|factor\s+theorem|remainder|synthetic\s+division|simultaneous|elimination)\b/i],
  ["compute-substitute", /\b(?:substitut\w*|recomput\w*|calculat\w*|evaluat\w*|comput\w*|plug\s+in|insert|obtain|derive\s+value)\b/i],
  ["read-graph", /\b(?:read|gradient|tangent|slope|intercept|plot|graph|interpolat\w*|extrapolat\w*|area\s+under\s+curve)\b/i],
  ["infer-hidden", /\b(?:hidden|latent|infer\w*|posterior|prior|bayes|unobserved|missing\s+value|parameter\s+estim)/i],
  ["condition-space", /\b(?:condition\w*|sample\s+space|tree|without\s+replacement|ordered|strat\w*|pool\w*|given\s+that|P\s*\([^)]*\|)\b/i],
  ["optimise", /\b(?:optim\w*|minimis\w*|maximis\w*|minimi[sz]\w*|maximi[sz]\w*|stationary|endpoint|global\s+minimum|global\s+maximum)\b/i],
  ["transform-geometry", /\b(?:transform\w*|modulus|reflect\w*|shift|scale|translat\w*|coordinate|vector|geometry|circle|tangent|normal|chord|midpoint|distance|area)\b/i],
  ["trig-identity", /\b(?:sine|cosine|tangent|identity|double\s+angle|pythagor\w*|harmonic)\b/i],
  ["log-linearise", /\b(?:logarithm|exponential|linearis\w*|change\s+of\s+base|inverse\s+function|half[- ]?life)\b/i],
  ["mole-convert", /\b(?:mole|molar|avogadro|concentration|aliquot|titre|titration|dilut\w*|n\s*=\s*c|n\s*=\s*m)\b/i],
  ["back-titrate", /\b(?:back[- ]?titration|residual|excess|limiting\s+reagent|back\s+titrat\w*)\b/i],
  ["balance-equation", /\b(?:balanc\w*|half[- ]?equation|oxidation|reduction|electron\s+transfer|charge\s+balance|stoichiometr\w*|mole\s+ratio)\b/i],
  ["equilibrium-shift", /\b(?:equilibrium|le\s*chatelier|Kc|Kp|Qc|partial\s+pressure|perturb\w*|shift)\b/i],
  ["transport-gradient", /\b(?:diffusion|osmosis|water\s+potential|pressure\s+potential|solute|turgor|gradient|membrane|permeab\w*)\b/i],
  ["enzyme-mechanism", /\b(?:enzyme|substrate|active\s+site|inhib\w*|catalys\w*|denatur\w*|collision|kinetic)\b/i],
  ["genetic-trace", /\b(?:DNA|RNA|allele|mutation|transcription|translation|codon|replication|semi[- ]?conservative|inherit\w*)\b/i],
  ["cell-analyse", /\b(?:cell|tissue|organ|organelle|micrograph|magnification|resolution|fractionation|ultracentrifugation)\b/i],
  ["control-evaluate", /\b(?:control|replicat\w*|uncertaint\w*|error\s+bar|variable|assay|experiment|sample\s+size|valid\w*)\b/i],
] as const;

const REPRESENTATION_FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ["equation", /\b(?:equation|formula|function|f\s*\(|polynomial|quadratic|simultaneous|identity)\b/i],
  ["graph", /\b(?:graph|plot|curve|tangent|intercept|gradient|axis|figure)\b/i],
  ["table", /\b(?:table|dataset|data\s+set|two[- ]?way\s+table|survey)\b/i],
  ["sample-space", /\b(?:sample\s+space|tree|without\s+replacement|ordered|conditional|P\s*\(|event|outcome|success|failure|birth|component)\b/i],
  ["hidden-parameter", /\b(?:hidden|latent|prior|posterior|unobserved|unknown\s+(?:state|parameter|source)|selected\s+uniformly|operator|report\w*\s+rule)\b/i],
  ["coordinate", /\b(?:coordinate|grid|circle|triangle|vector|matrix|geometry)\b/i],
  ["assay-data", /\b(?:assay|measurement|observation|titre|titration|colorimeter|rate|gradient|area\s+under)\b/i],
  ["membrane-system", /\b(?:membrane|visking|u[- ]?tube|sucrose|tissue|solute|water\s+potential|pressure\s+potential|beetroot|permeab\w*)\b/i],
  ["inhibition-data", /\b(?:inhib\w*|substrate\s+concentration|rate\s+response|active\s+site|denatur\w*)\b/i],
  ["titration-chain", /\b(?:back[- ]?titration|residual|excess|aliquot|burette|limiting\s+reagent)\b/i],
  ["equilibrium-data", /\b(?:equilibrium|Kc|Kp|perturb\w*|concentration|partial\s+pressure|vessel)\b/i],
  ["spectrum", /\b(?:spectrum|fragment|m\/z|isotope|mass\s+spectrum|cleavage)\b/i],
  ["micrograph", /\b(?:micrograph|electron\s+micrograph|scale\s+bar|magnification)\b/i],
] as const;

const CONSTRAINT_FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ["domain", /\b(?:domain|x\s*[>≥]|positive|argument|defined|feasible|admissible|interval|0\s*≤|range)\b/i],
  ["endpoint", /\b(?:endpoint|boundary|closed\s+interval|global|compare\s+.*endpoint|limit\w*\s+case)\b/i],
  ["integer", /\b(?:integer|discrete|permitted\s+value|count|whole\s+number)\b/i],
  ["units", /\b(?:units?|significant\s+figures?|precision|SI|cm³|dm³|kelvin|pascal|mol\s+dm)\b/i],
  ["charge-balance", /\b(?:charge|balanced|half[- ]?equation|oxidation|reduction|electron)\b/i],
  ["water-balance", /\b(?:water\s+potential|pressure\s+potential|osmotic|hydrostatic|turgor)\b/i],
  ["control", /\b(?:control|constant|matched|isotonic|buffered|repeat|replicat\w*|uncertaint\w*)\b/i],
  ["stoichiometric", /\b(?:stoichiometr\w*|limiting|excess|mole\s+ratio|coefficient|conservation)\b/i],
  ["equilibrium-law", /\b(?:equilibrium|Kc|le\s*chatelier|temperature\s+only|position.*rate)\b/i],
] as const;

const EVIDENCE_FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ["supplied-equation", /\b(?:f\s*\(|equation|formula|y\s*=|P\s*\(|pV\s*=|n\s*=)\b/i],
  ["supplied-graph", /\b(?:graph|plot|curve|figure|tangent|intercept)\b/i],
  ["supplied-table", /\b(?:table|dataset|survey|values?\s+are|data\s+values)\b/i],
  ["supplied-measurement", /\b(?:aliquot|titre|assay|measurement|observation|sample|tissue|solution|concentration|mass|volume)\b/i],
  ["inferred-parameter", /\b(?:infer\w*|hidden|latent|posterior|prior|unobserved|missing)\b/i],
  ["coupled-gradient", /\b(?:gradient|coupled|secondary\s+active|ATP|proton\s+gradient)\b/i],
] as const;

const INTERMEDIATE_FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ["stationary-equation", /\b(?:f\s*['′]|stationary|derivative\s*=\s*0|solve\s+f)/i],
  ["roots", /\b(?:root|discriminant|solution\s+set|interval|intersection)\b/i],
  ["optimum-candidate", /\b(?:optimum|candidate|vertex|minimum|maximum|global)\b/i],
  ["gradient-value", /\b(?:gradient|slope|tangent|rate|d[A-Za-z]\s*\/\s*d[A-Za-z])\b/i],
  ["mole-amount", /\b(?:mole|amount|n\s*=|concentration|titre|aliquot)\b/i],
  ["equilibrium-quotient", /\b(?:Kc|Kp|Qc|quotient|position|yield)\b/i],
  ["water-gradient", /\b(?:water\s+potential|pressure\s+potential|gradient|movement|turgor)\b/i],
  ["inhibition-pattern", /\b(?:inhib\w*|Vmax|Km|rate\s+response|active\s+site)\b/i],
  ["genetic-state", /\b(?:strand|template|band|hybrid|allele|genotype|phenotype)\b/i],
] as const;

const CONCLUSION_FAMILIES: ReadonlyArray<readonly [string, RegExp]> = [
  ["optimum", /\b(?:optimum|minimum|maximum|global|best|choose|select.*value)\b/i],
  ["probability", /\b(?:probability|posterior|share|proportion|P\s*\()\b/i],
  ["quantity", /\b(?:amount|concentration|mass|volume|rate|gradient|value|result|answer)\b/i],
  ["movement", /\b(?:movement|direction|flow|gain|loss|turgid|plasmolysed|increase|decrease)\b/i],
  ["mechanism", /\b(?:mechanism|because|therefore|explains?|supports?|requires?)\b/i],
  ["decision", /\b(?:decision|suitable|greener|better|valid|invalid|consistent|inconsistent)\b/i],
] as const;

/** Trivial verification steps that never establish a distinct route. */
const TRIVIAL_CHECK_LABELS = new Set([
  "check-answer",
  "verify-result",
  "compare-sign",
  "compare-ratio",
  "limiting-case-check",
  "cross-check-invariant",
  "endpoint-verify",
  "sign-check",
  "ratio-check",
  "recompute-check",
]);

function familiesMatching(text: string, families: ReadonlyArray<readonly [string, RegExp]>): string[] {
  const out: string[] = [];
  for (const [label, pattern] of families) {
    if (pattern.test(text)) out.push(label);
  }
  return out.sort();
}

function canonicalOperations(text: string): string[] {
  return familiesMatching(text, OPERATION_FAMILIES);
}

function canonicalRepresentations(text: string): string[] {
  return familiesMatching(text, REPRESENTATION_FAMILIES);
}

function canonicalConstraints(text: string): string[] {
  return familiesMatching(text, CONSTRAINT_FAMILIES);
}

function canonicalEvidence(text: string): string[] {
  return familiesMatching(text, EVIDENCE_FAMILIES);
}

function canonicalIntermediates(text: string): string[] {
  return familiesMatching(text, INTERMEDIATE_FAMILIES);
}

function canonicalConclusions(text: string): string[] {
  return familiesMatching(text, CONCLUSION_FAMILIES);
}

/**
 * Relationship topology: how entities relate in the setup (equation solving,
 * graph inference, conditioned space, gradient transport, titration chain…).
 * Numbers, context nouns and "unfamiliar"/"new representation" are ignored.
 */
function topologyOf(prompt: string): string {
  const ops = canonicalOperations(prompt);
  const reps = canonicalRepresentations(prompt);
  const key = [...reps, ...ops].slice(0, 4).join("+");
  if (!key) {
    const tokens = contentTokens(prompt).slice(0, 6).join("+");
    return tokens ? `lexical:${tokens}` : "unspecified";
  }
  return key;
}

function knownVsUnknownOf(prompt: string): string {
  const hasEquation = /(?:=|P\s*\([^)]*\)|f\s*\()/i.test(prompt);
  const hasHidden = /\b(?:hidden|latent|infer\w*|unobserved|unknown\s+(?:state|parameter|source)|prior|posterior|missing)\b/i.test(prompt);
  const hasConditional = /\b(?:given\s+that|condition\w*\s+on|without\s+replacement|ordered|selected\s+uniformly)\b/i.test(prompt);
  const unknowns = (prompt.match(/\b(?:find|determine|calculate|predict|infer|recover|identify)\b/gi) ?? []).length;
  return [
    hasEquation ? "equation-given" : "no-equation",
    hasHidden ? "hidden-present" : "hidden-absent",
    hasConditional ? "conditioned" : "unconditioned",
    unknowns > 1 ? "multi-unknown" : unknowns === 1 ? "single-unknown" : "no-explicit-unknown",
  ].join("+");
}

function hiddenStateOf(prompt: string): string {
  const hits = familiesMatching(prompt, [
    ["hidden-param", /\b(?:hidden|latent|prior|posterior|unobserved|unknown\s+(?:state|parameter|source))\b/i],
    ["conditioned", /\b(?:given\s+that|condition\w*|without\s+replacement|ordered|selected\s+uniformly|reporting\s+rule|protocol|operator)\b/i],
    ["coupled", /\b(?:coupled|secondary\s+active|ATP|gradient|chemiosmosis)\b/i],
    ["implicit", /\b(?:implicit|constraint|feasible|admissible)\b/i],
  ] as const);
  return hits.length ? hits.join("+") : "none";
}

function representationOf(prompt: string): string {
  const reps = canonicalRepresentations(prompt);
  return reps.length ? reps.join("+") : "prose-only";
}

function operationSequenceOf(text: string): string {
  const ops = canonicalOperations(text);
  return ops.length ? ops.join(">") : "unspecified";
}

function suppliedVsInferredOf(prompt: string, answer?: string): string {
  const supplied = /\d|(?:=|P\s*\([^)]*\)|f\s*\([^)]*\)\s*=)/.test(prompt) ? "supplied-values" : "no-values";
  const inferred = answer && /\b(?:infer\w*|therefore|thus|hidden|posterior|compare|interpret)\b/i.test(answer)
    ? "inferred-step"
    : /\b(?:infer\w*|hidden|posterior)\b/i.test(prompt)
      ? "inferred-required"
      : "direct";
  return `${supplied}+${inferred}`;
}

function constraintOf(prompt: string): string {
  const hits = canonicalConstraints(prompt);
  return hits.length ? hits.join("+") : "none";
}

function requestedOutputOf(prompt: string): string {
  const hits = canonicalConclusions(prompt);
  if (hits.length) return hits.join("+");
  if (/\b(?:calculate|find|determine|obtain|report|give|solve)\b/i.test(prompt)) return "quantity";
  if (/\b(?:explain|justify|evaluate|predict|interpret)\b/i.test(prompt)) return "mechanism";
  return "unspecified";
}

/** Build a structural setup fingerprint. Numbers normalise away completely. */
export function fingerprintSetup(prompt: string, answer?: string): SetupFingerprint {
  return {
    relationshipTopology: topologyOf(prompt),
    knownVsUnknown: knownVsUnknownOf(prompt),
    hiddenState: hiddenStateOf(prompt),
    representationType: representationOf(prompt),
    operationSequence: operationSequenceOf(`${prompt}\n${answer ?? ""}`),
    suppliedVsInferred: suppliedVsInferredOf(prompt, answer),
    constraintType: constraintOf(prompt),
    requestedOutput: requestedOutputOf(prompt),
  };
}

function fingerprintFields(fingerprint: SetupFingerprint): Array<[string, string]> {
  return [
    ["relationshipTopology", fingerprint.relationshipTopology],
    ["knownVsUnknown", fingerprint.knownVsUnknown],
    ["hiddenState", fingerprint.hiddenState],
    ["representationType", fingerprint.representationType],
    ["operationSequence", fingerprint.operationSequence],
    ["suppliedVsInferred", fingerprint.suppliedVsInferred],
    ["constraintType", fingerprint.constraintType],
    ["requestedOutput", fingerprint.requestedOutput],
  ];
}

/** Derive an ordered reasoning graph from a part when no authored graph exists. */
export function deriveReasoningGraph(part: QuestionPart, subjectId?: string): ReasoningGraph {
  const fullText = [part.prompt, ...(part.markScheme ?? []), part.modelAnswer].join("\n");
  const moves = (part.learning?.reasoningMoves ?? []).join("\n");
  const combined = `${fullText}\n${moves}`;
  void subjectId;
  const evidence = canonicalEvidence(part.prompt);
  const operations = canonicalOperations(combined);
  const intermediates = canonicalIntermediates(combined);
  const constraints = canonicalConstraints(combined);
  const conclusions = canonicalConclusions(combined);
  const nodes: ReasoningGraphNode[] = [];
  for (const label of evidence.slice(0, 2)) nodes.push({ kind: "evidence", label });
  if (!nodes.length) nodes.push({ kind: "evidence", label: "supplied-setup" });
  for (const label of operations.slice(0, 3)) nodes.push({ kind: "operation", label });
  if (!operations.length) nodes.push({ kind: "operation", label: "unstated-operation" });
  for (const label of intermediates.slice(0, 2)) nodes.push({ kind: "intermediate", label });
  if (!intermediates.length) nodes.push({ kind: "intermediate", label: "direct-result" });
  for (const label of constraints.slice(0, 2)) nodes.push({ kind: "constraint", label });
  if (!constraints.length) nodes.push({ kind: "constraint", label: "no-explicit-check" });
  for (const label of conclusions.slice(0, 1)) nodes.push({ kind: "conclusion", label });
  if (!conclusions.length) nodes.push({ kind: "conclusion", label: "stated-conclusion" });
  return { nodes };
}

/** Stored graph when present, otherwise a derived fallback. */
export function reasoningGraphForPart(part: QuestionPart, subjectId?: string): ReasoningGraph {
  const stored = part.learning?.reasoningGraph;
  if (stored && stored.nodes.length >= 3) return stored;
  return deriveReasoningGraph(part, subjectId);
}

function nodesByKind(graph: ReasoningGraph, kind: ReasoningGraphNodeKind): string[] {
  return graph.nodes.filter((node) => node.kind === kind).map((node) => node.label.toLowerCase().trim()).filter(Boolean);
}

function setOverlap(left: readonly string[], right: readonly string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  let shared = 0;
  for (const item of new Set(left)) if (rightSet.has(item)) shared += 1;
  return shared / Math.max(new Set(left).size, new Set(right).size);
}

function orderSimilarity(left: readonly string[], right: readonly string[]): number {
  if (!left.length || !right.length) return 0;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  let matched = 0;
  let cursor = 0;
  for (const item of shorter) {
    const found = longer.indexOf(item, cursor);
    if (found >= 0) {
      matched += 1;
      cursor = found + 1;
    }
  }
  return matched / shorter.length;
}

export interface GraphDistanceBreakdown {
  inputRepresentation: number;
  evidenceDependencies: number;
  operations: number;
  orderOfOperations: number;
  intermediateStates: number;
  constraintsChecks: number;
  finalInference: number;
  overall: number;
}

/**
 * Conservative graph distance across the seven required dimensions.
 * 0 means the same reasoning; 1 means no shared structure. Numbers, context
 * names, family ids, modeA/modeB, rewritten prose and substitute-vs-recompute
 * wording already collapse in the canonical families above.
 */
export function reasoningGraphDistance(left: ReasoningGraph, right: ReasoningGraph): GraphDistanceBreakdown {
  const leftEvidence = nodesByKind(left, "evidence");
  const rightEvidence = nodesByKind(right, "evidence");
  const leftOps = nodesByKind(left, "operation");
  const rightOps = nodesByKind(right, "operation");
  const leftInter = nodesByKind(left, "intermediate");
  const rightInter = nodesByKind(right, "intermediate");
  const leftCheck = nodesByKind(left, "constraint");
  const rightCheck = nodesByKind(right, "constraint");
  const leftOut = nodesByKind(left, "conclusion");
  const rightOut = nodesByKind(right, "conclusion");
  const inputRepresentation = 1 - setOverlap(leftEvidence, rightEvidence);
  const evidenceDependencies = 1 - setOverlap(leftEvidence, rightEvidence);
  const operations = 1 - setOverlap(leftOps, rightOps);
  const orderOfOperations = 1 - orderSimilarity(leftOps, rightOps);
  const intermediateStates = 1 - setOverlap(leftInter, rightInter);
  const constraintsChecks = 1 - setOverlap(leftCheck, rightCheck);
  const finalInference = 1 - setOverlap(leftOut, rightOut);
  const overall = (inputRepresentation + evidenceDependencies + operations + orderOfOperations + intermediateStates + constraintsChecks + finalInference) / 7;
  return { inputRepresentation, evidenceDependencies, operations, orderOfOperations, intermediateStates, constraintsChecks, finalInference, overall };
}

/** Two routes count as distinct only when their graphs differ materially. */
export function isDistinctReasoningRoute(left: ReasoningGraph, right: ReasoningGraph, threshold: number = MIN_REASONING_GRAPH_DISTANCE): boolean {
  const distance = reasoningGraphDistance(left, right);
  if (distance.overall < threshold) return false;
  // An extra trivial check alone must not establish distinctness: require at
  // least one changed core dependency or representation.
  const leftCore = [...nodesByKind(left, "evidence"), ...nodesByKind(left, "operation"), ...nodesByKind(left, "intermediate")];
  const rightCore = [...nodesByKind(right, "evidence"), ...nodesByKind(right, "operation"), ...nodesByKind(right, "intermediate")];
  const coreOverlap = setOverlap(leftCore, rightCore);
  if (coreOverlap >= 1) return false;
  return distance.operations > 0 || distance.inputRepresentation > 0 || distance.intermediateStates > 0;
}

/**
 * A second route fails when it is Route A plus one trivial verification step
 * (for example substitute → calculate → "check answer"). Require at least one
 * changed core reasoning dependency or representation, not merely an extra check.
 */
export function isSupersetRoute(base: ReasoningGraph, candidate: ReasoningGraph): boolean {
  const baseLabels = new Set(base.nodes.map((node) => node.label.toLowerCase().trim()));
  const extra = candidate.nodes.filter((node) => !baseLabels.has(node.label.toLowerCase().trim()));
  if (!extra.length) return true;
  const nonTrivial = extra.filter((node) => {
    const label = node.label.toLowerCase().trim();
    if (TRIVIAL_CHECK_LABELS.has(label)) return false;
    if (node.kind === "constraint" && /check|verify|compare|confirm|validate/i.test(label)) {
      const coreOps = new Set([...nodesByKind(base, "operation"), ...nodesByKind(base, "evidence"), ...nodesByKind(base, "intermediate")]);
      if (!coreOps.has(label)) return false;
    }
    return true;
  });
  // Missing a base core node is a change, not a superset. A pure superset keeps
  // every base core node and adds only trivial checks.
  const baseCore = base.nodes.filter((node) => node.kind === "evidence" || node.kind === "operation" || node.kind === "intermediate");
  const candidateLabels = new Set(candidate.nodes.map((node) => node.label.toLowerCase().trim()));
  const keepsAllCore = baseCore.every((node) => candidateLabels.has(node.label.toLowerCase().trim()));
  return keepsAllCore && nonTrivial.length === 0;
}

export interface TransferComparison {
  isNovel: boolean;
  structuralChanges: string[];
  reasoningChanges: string[];
  structuralDistance: number;
  reasoningDistance: number;
}

/**
 * Hard transfer gate: at least one meaningful structural change and at least
 * one meaningful reasoning-path change. Number swaps, renamed contexts,
 * different nouns and "unfamiliar"/"new representation" contribute nothing
 * because they are stripped before comparison.
 */
export function compareTransferStructures(
  baselineFingerprint: SetupFingerprint,
  transferFingerprint: SetupFingerprint,
  baselineGraph: ReasoningGraph,
  transferGraph: ReasoningGraph,
): TransferComparison {
  const structuralChanges: string[] = [];
  for (const [field, baselineValue] of fingerprintFields(baselineFingerprint)) {
    const transferValue = (transferFingerprint as unknown as Record<string, string>)[field] ?? "";
    if (baselineValue.trim() !== transferValue.trim()) structuralChanges.push(field);
  }
  // "requestedOutput" alone (for example "find x" vs "find y") is not a
  // structural change: it is the renamed-target analogue of a number swap.
  const meaningfulStructural = structuralChanges.filter((field) => field !== "requestedOutput");
  const structuralDistance = meaningfulStructural.length / 7;
  const distance = reasoningGraphDistance(baselineGraph, transferGraph);
  const reasoningChanges: string[] = [];
  if (distance.inputRepresentation > 0) reasoningChanges.push("inputRepresentation");
  if (distance.evidenceDependencies > 0) reasoningChanges.push("evidenceDependencies");
  if (distance.operations > 0) reasoningChanges.push("operations");
  if (distance.orderOfOperations > 0) reasoningChanges.push("orderOfOperations");
  if (distance.intermediateStates > 0) reasoningChanges.push("intermediateStates");
  if (distance.constraintsChecks > 0) reasoningChanges.push("constraintsChecks");
  if (distance.finalInference > 0) reasoningChanges.push("finalInference");
  // A reasoning-path change must touch the path itself, not only the final
  // wording or an extra check. Require an operation, representation, order or
  // intermediate difference.
  const pathChange = distance.operations > 0 || distance.inputRepresentation > 0 || distance.orderOfOperations > 0 || distance.intermediateStates > 0;
  const isNovel = meaningfulStructural.length >= 1 && pathChange && distance.overall >= 0.2;
  return {
    isNovel,
    structuralChanges: meaningfulStructural,
    reasoningChanges,
    structuralDistance,
    reasoningDistance: distance.overall,
  };
}

/** Convenience wrapper used by the audit when only parts are available. */
export function compareTransferParts(
  baseline: { prompt: string; part: QuestionPart; subjectId?: string; fingerprint?: SetupFingerprint; graph?: ReasoningGraph },
  transfer: { prompt: string; part: QuestionPart; subjectId?: string; fingerprint?: SetupFingerprint; graph?: ReasoningGraph },
): TransferComparison {
  const baselineFingerprint = baseline.fingerprint ?? baseline.part.learning?.transferLink?.baselineSetupFingerprint ?? fingerprintSetup(baseline.prompt, baseline.part.modelAnswer);
  const transferFingerprint = transfer.fingerprint ?? transfer.part.learning?.transferLink?.transferSetupFingerprint ?? fingerprintSetup(transfer.prompt, transfer.part.modelAnswer);
  const baselineGraph = baseline.graph ?? baseline.part.learning?.transferLink?.baselineReasoningGraph ?? reasoningGraphForPart(baseline.part, baseline.subjectId);
  const transferGraph = transfer.graph ?? transfer.part.learning?.transferLink?.transferReasoningGraph ?? reasoningGraphForPart(transfer.part, transfer.subjectId);
  return compareTransferStructures(baselineFingerprint, transferFingerprint, baselineGraph, transferGraph);
}

/** Stable part identity used for baseline linkage diagnostics. */
export function partIdentity(questionId: Id, partId: Id): string {
  return `${questionId}:${partId}`;
}

/** A capability id is a real mapped skill, not free-text prose. */
export function isMappedCapabilityId(id: string): boolean {
  return /^(?:math|bio|chem|phys)\.[a-z0-9-]+\.sp-\d+$/i.test(id.trim());
}

/** Broad free-text secondary skills that must be replaced by real ids. */
const FREE_TEXT_SECONDARIES = [
  "domain and endpoint checks",
  "exact form and admissibility checks",
  "experimental controls and data interpretation",
  "structure-function and evidence limits",
  "stoichiometric and unit constraints",
  "particle-level structure and charge balance",
];

export function isFreeTextSecondarySkill(label: string): boolean {
  const normalised = label.trim().toLowerCase();
  if (!normalised) return true;
  if (isMappedCapabilityId(label.trim())) return false;
  if (FREE_TEXT_SECONDARIES.includes(normalised)) return true;
  // Any prose without a capability-id shape is free text.
  return !/\.sp-\d+\s*$/i.test(label.trim());
}

function contractEntitiesPresent(prompt: string, contract: { requiredEntities: readonly string[] } | undefined): boolean {
  if (!contract || !contract.requiredEntities.length) return false;
  return contract.requiredEntities.some((entity) => evidencePhrasePresent(prompt, entity));
}

function contractOperationInSolution(
  part: QuestionPart,
  contract: { requiredOperations: readonly string[] } | undefined,
): boolean {
  if (!contract || !contract.requiredOperations.length) return false;
  const solution = `${(part.markScheme ?? []).join("\n")}\n${part.modelAnswer}`;
  return contract.requiredOperations.some((operation) => operationEvidencePresent(solution, operation));
}

function stepsForContract(
  part: QuestionPart,
  contract: { requiredEntities: readonly string[]; requiredOperations: readonly string[] } | undefined,
): string[] {
  if (!contract) return [];
  const steps = [...(part.markScheme ?? []), ...part.modelAnswer.split(/[.;\n]+/).map((step) => step.trim()).filter(Boolean)];
  return steps.filter((step) =>
    contract.requiredEntities.some((entity) => evidencePhrasePresent(step, entity)) ||
    contract.requiredOperations.some((operation) => operationEvidencePresent(step, operation)),
  );
}

/**
 * Independent synoptic structure check (seven demands from the revision brief):
 * 1. primary setup structure present, 2. secondary setup structure present,
 * 3. primary required, 4. secondary required, 5. one step each,
 * 6. joining dependency, 7. final result depends on both.
 * Removing either strand must leave the solution incomplete.
 */
export function validateSynopticStructure(
  part: QuestionPart,
  subjectId: string,
): string[] {
  const failures: string[] = [];
  const link = part.learning?.synopticLink;
  const primaryContract = part.learning?.primaryContract ?? part.learning?.capabilityEvidence;
  const secondaryContract = part.learning?.secondaryContract;
  const secondaryId = link?.secondaryCapabilityId ?? part.learning?.capabilityEvidence?.secondaryCapabilityId;
  const primaryId = link?.primaryCapabilityId ?? part.learning?.capabilityEvidence?.capabilityId;

  if (!link || !primaryId || !secondaryId) {
    failures.push("Synoptic cell lacks an explicit primary/secondary capability linkage.");
    return failures;
  }
  if (!isMappedCapabilityId(primaryId)) {
    failures.push(`Primary capability is not a mapped id: ${primaryId}.`);
  }
  if (!isMappedCapabilityId(secondaryId)) {
    failures.push(`Secondary capability is not a mapped id: ${secondaryId}.`);
    return failures;
  }
  if (isFreeTextSecondarySkill(secondaryId)) {
    failures.push(`Secondary capability is free-text prose, not a mapped id: ${secondaryId}.`);
    return failures;
  }
  if (!primaryContract || !primaryContract.requiredEntities.length) {
    failures.push("Primary capability lacks a real structural contract.");
  }
  if (!secondaryContract || !secondaryContract.requiredEntities.length) {
    failures.push("Secondary capability lacks a real structural contract (missing-secondary-contract).");
    return failures;
  }
  if (failures.length) return failures;

  // 1–2. Both setups must be visible in the prompt.
  if (!contractEntitiesPresent(part.prompt, primaryContract)) {
    failures.push("Primary capability setup structure is absent from the prompt.");
  }
  if (!contractEntitiesPresent(part.prompt, secondaryContract)) {
    failures.push("Secondary capability setup structure is absent from the prompt (secondary-capability-not-required).");
  }
  // 3–5. Each strand needs at least one attributable, checkable solution step.
  const primarySteps = stepsForContract(part, primaryContract);
  const secondarySteps = stepsForContract(part, secondaryContract);
  if (!primarySteps.length || !contractOperationInSolution(part, primaryContract)) {
    failures.push("Primary capability is named but unused in the worked solution.");
  }
  if (!secondarySteps.length || !contractOperationInSolution(part, secondaryContract)) {
    failures.push("Secondary capability is named but unused in the worked solution (secondary-capability-not-required).");
  }
  // 6. A joining dependency must link the strands.
  const joinCue = /\b(?:combine|both|together|using|with|constrain\w*|trade[- ]?off|interact\w*|link\w*|connect\w*|relat\w*|while|whereas|simultaneous|joint|depends?\s+on|requires?|gives?|yields?|therefore|so|because)\b/i.test(part.modelAnswer) &&
    primarySteps.length > 0 && secondarySteps.length > 0;
  if (!joinCue) {
    failures.push("No joining dependency links the primary and secondary strands.");
  }
  // 7. The final result must depend on both strands.
  const finalSentence = part.modelAnswer.split(/[.;\n]+/).map((s) => s.trim()).filter(Boolean).at(-1) ?? part.modelAnswer;
  const finalHasPrimary = primaryContract!.requiredEntities.some((e) => evidencePhrasePresent(finalSentence, e)) ||
    primaryContract!.requiredOperations.some((o) => operationEvidencePresent(finalSentence, o)) ||
    primarySteps.some((step) => evidencePhrasePresent(finalSentence, step.slice(0, 48)));
  const finalHasSecondary = secondaryContract!.requiredEntities.some((e) => evidencePhrasePresent(finalSentence, e)) ||
    secondaryContract!.requiredOperations.some((o) => operationEvidencePresent(finalSentence, o));
  // Ablation: removing either strand must leave the solution incomplete. When
  // the final conclusion mentions only one strand, the other was decorative.
  if (!finalHasPrimary || !finalHasSecondary) {
    // Fall back to derivation coverage: both contracts must contribute to the
    // intermediate chain, not only to isolated asides.
    const derivation = `${(part.markScheme ?? []).join("\n")}\n${part.modelAnswer}`;
    const primaryInChain = primaryContract!.requiredOperations.some((o) => operationEvidencePresent(derivation, o));
    const secondaryInChain = secondaryContract!.requiredOperations.some((o) => operationEvidencePresent(derivation, o));
    if (!primaryInChain || !secondaryInChain || !hasSynopticAttribution(part, subjectId)) {
      failures.push("Final result does not depend on both capabilities; removing one strand leaves a complete solution.");
    }
  }
  return failures;
}

/** Ablation helper for tests: true only when both strands are load-bearing. */
export function synopticAblationHolds(part: QuestionPart, subjectId: string): boolean {
  return validateSynopticStructure(part, subjectId).length === 0;
}
