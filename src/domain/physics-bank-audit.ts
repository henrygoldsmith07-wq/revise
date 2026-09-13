// ---------------------------------------------------------------------------
// Physics bank-wide quality and performance audit.
//
// This is an authoring/release report, not a learner-facing rule and not a
// replacement for subject review.  It deliberately makes only conservative
// claims: explicit contradictions inside one item are errors; cross-item
// conventions and duplicate reasoning are warnings for human triage.
// ---------------------------------------------------------------------------

import type { LearningDemand, Question, QuestionPart } from "./types";
import { reasoningProfileOf, reasoningSimilarity, type ReasoningProfile } from "./reasoning-signature";
import { contentTokens, promptSignature, textOverload } from "./text-similarity";

export type PhysicsBankIssueKind =
  | "definition-conflict"
  | "notation-conflict"
  | "sign-convention-conflict"
  | "constant-conflict"
  | "assumption-conflict"
  | "terminology-conflict"
  | "model-conflict"
  | "rounding-conflict"
  | "duplicate-reasoning"
  | "duplicate-mark-scheme"
  | "duplicate-misconception"
  | "difficulty-mismatch"
  | "transfer-novelty";

export interface PhysicsBankIssue {
  kind: PhysicsBankIssueKind;
  severity: "error" | "warning";
  questionId: string;
  partId: string;
  peerId?: string;
  detail: string;
}

export interface PhysicsBankIndexEntry {
  question: Question;
  part: QuestionPart;
  profile: ReasoningProfile;
  groupKey: string;
  promptKey: string;
  markSchemeKey: string;
  misconceptionKey: string;
}

export interface PhysicsBankIndex {
  entries: PhysicsBankIndexEntry[];
  groups: Map<string, PhysicsBankIndexEntry[]>;
}

export interface PhysicsBankAudit {
  subjectId: string;
  questionCount: number;
  partCount: number;
  profileCount: number;
  consistencyErrors: number;
  errors: number;
  warnings: number;
  duplicatePairs: number;
  difficultyMismatches: number;
  transferWarnings: number;
  estimatedComparisons: number;
  elapsedMs: number;
  issues: PhysicsBankIssue[];
}

const PHYSICS_SUBJECT = "wjec-alevel-physics";
const DIFFICULTY_TARGET: Record<LearningDemand, number> = {
  recall: 1.5,
  explanation: 2.5,
  application: 3,
  misconception: 2.5,
  calculation: 3.5,
  transfer: 4,
  synoptic: 4.5,
};
const DUPLICATE_THRESHOLD = 0.72;
const TRANSFER_THRESHOLD = 0.72;

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function normaliseScheme(part: QuestionPart): string {
  return promptSignature((part.markScheme ?? []).join(" | "));
}

function groupKeyOf(profile: ReasoningProfile): string | null {
  if (!profile.capabilityId || !profile.demand) return null;
  return `${profile.capabilityId}:${profile.demand}`;
}

/** Build all expensive deterministic metadata once for the audit pass. */
export function buildPhysicsBankIndex(questions: readonly Question[], subjectId = PHYSICS_SUBJECT): PhysicsBankIndex {
  const entries: PhysicsBankIndexEntry[] = [];
  const groups = new Map<string, PhysicsBankIndexEntry[]>();
  for (const question of questions) {
    if (question.subjectId !== subjectId) continue;
    for (const part of question.parts) {
      const profile = reasoningProfileOf(question, part);
      const groupKey = groupKeyOf(profile);
      if (!groupKey) continue;
      const entry: PhysicsBankIndexEntry = {
        question,
        part,
        profile,
        groupKey,
        promptKey: promptSignature(part.prompt),
        markSchemeKey: normaliseScheme(part),
        misconceptionKey: contentTokens(part.prompt).size ? [...contentTokens(part.prompt)].sort().join(" ") : "",
      };
      entries.push(entry);
      const group = groups.get(groupKey) ?? [];
      group.push(entry);
      groups.set(groupKey, group);
    }
  }
  return { entries, groups };
}

function addIssue(
  issues: PhysicsBankIssue[], kind: PhysicsBankIssueKind, severity: PhysicsBankIssue["severity"],
  entry: PhysicsBankIndexEntry, detail: string, peer?: PhysicsBankIndexEntry,
): void {
  issues.push({ kind, severity, questionId: entry.question.id, partId: entry.part.id, ...(peer ? { peerId: peer.part.id } : {}), detail });
}

/**
 * Extract only explicitly supplied constants. Ordinary equations contain
 * assignments to working variables (n, t, v, R, ...), so treating every
 * `letter = number` as a universal constant creates false conflicts. The
 * cue word is required and the symbol set is deliberately limited to common
 * Physics constants (including e and k, which occur in the quantum and
 * thermal sections). Both ASCII and superscript powers of ten are accepted.
 */
function explicitConstants(text: string): Array<[string, number]> {
  const found: Array<[string, number]> = [];
  const pattern = /\b(?:use|take|using|given|assume|with)\s+((?:[gchek]|m[_ ]?e|epsilon|ε))\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*[×x*]\s*10\s*(?:\^\s*)?([+\-−]?(?:\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)))?/giu;
  const superscriptDigits: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
  const parseExponent = (raw: string | undefined): number => {
    if (!raw) return 0;
    const ascii = [...raw].map((character) => superscriptDigits[character] ?? character).join("").replace("−", "-");
    return Number(ascii);
  };
  for (const match of text.matchAll(pattern)) {
    const symbol = match[1];
    if (!symbol) continue;
    const base = Number(match[2]);
    const exponent = parseExponent(match[3]);
    const value = base * 10 ** exponent;
    if (Number.isFinite(value)) found.push([symbol, value]);
  }
  return found;
}

function explicitSigns(text: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const pattern = /\b(?:take|let|choose|define)\s+([a-z][a-z -]{0,24}?)\s+as\s+(positive|negative)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const subject = match[1]?.replace(/\s+/g, " ").trim().toLowerCase();
    const sign = match[2]?.toLowerCase();
    if (subject && sign) result.push([subject, sign]);
  }
  return result;
}

function explicitNotation(text: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const pattern = /\b(?:where|let|with)\s+([a-z])\s+(?:is|denotes?)\s+(?:the\s+)?([a-z][a-z -]{2,32})/gi;
  for (const match of text.matchAll(pattern)) {
    const symbol = match[1]?.toLowerCase();
    const meaning = match[2]?.replace(/\s+/g, " ").trim().toLowerCase();
    if (symbol && meaning) result.push([symbol, meaning]);
  }
  return result;
}

/** Extract only unambiguous scalar/vector definition claims. */
function explicitDefinitions(text: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  const pattern = /\b(velocity|momentum|force|field strength|potential|current|charge|work|power|energy)\b\s+(?:is|are|means|defined as)\s+((?:not\s+)?(?:a\s+)?(?:scalar|vector|rate|force|energy|power))\b/gi;
  for (const match of text.matchAll(pattern)) {
    const term = match[1]?.toLowerCase();
    const qualifier = match[2]?.replace(/\s+/g, " ").trim().toLowerCase();
    if (term && qualifier) result.push([term, qualifier]);
  }
  return result;
}

/** Conservative contradictions that can be established from one part. */
function auditExplicitConsistency(entry: PhysicsBankIndexEntry, issues: PhysicsBankIssue[]): void {
  const prompt = entry.part.prompt;
  const answer = `${entry.part.markScheme.join(" ")} ${entry.part.modelAnswer}`;
  const combined = `${prompt} ${answer}`;

  const constants = new Map<string, number>();
  for (const [symbol, value] of explicitConstants(prompt)) {
    const previous = constants.get(symbol);
    if (previous !== undefined && Math.abs(previous - value) > Math.max(1e-12, Math.abs(previous) * 1e-9)) {
      addIssue(issues, "constant-conflict", "error", entry, `The same symbol ${symbol} is explicitly assigned both ${previous} and ${value} within one item.`);
      break;
    }
    constants.set(symbol, value);
  }

  const signs = new Map<string, string>();
  for (const [subject, sign] of explicitSigns(combined)) {
    const previous = signs.get(subject);
    if (previous && previous !== sign) {
      addIssue(issues, "sign-convention-conflict", "error", entry, `The convention for ${subject} changes from ${previous} to ${sign} within one item.`);
      break;
    }
    signs.set(subject, sign);
  }

  const notation = new Map<string, string>();
  for (const [symbol, meaning] of explicitNotation(combined)) {
    const previous = notation.get(symbol);
    if (previous && previous !== meaning) {
      addIssue(issues, "notation-conflict", "error", entry, `The symbol ${symbol} is described as both “${previous}” and “${meaning}” within one item.`);
      break;
    }
    notation.set(symbol, meaning);
  }

  const definitions = new Map<string, string>();
  for (const [term, qualifier] of explicitDefinitions(answer)) {
    const previous = definitions.get(term);
    const category = (value: string): string => value.replace(/^not\s+/, "").replace(/^a\s+/, "");
    const oppositePolarity = (value: string): boolean => value.startsWith("not ");
    const definitionConflict = previous && (
      (category(previous) !== category(qualifier) && ["scalar", "vector"].includes(category(previous)) && ["scalar", "vector"].includes(category(qualifier))) ||
      (category(previous) === category(qualifier) && oppositePolarity(previous) !== oppositePolarity(qualifier))
    );
    if (definitionConflict) {
      addIssue(issues, "definition-conflict", "error", entry, `The answer gives incompatible scalar/vector definitions for ${term}.`);
      break;
    }
    definitions.set(term, qualifier);
  }

  const zeroCurrentCondition = /\b(?:zero|no)\s+current\b|\bI\s*=\s*0\b/i.test(answer);
  if (!zeroCurrentCondition && (/\bemf\b[^.!?]{0,35}\b(?:is|equals?)\b[^.!?]{0,25}\bterminal\s+(?:p\.?\s*d\.?|potential)\b/i.test(answer) ||
      /\bterminal\s+(?:p\.?\s*d\.?|potential)\b[^.!?]{0,35}\b(?:is|equals?)\b[^.!?]{0,25}\bemf\b/i.test(answer))) {
    addIssue(issues, "terminology-conflict", "error", entry, "The answer equates emf with terminal potential difference without a stated zero-current condition.");
  }

  // Only flag an assumption when the answer asserts the neglected mechanism
  // is active, rather than when it explains why the mechanism is omitted.
  const neglectedMechanisms = [...prompt.matchAll(/\b(?:ignore|neglect|assume)\w*\s+(air\s+resistance|resistance|friction|drag|air\s+drag|massless\s+string|inextensible\s+string)\b/gi)]
    .map((match) => match[1]!.toLowerCase());
  const activeMechanism = (mechanism: string): boolean => {
    const stem = mechanism.replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${stem}\\b[^.!?]{0,45}\\b(?:acts|causes|dissipates|opposes|is included)\\b`, "i").test(answer);
  };
  if (neglectedMechanisms.some(activeMechanism)) {
    addIssue(issues, "assumption-conflict", "error", entry, "The prompt neglects a mechanism that the marking/answer treats as active without qualification.");
  }

  // A broad "increases"/"unchanged" scan is too eager for explanations that
  // compare two different quantities.  Only flag an explicit same-quantity
  // contradiction in one short clause.
  const contradiction = /\b(frequency|speed|wavelength|current|voltage|energy|momentum|force|acceleration|velocity|displacement)\b[^.!?]{0,55}\b(?:increases?|rises?|grows?|becomes?\s+(?:larger|greater))\b[^.!?]{0,55}\b(?:remains?|stays?)\s+(?:unchanged|constant|the same)\b/i;
  if (contradiction.test(answer)) addIssue(issues, "model-conflict", "error", entry, "The answer asserts a changing and an unchanged value for the same quantity without a stated condition.");

  const requested = prompt.match(/\b(\d)\s*(?:s\.f\.?|significant\s+figures?)\b/i);
  if (requested) {
    const significant = Number(requested[1]);
    const answerNumbers = answer.match(/\b[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b/gi) ?? [];
    const hasExplicitPrecision = answerNumbers.some((token) => {
      const mantissa = token.replace(/[eE].*$/, "").replace(/^[+-]/, "");
      const digits = mantissa.replace(/\D/g, "").replace(/^0+/, "");
      return digits.length > 0 && digits.length !== significant;
    });
    if (hasExplicitPrecision) addIssue(issues, "rounding-conflict", "warning", entry, `Prompt requests ${significant} significant figures but the written answer contains another explicit precision.`);
  }
}

function auditGlobalConventions(index: PhysicsBankIndex, issues: PhysicsBankIssue[]): void {
  const declarations = new Map<string, { value: number; entry: PhysicsBankIndexEntry }>();
  const emitted = new Set<string>();
  for (const entry of index.entries) {
    const constants = explicitConstants(entry.part.prompt);
    for (const [symbol, value] of constants) {
      const previous = declarations.get(symbol);
      if (previous && Math.abs(previous.value - value) > Math.max(1e-12, Math.abs(previous.value) * 1e-9)) {
        // A cross-question value difference may be intentional (rounded g or a
        // local calibration), so it is a warning with both source identities.
        const key = `${symbol}:${previous.entry.question.id}:${entry.question.id}`;
        if (!emitted.has(key)) {
          emitted.add(key);
          addIssue(issues, "constant-conflict", "warning", entry, `Symbol ${symbol} uses another explicit value elsewhere; check the stated local convention.`, previous.entry);
        }
      }
      declarations.set(symbol, { value, entry });
    }
  }
}

function expectedDifficulty(entry: PhysicsBankIndexEntry): number | null {
  const demand = entry.profile.demand as LearningDemand | null;
  return demand ? DIFFICULTY_TARGET[demand] : null;
}

function auditDifficulty(entry: PhysicsBankIndexEntry, issues: PhysicsBankIssue[]): void {
  const expected = expectedDifficulty(entry);
  if (expected === null) return;
  const actual = entry.question.difficulty;
  if (Math.abs(actual - expected) > 1.5 ||
      (entry.profile.demand === "recall" && actual > 3) ||
      ((entry.profile.demand === "transfer" || entry.profile.demand === "synoptic") && actual < 3)) {
    addIssue(issues, "difficulty-mismatch", "warning", entry, `Assigned difficulty ${actual} does not match the ${entry.profile.demand} reasoning target (${expected}).`);
  }
}

function auditGroup(group: PhysicsBankIndexEntry[], issues: PhysicsBankIssue[]): { comparisons: number; duplicatePairs: number; transferWarnings: number } {
  let comparisons = 0;
  let duplicatePairs = 0;
  let transferWarnings = 0;
  const emittedReasoning = new Set<string>();
  const emittedSchemes = new Set<string>();
  const emittedMisconceptions = new Set<string>();
  for (let i = 0; i < group.length; i++) {
    const left = group[i]!;
    auditDifficulty(left, issues);
    for (let j = i + 1; j < group.length; j++) {
      const right = group[j]!;
      comparisons++;
      if (left.question.id === right.question.id) continue;
      if (left.profile.familyId && right.profile.familyId && left.profile.familyId === right.profile.familyId) continue;
      const similarity = reasoningSimilarity(left.profile, right.profile).overall;
      const familyKey = [left.profile.familyId ?? left.part.id, right.profile.familyId ?? right.part.id].sort().join("|");
      if (similarity >= DUPLICATE_THRESHOLD && !emittedReasoning.has(familyKey)) {
        emittedReasoning.add(familyKey);
        duplicatePairs++;
        addIssue(issues, "duplicate-reasoning", "warning", right, `Reasoning similarity ${similarity.toFixed(2)} with another family; inspect for a repeated solution path.`, left);
      }
      if (left.markSchemeKey && left.markSchemeKey === right.markSchemeKey) {
        const schemeKey = [left.markSchemeKey, left.profile.familyId ?? left.part.id, right.profile.familyId ?? right.part.id].sort().join("|");
        if (!emittedSchemes.has(schemeKey)) {
          emittedSchemes.add(schemeKey);
          addIssue(issues, "duplicate-mark-scheme", "warning", right, "Identical value-stripped mark-scheme points occur in another family within this capability and demand.", left);
        }
      }
      if (left.profile.demand === "misconception" && right.profile.demand === "misconception" &&
          textOverload(left.part.prompt, right.part.prompt) >= 0.9) {
        const misconceptionKey = [left.misconceptionKey, right.misconceptionKey].sort().join("|");
        if (!emittedMisconceptions.has(misconceptionKey)) {
          emittedMisconceptions.add(misconceptionKey);
          addIssue(issues, "duplicate-misconception", "warning", right, "The misconception prompt is near-identical to another family; retain only if the learner-facing diagnosis differs.", left);
        }
      }
      if (left.profile.demand === "transfer" || left.profile.demand === "synoptic") {
        if (similarity >= TRANSFER_THRESHOLD) {
          transferWarnings++;
          addIssue(issues, "transfer-novelty", "warning", right, `Transfer/synoptic reasoning is too close to a prior family (similarity ${similarity.toFixed(2)}).`, left);
        }
      }
    }
  }
  return { comparisons, duplicatePairs, transferWarnings };
}

/** Audit a Physics bank in one deterministic, precomputed pass. */
export function auditPhysicsBank(questions: readonly Question[], options?: { subjectId?: string }): PhysicsBankAudit {
  const started = now();
  const subjectId = options?.subjectId ?? PHYSICS_SUBJECT;
  const selected = questions.filter((question) => question.subjectId === subjectId);
  const index = buildPhysicsBankIndex(selected, subjectId);
  const issues: PhysicsBankIssue[] = [];
  for (const entry of index.entries) auditExplicitConsistency(entry, issues);
  auditGlobalConventions(index, issues);
  let estimatedComparisons = 0;
  let duplicatePairs = 0;
  let transferWarnings = 0;
  for (const group of index.groups.values()) {
    const result = auditGroup(group, issues);
    estimatedComparisons += result.comparisons;
    duplicatePairs += result.duplicatePairs;
    transferWarnings += result.transferWarnings;
  }
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return {
    subjectId,
    questionCount: selected.length,
    partCount: index.entries.length,
    profileCount: index.entries.length,
    consistencyErrors: issues.filter((issue) => issue.severity === "error" && [
      "definition-conflict", "notation-conflict", "sign-convention-conflict", "constant-conflict",
      "assumption-conflict", "terminology-conflict", "model-conflict", "rounding-conflict",
    ].includes(issue.kind)).length,
    errors,
    warnings,
    duplicatePairs,
    difficultyMismatches: issues.filter((issue) => issue.kind === "difficulty-mismatch").length,
    transferWarnings,
    estimatedComparisons,
    elapsedMs: Math.max(0, now() - started),
    issues,
  };
}
