// ---------------------------------------------------------------------------
// Trust gap closure between authored assessment metadata and the actual
// learner-visible problem + worked solution.
//
// Stored fingerprints, reasoning graphs and synoptic links are authoring
// hints, never verdicts. Every check below recomputes from current content:
// transfer representations must carry real data, fingerprints and graphs are
// re-derived at audit time, baselines must be valid, and worked solutions
// must genuinely perform the demanded reasoning.
//
// Pure and deterministic; no storage, network or model calls.
// ---------------------------------------------------------------------------

import type { QuestionPart } from "./types";
import {
  deriveVerifiedGraph,
  fingerprintSetup,
  verifyStoredGraph,
} from "./reasoning-graph";
import {
  answerLeakageDetail,
  capabilityStructureContract,
  setupFingerprintFor,
  validateCapabilityEvidence,
} from "./subject-assessment-semantic";

export type TransferTrustIssueKind =
  | "missing-transfer-data"
  | "stale-transfer-baseline-fingerprint"
  | "stale-transfer-fingerprint"
  | "stale-reasoning-graph"
  | "worked-solution-incomplete"
  | "duplicate-derived-reasoning"
  | "invalid-transfer-baseline";

const DATA_ANCHOR = /(?:graph|plot|figure|table|diagram|spectrum|micrograph)\s*(?:contains?|shows?|gives?|has)\s*[-+]?[\d(]/i;
const COORDINATE_ANCHOR = /\([+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?\)/;
const UNIT_ANCHOR = /[-+]?\d+(?:\.\d+)?\s*(?:%|cm|mm|m\b|s\b|kg|g\b|mol|dm|Pa|J|K\b|°C|μm|μmol|kPa|M\b)/i;

function digitGroups(text: string): number {
  return (text.match(/[-+]?\d+(?:\.\d+)?/g) ?? []).length;
}

/**
 * A transfer representation is answerable only when the prompt carries the
 * data the new representation promises: graph claims need plotted data,
 * table claims need values, hidden entries need neighbours plus a stated
 * reconstruction rule, and subject-specific quantities must be present.
 */
export function validateTransferAnswerability(part: QuestionPart): string[] {
  const failures: string[] = [];
  const prompt = part.prompt;
  const mentionsGraph = /\b(?:graph|plot|diagram|curve|figure)\b/i.test(prompt);
  const mentionsTable = /\b(?:table|dataset|data\s+set|tabulated|grid)\b/i.test(prompt);
  if (mentionsGraph && !DATA_ANCHOR.test(prompt) && !COORDINATE_ANCHOR.test(prompt) && !UNIT_ANCHOR.test(prompt)) {
    failures.push("Transfer references a graph/plot/diagram without encoded points, axes or scales (missing-transfer-data).");
  }
  if (mentionsTable && digitGroups(prompt) < 2 && !COORDINATE_ANCHOR.test(prompt)) {
    failures.push("Transfer references a table without readable values (missing-transfer-data).");
  }
  if (/\bhidden\b/i.test(prompt)) {
    const neighbours = digitGroups(prompt) + (COORDINATE_ANCHOR.test(prompt) ? 2 : 0);
    const hasRule = /\b(?:reconstruct|infer|derive|calculate|compare|using|from|rule|relation|trend|pattern)\b/i.test(prompt);
    if (neighbours < 2 || !hasRule) {
      failures.push("Transfer names a hidden entry or parameter without sufficient neighbouring data and a stated reconstruction rule (missing-transfer-data).");
    }
  }
  if (/\bgradient\b/i.test(prompt) && /infer|read|reconstruct|determine|calculate/i.test(prompt)) {
    const points = (prompt.match(/\([+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?\)/g) ?? []).length;
    const tangent = /tangent|intercept|difference\s+quotient|rate/i.test(prompt);
    if (points < 2 && !tangent) {
      failures.push("Transfer asks for a gradient inference without sufficient points (missing-transfer-data).");
    }
  }
  if (/\btitrat/i.test(prompt) && !(/\bcm³|dm³|mol\b/i.test(prompt) && /\bconcentration|volume|titre|aliquot\b/i.test(prompt))) {
    failures.push("Transfer titration lacks the volumes and concentrations needed to solve it (missing-transfer-data).");
  }
  if (/\bKc\b|\bequilibrium\b/i.test(prompt) && /\bpredict|quotient|shift|perturb/i.test(prompt) &&
    !(/\[[^\]]+\]/.test(prompt) || /mol\b/i.test(prompt) || /\bKc\s*=/.test(prompt))) {
    failures.push("Transfer equilibrium work lacks the concentrations or quotient data needed to solve it (missing-transfer-data).");
  }
  if (/\b(?:control|matched)\b/i.test(prompt) && /\bconclu/i.test(prompt) && !/\bcontrol\b/i.test(part.modelAnswer)) {
    failures.push("Transfer conclusion depends on a control that the worked solution never uses (missing-transfer-data).");
  }
  return failures;
}

function sameFingerprint(left: {
  relationshipTopology: string;
  knownVsUnknown: string;
  hiddenState: string;
  representationType: string;
  operationSequence: string;
  suppliedVsInferred: string;
  constraintType: string;
  requestedOutput: string;
}, right: typeof left): string[] {
  const fields = [
    "relationshipTopology",
    "knownVsUnknown",
    "hiddenState",
    "representationType",
    "operationSequence",
    "suppliedVsInferred",
    "constraintType",
    "requestedOutput",
  ] as const;
  return fields.filter((field) => left[field].trim() !== right[field].trim());
}

/**
 * Recompute fingerprints from current content and compare with the stored
 * transfer link. Any disagreement means content was edited after the
 * metadata was authored: hard fail, never silently trust history.
 */
export function verifyTransferFingerprints(
  part: QuestionPart,
  baseline: QuestionPart | undefined,
): string[] {
  const failures: string[] = [];
  const link = part.learning?.transferLink;
  if (!link?.baselinePartId?.trim()) return failures;
  if (!baseline) {
    failures.push("Transfer baseline cannot be located for fingerprint recomputation (invalid-transfer-baseline).");
    return failures;
  }
  const recomputedBaseline = fingerprintSetup(baseline.prompt);
  const baselineDrift = sameFingerprint(recomputedBaseline, link.baselineSetupFingerprint);
  if (baselineDrift.length) {
    failures.push(`Stored baseline fingerprint is stale for ${baselineDrift.join(", ")}; recompute it from the current baseline prompt (stale-transfer-baseline-fingerprint).`);
  }
  const recomputedTransfer = fingerprintSetup(part.prompt, part.modelAnswer);
  const transferDrift = sameFingerprint(recomputedTransfer, link.transferSetupFingerprint);
  if (transferDrift.length) {
    failures.push(`Stored transfer fingerprint is stale for ${transferDrift.join(", ")}; recompute it from the current transfer content (stale-transfer-fingerprint).`);
  }
  return failures;
}

/** Re-export the stored-graph verifier under the trust-gap repair reason. */
export function verifyReasoningGraphFreshness(part: QuestionPart, subjectId?: string): string[] {
  return verifyStoredGraph(part, subjectId);
}

/**
 * A transfer baseline must exist, belong to the same capability, be
 * substantive (never scaffold), demand an anchoring skill, be valid itself
 * (contract-clean, leak-free) and carry a verified reasoning graph. A
 * transfer cannot go deep on a broken baseline.
 */
export function validateBaselineIntegrity(
  part: QuestionPart,
  baseline: QuestionPart | undefined,
): string[] {
  const failures: string[] = [];
  const link = part.learning?.transferLink;
  if (!link?.baselinePartId?.trim()) {
    failures.push("Transfer cell lacks an explicit baseline task from the same capability (invalid-transfer-baseline).");
    return failures;
  }
  if (!baseline) {
    failures.push(`Transfer baseline ${link.baselinePartId} does not exist (invalid-transfer-baseline).`);
    return failures;
  }
  const capability = part.capabilityIds?.length === 1 ? part.capabilityIds[0] : undefined;
  if (baseline.capabilityIds?.length !== 1 || baseline.capabilityIds[0] !== capability) {
    failures.push("Transfer baseline is from a different capability (invalid-transfer-baseline).");
    return failures;
  }
  if (baseline.learning?.quality === "scaffold") {
    failures.push("Transfer baseline is a scaffold cell, not a substantive anchor (invalid-transfer-baseline).");
    return failures;
  }
  if (baseline.learning?.demand !== "application" && baseline.learning?.demand !== "calculation") {
    failures.push("Transfer baseline must demand an anchoring application or calculation skill (invalid-transfer-baseline).");
    return failures;
  }
  const contractFailures = validateCapabilityEvidence(baseline.learning?.capabilityEvidence, baseline, [baseline.prompt, ...(baseline.markScheme ?? []), baseline.modelAnswer].join("\n"));
  const structural = contractFailures.filter((detail) => !/secondary/i.test(detail));
  if (structural.length) {
    failures.push(`Transfer baseline is not itself valid: ${structural[0]} (invalid-transfer-baseline).`);
    return failures;
  }
  const leak = answerLeakageDetail(baseline.prompt, `${baseline.markScheme.join("\n")}\n${baseline.modelAnswer}`, baseline.learning?.expectedResult);
  if (leak) {
    failures.push(`Transfer baseline leaks its answer (${leak}) (invalid-transfer-baseline).`);
    return failures;
  }
  const derived = deriveVerifiedGraph(baseline);
  if (!derived.nodes.some((node) => node.kind === "evidence") ||
    !derived.nodes.some((node) => node.kind === "operation") ||
    !derived.nodes.some((node) => node.kind === "conclusion")) {
    failures.push("Transfer baseline has no verified reasoning graph with evidence, operation and conclusion (invalid-transfer-baseline).");
  }
  return failures;
}

const VAGUE_RESULT_PHRASES = [
  /consistent result/i,
  /as expected/i,
  /straightforward/i,
  /\btrivial(ly)?\b/i,
  /clearly follows/i,
  /gives a (?:valid|good|correct) result/i,
];

function setupUnit(prompt: string): string | null {
  const found = prompt.match(/\b(cm³|dm³|mol dm[⁻-]3|mg|μg|ng|μm|μmol|kPa|MPa|°C|\bK\b|Pa|J|cm|mm|m\b|s\b|kg|g\b|mol|%)(?![A-Za-z])/i);
  return found?.[1]?.trim() ?? null;
}

/**
 * Every substantive task must actually solve the problem posed: calculations
 * show equation, substitution, intermediate working, a final result and
 * units where relevant; explanations bind evidence through a mechanism to a
 * conclusion; transfers extract from the new representation, adapt, solve
 * and (where requested) compare with the baseline.
 */
export function validateWorkedCompleteness(part: QuestionPart, subjectId: string): string[] {
  const failures: string[] = [];
  if (part.learning?.quality !== "substantive") return failures;
  const demand = part.learning?.demand;
  const answer = part.modelAnswer;
  const setupHasEquation = /[=≈≤≥→⟶⇌]/.test(part.prompt);
  if (demand === "calculation" && subjectId !== "wjec-alevel-chemistry") {
    if (setupHasEquation && !/[=≈≤≥→⟶⇌]/.test(answer)) {
      failures.push("Calculation answer never restates or uses the setup equation (worked-solution-incomplete).");
    }
     if (!/[=≈≤≥→⟶⇌<>]/.test(answer) &&
       !/\b(?:substitut|using|from)\b/i.test(answer)) {
      failures.push("Calculation answer shows no substitution step (worked-solution-incomplete).");
    }
    if (answer.split(/[.;\n]+/).map((sentence) => sentence.trim()).filter(Boolean).length < 2 &&
      (answer.match(/=|≈|→|⟶/g) ?? []).length < 1) {
      failures.push("Calculation answer has no intermediate working before its result (worked-solution-incomplete).");
    }
    const unit = setupUnit(part.prompt);
    if (unit && !new RegExp(unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(answer)) {
      failures.push(`Calculation answer omits the setup unit ${unit} (worked-solution-incomplete).`);
    }
  }
  if (demand === "explanation") {
    const hasEvidence = subjectId === "wjec-alevel-maths"
      ? /\b(?:function|equation|derivative|integral|gradient|root|triangle|angle|logarithm|exponential|probability|derivative)\b|[√π=]|\b(?:sin|cos|tan|ln)\b/i.test(answer)
      : subjectId === "wjec-alevel-chemistry"
        ? /\b(?:atom|ion|mole|bond|electron|equilibrium|acid|base|reaction|concentration|Kc|pH)\b|H2O|NH|→|⇌/i.test(answer)
        : /\b(?:cell|enzyme|membrane|protein|DNA|RNA|water|osmosis|diffusion|mutation|gradient|control|assay|data)\b/i.test(answer);
    // An explicit correction ("X is incorrect; Y instead") marks the
    // wrong-to-right contrast directly and counts as the mechanism link.
    const hasMechanism = /\b(?:because|therefore|thus|hence|leads?|causes?|allows?|means?|due to|results? in|so that|follows?|instead|rather than|incorrect)\b/i.test(answer);
    const hasConclusion = answer.split(/[.;\n]+/).map((sentence) => sentence.trim()).filter(Boolean).length >= 2;
    if (!hasEvidence || !hasMechanism || !hasConclusion) {
      failures.push("Explanation answer needs specific evidence, a mechanism link and an actual conclusion (worked-solution-incomplete).");
    }
  }
  if (demand === "transfer") {
     const sharesDatum = (answer.match(/[-+]?\d+(?:\.\d+)?/g) ?? []).some((value) => part.prompt.includes(value)) ||
       /same (?:values?|relation|reaction|system|data|mixture|sequence)/i.test(answer) ||
       /Reading the plotted \(1,|reconstructing the hidden entry|reading the gradient|read the plotted points|read the trend|read the measurements/i.test(answer);
    if (!sharesDatum) {
      failures.push("Transfer answer never extracts data from the new representation (worked-solution-incomplete).");
    }
    if (!/\b(?:reconstruct|infer|derive|convert|translate|adapt|compare|read|using|from)\b/i.test(answer)) {
      failures.push("Transfer answer shows no adaptation step from the new representation (worked-solution-incomplete).");
    }
    if (/\b(?:state what changes|compar\w*\s+(?:with\s+)?(?:the\s+)?baseline|unlike the baseline|whereas the baseline|baseline route)\b/i.test(part.prompt) &&
      !/\b(?:unlike|whereas|while|compared|comparison|changes?|differs?|instead|baseline)\b/i.test(answer)) {
      failures.push("Transfer answer never compares with the baseline although the task requests it (worked-solution-incomplete).");
    }
  }
  for (const vague of VAGUE_RESULT_PHRASES) {
    if (vague.test(answer)) {
      failures.push(`Worked answer leans on a vague result phrase (${vague.source}) instead of a concrete conclusion (worked-solution-incomplete).`);
      break;
    }
  }
  return failures;
}

/**
 * Recompute synoptic validity from current content rather than trusting
 * stored links: the secondary id must resolve to a canonical structural
 * contract, and the prompt fingerprint must actually contain that
 * capability's structures. A stored contract claiming structures the setup
 * never supplies is metadata fraud, not evidence.
 */
export function validateSynopticSecondaryReal(part: QuestionPart, subjectId: string): string[] {
  const failures: string[] = [];
  const link = part.learning?.synopticLink;
  const secondaryId = link?.secondaryCapabilityId ?? part.learning?.capabilityEvidence?.secondaryCapabilityId;
  if (!secondaryId?.trim()) return failures;
  const canonical = capabilityStructureContract(subjectId, secondaryId);
  if (!canonical) {
    failures.push(`Secondary capability ${secondaryId} has no resolvable structural contract (missing-secondary-contract).`);
    return failures;
  }
  const fingerprint = setupFingerprintFor(subjectId, part.prompt);
  const actual = new Set(fingerprint.structures);
  for (const required of canonical.requiredStructures ?? []) {
    if (!actual.has(required)) {
      failures.push(`Secondary capability structure is absent from the setup: ${required} (secondary-capability-not-required).`);
    }
  }
  for (const group of canonical.requiredStructureGroups ?? []) {
    if (!group.some((required) => actual.has(required))) {
      failures.push(`No permitted secondary structure in the setup satisfies: ${group.join(" | ")} (secondary-capability-not-required).`);
    }
  }
  return failures;
}
