// ---------------------------------------------------------------------------
// Trusted-question supply audit for the flagship subjects.
//
// Answers one question per topic: are there enough trusted, genuinely
// different, unseen questions to prove an improvement? Pure and deterministic.
// Only questions passing the repo's trust predicate count towards proof;
// unverified content is reported but never inflates a count. Number swaps,
// noun swaps and same-reasoning reskins collapse to one question, as do
// questions sharing an authored family.
// ---------------------------------------------------------------------------

import { trustedAssessmentContent } from "./content-trust";
import { FLAGSHIP_SUBJECTS, isFlagship } from "./flagship";
import { isTransferQuestion, questionFamilies, unseenQuestion } from "./learning-evidence";
import { isNearDuplicateReasoning, reasoningProfilesOf, reasoningSimilarity, type ReasoningProfile } from "./reasoning-signature";
import { MIN_PROVABLE_QUESTIONS } from "./supply";
import { promptSignature, textOverload } from "./text-similarity";
import { NEAR_DUPLICATE } from "./trusted-coverage";
import type { Attempt, Id, Question, Topic } from "./types";

export type ShallowKind = "number-swap" | "noun-swap" | "same-signature";
/** Strongest evidence first: a group reports its most severe edge kind. */
const KIND_ORDER: readonly ShallowKind[] = ["number-swap", "noun-swap", "same-signature"];

export type SupplyVerdict = "enough-for-proof" | "thin" | "insufficient";

export interface ShallowGroup {
  kind: ShallowKind;
  kinds: ShallowKind[];
  /** Every question in the group, sorted. */
  ids: Id[];
  /** The subset that is trusted; these count as one question for proof. */
  trustedIds: Id[];
}

export interface TopicSupplyAudit {
  subjectId: Id;
  topicId: Id;
  title: string;
  questions: number;
  specLinked: number;
  /** Trusted, unseen-eligible questions (before collapsing shallow variants). */
  trusted: number;
  transfer: number;
  dataAnalysis: number;
  /** Distinct authored family ids among trusted questions. */
  trustedFamilies: number;
  /** Trusted questions after merging shared families and shallow variants. */
  provableDistinct: number;
  /** One representative id per distinct trusted question. */
  provenIds: Id[];
  /** Trusted questions with no shallow partner among other trusted questions. */
  delayedProofEligible: number;
  shallowGroups: ShallowGroup[];
  /** Distinct questions among everything authored (trusted or not), after the same collapsing. */
  authoredDistinct: number;
  verdict: SupplyVerdict;
  /** Extra distinct questions that reviewing the untrusted pool could add (capped at the gap). */
  reviewableDistinct: number;
}

export interface AuthoringNeed {
  subjectId: Id;
  topicId: Id;
  title: string;
  verdict: SupplyVerdict;
  missingDistinct: number;
  missingTransfer: number;
  reviewableDistinct: number;
  /** "review-existing" when reviewing authored items could close the gap. */
  action: "author-new" | "review-existing";
}

export interface SubjectSupplyAudit {
  subjectId: Id;
  label: string;
  topics: TopicSupplyAudit[];
  rollup: {
    topics: number;
    questions: number;
    specLinked: number;
    trusted: number;
    transfer: number;
    dataAnalysis: number;
    provableDistinct: number;
    authoredDistinct: number;
    delayedProofEligible: number;
    shallowGroups: number;
    byVerdict: Record<SupplyVerdict, number>;
  };
  authoringNeeds: AuthoringNeed[];
}

export interface SupplyAuditOptions {
  /** Trust predicate; defaults to trustedAssessmentContent. Non-flagship (reference-tier) content never counts either way. */
  trusted?: (question: Question) => boolean;
  /** Transfer predicate; defaults to the repo's isTransferQuestion. */
  isTransfer?: (question: Question) => boolean;
  /** Attempts already made: seen questions and families are not unseen. */
  attempts?: readonly Attempt[];
}

/** trustedAssessmentContent passes any non-reviewed subject, so reference tier is excluded explicitly. */
const flagshipTrusted = (trusted: SupplyAuditOptions["trusted"]) =>
  (question: Question): boolean => isFlagship(question.subjectId) && (trusted ?? trustedAssessmentContent)(question);

// --- per-question features ----------------------------------------------------

const UNITS = new Set(["kg", "g", "mg", "m", "cm", "mm", "nm", "km", "s", "ms", "min", "h", "hz", "khz", "mhz", "n", "j", "kj",
  "mol", "dm", "v", "mv", "a", "ma", "w", "kw", "pa", "kpa", "atm", "l", "ml", "k", "c", "°c", "°", "%", "ev", "µf", "μf", "ω", "ohm", "ohms",
  "metres", "meters", "seconds", "minutes", "hours", "degrees", "grams", "newtons", "joules", "volts", "amps", "watts"]);
const unitToken = (token: string): boolean => {
  const bare = token.replace(/[^a-zµμω°%0-9^-]/g, "").replace(/\^?-?\d$/, "");
  return UNITS.has(bare) || (bare.length > 1 && /^[kmcdµμnp]/.test(bare) && UNITS.has(bare.slice(1)));
};

/** Text with every number and following unit removed: equal keys are number swaps. */
function numberKey(text: string): string {
  const replaced = text.toLowerCase().replace(/[−–—]/g, "-")
    .replace(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\s*[×x*]\s*10\s*\^?\s*[+-]?\d+)?(?:e[+-]?\d+)?/g, " # ")
    .replace(/[^a-z0-9#µμω°%^ -]+/g, " ");
  const out: string[] = [];
  for (const token of replaced.split(/\s+/).filter(Boolean)) {
    if (out.length && out[out.length - 1] === "#" && (unitToken(token) || token === "#")) continue;
    out.push(token);
  }
  return out.join(" ");
}

const DATA_STRUCTURES = new Set(["table-dataset", "graph-dataset", "enzyme-assay", "titration-dataset", "stoichiometric-data",
  "gas-data", "numeric-data", "mass-spectrum", "controlled-experiment", "micrograph"]);
const DATA_REPRESENTATION = /\b(?:table|graph|chart|dataset|data|spectrum|micrograph)\b/i;

/** Authored setup metadata only; prompt wording is never guessed at. */
function isDataAnalysis(question: Question): boolean {
  const prints = [question.learning?.setupFingerprint, ...question.parts.map((part) => part.learning?.setupFingerprint)];
  return prints.some((fp) => fp && (fp.structures.some((s) => DATA_STRUCTURES.has(s)) || fp.representations.some((r) => DATA_REPRESENTATION.test(r))));
}

const isSpecLinked = (question: Question): boolean =>
  Boolean(question.specPointIds?.length || question.parts.some((part) => part.specPointIds?.length));

interface Features {
  question: Question;
  id: Id;
  trusted: boolean;
  numberKey: string;
  tokens: string[];
  profiles: ReasoningProfile[];
  families: string[];
}

const promptText = (q: Question): string => `${q.stem} ${q.parts.map((part) => part.prompt).join(" ")}`;
/** Below this many content words, similarity is meaningless. */
const MIN_TOKENS = 5;

function featuresOf(question: Question, trusted: boolean): Features {
  const text = promptText(question);
  return {
    question, id: question.id, trusted, numberKey: numberKey(text),
    tokens: promptSignature(text).split(" ").filter(Boolean),
    profiles: reasoningProfilesOf(question), families: questionFamilies(question),
  };
}

/** Why two questions are one question in disguise, or null if they differ. */
function shallowRelation(a: Features, b: Features): ShallowKind | null {
  if (a.tokens.length < MIN_TOKENS || b.tokens.length < MIN_TOKENS) return null;
  if (a.numberKey === b.numberKey) return "number-swap";
  const swapped = a.tokens.length === b.tokens.length ? a.tokens.filter((token, i) => token !== b.tokens[i]).length : Infinity;
  if (swapped <= Math.max(1, Math.floor(a.tokens.length * 0.2)) ||
    textOverload(promptText(a.question), promptText(b.question)) >= NEAR_DUPLICATE) return "noun-swap";
  if (a.profiles.length && a.profiles.length === b.profiles.length &&
    a.profiles.every((pa, i) => {
      const pb = b.profiles[i]!;
      return (pa.reasoningMoves.length > 0 || pa.solutionPath.length > 0) && isNearDuplicateReasoning(pa, pb) &&
        reasoningSimilarity(pa, pb).signals.promptStructure >= 0.5;
    })) return "same-signature";
  return null;
}

class Components {
  private parent: number[];
  constructor(size: number) { this.parent = Array.from({ length: size }, (_, i) => i); }
  find(i: number): number {
    while (this.parent[i] !== i) { this.parent[i] = this.parent[this.parent[i]!]!; i = this.parent[i]!; }
    return i;
  }
  union(i: number, j: number): void {
    const a = this.find(i), b = this.find(j);
    if (a !== b) this.parent[Math.max(a, b)] = Math.min(a, b);
  }
}

interface Clustering {
  groups: ShallowGroup[];
  /** Merges shallow edges AND shared families. */
  distinct: Components;
  /** Shallow partners only (no family merging). */
  partners: Map<Id, number>;
}

function cluster(features: readonly Features[]): Clustering {
  const shallow = new Components(features.length);
  const distinct = new Components(features.length);
  const partners = new Map<Id, number>();
  const edges: Array<[number, number, ShallowKind]> = [];
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i]!, b = features[j]!;
      const kind = shallowRelation(a, b);
      if (kind) {
        shallow.union(i, j); distinct.union(i, j); edges.push([i, j, kind]);
        partners.set(a.id, (partners.get(a.id) ?? 0) + 1);
        partners.set(b.id, (partners.get(b.id) ?? 0) + 1);
      } else if (a.families.some((f) => b.families.includes(f))) distinct.union(i, j);
    }
  }
  const members = new Map<number, number[]>();
  features.forEach((_, i) => {
    const root = shallow.find(i);
    members.set(root, [...(members.get(root) ?? []), i]);
  });
  const groups: ShallowGroup[] = [];
  for (const [root, list] of members) {
    if (list.length < 2) continue;
    const kinds = new Set(edges.filter(([i]) => shallow.find(i) === root).map(([, , kind]) => kind));
    const ordered = KIND_ORDER.filter((kind) => kinds.has(kind));
    groups.push({
      kind: ordered[0]!, kinds: ordered,
      ids: list.map((i) => features[i]!.id).sort(),
      trustedIds: list.filter((i) => features[i]!.trusted).map((i) => features[i]!.id).sort(),
    });
  }
  groups.sort((x, y) => x.ids[0]!.localeCompare(y.ids[0]!));
  return { groups, distinct, partners };
}

function distinctReps(features: readonly Features[], clustering: Clustering): Id[] {
  const reps = new Map<number, Id>();
  features.forEach((f, i) => {
    const root = clustering.distinct.find(i);
    const current = reps.get(root);
    if (current === undefined || f.id < current) reps.set(root, f.id);
  });
  return [...reps.values()].sort();
}

export function verdictFor(provableDistinct: number): SupplyVerdict {
  if (provableDistinct >= MIN_PROVABLE_QUESTIONS) return "enough-for-proof";
  return provableDistinct > 0 ? "thin" : "insufficient";
}

// --- topic and subject audits -------------------------------------------------

export function auditTopicSupply(topic: Pick<Topic, "id" | "subjectId" | "title">, questions: readonly Question[], options: SupplyAuditOptions = {}): TopicSupplyAudit {
  const trustedOf = flagshipTrusted(options.trusted);
  const transferOf = options.isTransfer ?? ((q: Question) => isTransferQuestion(q));
  const attempts = options.attempts ?? [];
  const inTopic = [...questions].filter((q) => q.subjectId === topic.subjectId && q.topicIds.includes(topic.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const all = inTopic.map((q) => featuresOf(q, trustedOf(q) && unseenQuestion(q, attempts, questions)));
  const trusted = all.filter((f) => f.trusted);

  const everything = cluster(all);
  const proof = cluster(trusted);
  const provenIds = distinctReps(trusted, proof);
  const provableDistinct = provenIds.length;
  const gap = Math.max(0, MIN_PROVABLE_QUESTIONS - provableDistinct);
  const authoredDistinct = distinctReps(all, everything).length;
  const transfer = trusted.filter((f) => transferOf(f.question)).length;

  return {
    subjectId: topic.subjectId, topicId: topic.id, title: topic.title,
    questions: all.length,
    specLinked: all.filter((f) => isSpecLinked(f.question)).length,
    trusted: trusted.length,
    transfer,
    dataAnalysis: trusted.filter((f) => isDataAnalysis(f.question)).length,
    trustedFamilies: new Set(trusted.flatMap((f) => f.families)).size,
    provableDistinct,
    provenIds,
    delayedProofEligible: trusted.filter((f) => !proof.partners.has(f.id)).length,
    shallowGroups: everything.groups,
    authoredDistinct,
    verdict: verdictFor(provableDistinct),
    reviewableDistinct: Math.min(gap, Math.max(0, authoredDistinct - provableDistinct)),
  };
}

export function auditSubjectSupply(input: { subjectId: Id; label?: string; topics: readonly Topic[]; questions: readonly Question[] } & SupplyAuditOptions): SubjectSupplyAudit {
  const { subjectId, topics, questions, label: givenLabel, ...options } = input;
  const label = givenLabel ?? FLAGSHIP_SUBJECTS.find((f) => f.subjectId === subjectId)?.label ?? subjectId;
  const rows = topics.filter((t) => t.subjectId === subjectId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((topic) => auditTopicSupply(topic, questions, options));
  const sum = (pick: (row: TopicSupplyAudit) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const byVerdict: Record<SupplyVerdict, number> = { "enough-for-proof": 0, thin: 0, insufficient: 0 };
  for (const row of rows) byVerdict[row.verdict]++;
  const authoringNeeds: AuthoringNeed[] = rows
    .filter((row) => row.verdict !== "enough-for-proof" || row.transfer === 0)
    .map((row) => {
      const missingDistinct = Math.max(0, MIN_PROVABLE_QUESTIONS - row.provableDistinct);
      return {
        subjectId, topicId: row.topicId, title: row.title, verdict: row.verdict, missingDistinct,
        missingTransfer: row.transfer === 0 ? 1 : 0,
        reviewableDistinct: row.reviewableDistinct,
        action: missingDistinct > 0 && row.reviewableDistinct >= missingDistinct ? "review-existing" as const : "author-new" as const,
      };
    })
    .sort((a, b) => b.missingDistinct - a.missingDistinct || b.missingTransfer - a.missingTransfer ||
      Number(a.action === "review-existing") - Number(b.action === "review-existing") || a.topicId.localeCompare(b.topicId));
  return {
    subjectId, label, topics: rows,
    rollup: {
      topics: rows.length, questions: sum((r) => r.questions), specLinked: sum((r) => r.specLinked), trusted: sum((r) => r.trusted),
      transfer: sum((r) => r.transfer), dataAnalysis: sum((r) => r.dataAnalysis), provableDistinct: sum((r) => r.provableDistinct), authoredDistinct: sum((r) => r.authoredDistinct),
      delayedProofEligible: sum((r) => r.delayedProofEligible), shallowGroups: sum((r) => r.shallowGroups.length), byVerdict,
    },
    authoringNeeds,
  };
}

export function auditFlagshipSupply(input: { topics: readonly Topic[]; questions: readonly Question[] } & SupplyAuditOptions): SubjectSupplyAudit[] {
  return FLAGSHIP_SUBJECTS.map((flagship) => auditSubjectSupply({ ...input, subjectId: flagship.subjectId, label: flagship.label }));
}

// --- integrity ----------------------------------------------------------------

/**
 * Independent re-check of an audit against the trust predicate. Content
 * thinness is never an integrity problem; counting something it should not is.
 */
export function supplyAuditIntegrityIssues(audits: readonly SubjectSupplyAudit[], questions: readonly Question[], options: Pick<SupplyAuditOptions, "trusted"> = {}): string[] {
  const trustedOf = flagshipTrusted(options.trusted);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const issues: string[] = [];
  for (const audit of audits) for (const row of audit.topics) {
    const where = `${row.subjectId}/${row.topicId}`;
    const reps: Features[] = [];
    for (const id of row.provenIds) {
      const q = byId.get(id);
      if (!q) issues.push(`${where}: proof-eligible ${id} is not in the bank`);
      else if (!trustedOf(q)) issues.push(`${where}: proof-eligible ${id} is not trusted`);
      else reps.push(featuresOf(q, true));
    }
    for (let i = 0; i < reps.length; i++) for (let j = i + 1; j < reps.length; j++) {
      const kind = shallowRelation(reps[i]!, reps[j]!);
      if (kind) issues.push(`${where}: ${reps[i]!.id} and ${reps[j]!.id} are ${kind} variants but both count as distinct`);
      else if (reps[i]!.families.some((f) => reps[j]!.families.includes(f))) issues.push(`${where}: ${reps[i]!.id} and ${reps[j]!.id} share a family but both count as distinct`);
    }
    if (row.provableDistinct !== row.provenIds.length) issues.push(`${where}: provableDistinct ${row.provableDistinct} disagrees with ${row.provenIds.length} proven ids`);
    if (row.provableDistinct > row.trusted) issues.push(`${where}: provableDistinct exceeds trusted questions`);
    if (row.delayedProofEligible > row.trusted) issues.push(`${where}: delayed-proof eligible exceeds trusted questions`);
    if (row.verdict !== verdictFor(row.provableDistinct)) issues.push(`${where}: verdict ${row.verdict} disagrees with ${row.provableDistinct} distinct trusted questions`);
  }
  return issues;
}
