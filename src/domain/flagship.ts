// ---------------------------------------------------------------------------
// Flagship depth programme — depth over breadth.
//
// Instead of counting subjects, we count ASSETS PER SPECIFICATION STATEMENT:
//   statement → retrieval cards · simple question · application question ·
//   unfamiliar-context question · misconception question · harder/synoptic
//   question · worked solution · examiner notes · verified provenance.
//
// The headline this module makes computable (and eventually provable):
//   "X% of <flagship>'s specification statements have at least four
//    independently reviewed exam questions covering recall, application
//    and transfer."
//
// Pure domain: classification and aggregation only; callers supply content.
// ---------------------------------------------------------------------------

import type { Id, Question, Topic } from "./types";

export interface FlagshipSubject {
  subjectId: Id;
  label: string;
  tier: 1 | 2;
}

/** Depth-first flagship combinations. Everything else stays reference-tier. */
export const FLAGSHIP_SUBJECTS: FlagshipSubject[] = [
  { subjectId: "wjec-alevel-maths", label: "WJEC A-level Mathematics", tier: 1 },
  { subjectId: "wjec-alevel-biology", label: "WJEC A-level Biology", tier: 1 },
  { subjectId: "wjec-alevel-chemistry", label: "WJEC A-level Chemistry", tier: 1 },
  { subjectId: "wjec-alevel-physics", label: "WJEC A-level Physics", tier: 1 },
];

export function isFlagship(subjectId: Id): boolean {
  return FLAGSHIP_SUBJECTS.some((f) => f.subjectId === subjectId);
}

// --- question depth classification -------------------------------------------

export type DepthCategory = "recall" | "application" | "transfer" | "misconception" | "synoptic";

/**
 * One primary depth category per question, derived from authored signals:
 * unfamiliar-context slugs → transfer; misconception slugs/tags → misconception;
 * 6+ mark or extended/synoptic/evidence packs → synoptic; AO3-dominant or
 * 3–5 mark application; everything else recall.
 */
export function classifyDepth(question: Question): DepthCategory {
  // Generated and authored depth packs carry an explicit demand. Honour it
  // before inferring from ids/marks so the coverage ledger reports the actual
  // learning design (including calculation and explanation as application
  // practice) rather than flattening every new item into an AO/mark heuristic.
  switch (question.learning?.demand) {
    case "recall": return "recall";
    case "misconception": return "misconception";
    case "transfer": return "transfer";
    case "synoptic": return "synoptic";
    case "application":
    case "explanation":
    case "calculation": return "application";
    default: break;
  }
  const slug = question.id.toLowerCase();
  if (/unfamiliar/.test(slug)) return "transfer";
  if (/misconception/.test(slug)) return "misconception";
  if (/synoptic|extended-response|evidence-expansion|case-study/.test(slug)) return "synoptic";
  if (question.totalMarks >= 6) return "synoptic";
  const aoWeights = { AO1: 0, AO2: 0, AO3: 0 } as Record<"AO1" | "AO2" | "AO3", number>;
  for (const part of question.parts) {
    for (const ao of part.aos ?? []) aoWeights[ao] = (aoWeights[ao] ?? 0) + 1;
  }
  const ao3 = aoWeights.AO3 ?? 0;
  const ao2 = aoWeights.AO2 ?? 0;
  if (ao3 > 0 && ao3 >= ao2) return "transfer";
  if (question.totalMarks >= 3 || ao2 > 0) return "application";
  return "recall";
}

// --- per-statement aggregation -----------------------------------------------

export interface SpecPointDepth {
  specPointId: Id;
  topicId: Id;
  /** Questions touching this statement, bucketed by depth category. */
  categories: Partial<Record<DepthCategory, number>>;
  distinctQuestions: number;
  retrievalCards: number;
  workedSolutionsComplete: boolean;
  examinerNotes: boolean;
  verification: "unverified" | "checked" | "verified";
}

export interface SubjectDepth {
  subjectId: Id;
  specPoints: SpecPointDepth[];
  statementsTotal: number;
  /** Statements with >=4 independent questions spanning recall+application+transfer. */
  goldStatements: number;
  goldShare: number;
  questionsPerStatement: number;
  /** Ordered worst-first: what to author next. */
  gaps: Array<{ specPointId: Id; topicId: Id; missing: DepthCategory[] }>;
  /** Full quality-bar coverage (see deepStatementCoverage): share meeting every rung. */
  deepStatements?: number;
  deepShare?: number;
}

/** One statement checked against the full flagship quality bar. */
export interface DeepStatement {
  specPointId: Id;
  topicId: Id;
  hasRetrieval: boolean;
  hasMisconception: boolean;
  hasApplication: boolean;
  hasHarderApplication: boolean;
  hasTransfer: boolean;
  hasWorkedSolution: boolean;
  hasMarkScheme: boolean;
  hasExaminerGuidance: boolean;
  provenanceComplete: boolean;
  verified: boolean;
  meetsBar: boolean;
  missing: string[];
}

export interface DepthInput {
  topics: Topic[];
  questions: Question[];
  /** Retrieval-card counts keyed by topicId. */
  cardCountByTopic: Map<Id, number>;
}

function hasWorkedSolutions(question: Question): boolean {
  return question.parts.length > 0 && question.parts.every((p) => (p.modelAnswer ?? "").trim().length > 0);
}

export function buildSubjectDepth(input: DepthInput): SubjectDepth {
  const subjectId = input.topics[0]?.id.split(".").slice(0, -1).join(".") ?? "";
  // Bucket questions by the spec points their parts declare.
  const bySpecPoint = new Map<Id, { categories: Map<DepthCategory, number>; questionIds: Set<Id> }>();
  for (const question of input.questions) {
    if (question.subjectId !== subjectId) continue;
    const category = classifyDepth(question);
    const touched = new Set<Id>();
    for (const part of question.parts) {
      for (const spId of part.specPointIds ?? []) {
        touched.add(spId);
        const entry = bySpecPoint.get(spId) ?? { categories: new Map(), questionIds: new Set() };
        entry.categories.set(category, (entry.categories.get(category) ?? 0) + 1);
        entry.questionIds.add(question.id);
        bySpecPoint.set(spId, entry);
      }
    }
  }

  const specPoints: SpecPointDepth[] = [];
  for (const topic of input.topics) {
    const retrievalCards = input.cardCountByTopic.get(topic.id) ?? 0;
    const examinerNotes = (topic.commonErrors?.length ?? 0) > 0 || (topic.keyPoints?.length ?? 0) > 0;
    for (const sp of topic.specPoints ?? []) {
      const entry = bySpecPoint.get(sp.id);
      const categories: Partial<Record<DepthCategory, number>> = {};
      let distinct = 0;
      if (entry) {
        for (const [category, count] of entry.categories) categories[category] = count;
        distinct = entry.questionIds.size;
      }
      specPoints.push({
        specPointId: sp.id,
        topicId: topic.id,
        categories,
        distinctQuestions: distinct,
        retrievalCards,
        workedSolutionsComplete: false, // refined below against covering questions
        examinerNotes,
        verification: sp.verification ?? topic.verification ?? "unverified",
      } as SpecPointDepth);
      void hasWorkedSolutions;
    }
  }

  // Worked-solution completeness is a property of the covering questions:
  // a statement counts as having full worked solutions when every covering
  // question models an answer for each of its parts.
  const questionsBySubject = input.questions.filter((q) => q.subjectId === subjectId);
  for (const sp of specPoints) {
    const covering = questionsBySubject.filter((q) =>
      q.parts.some((part) => (part.specPointIds ?? []).includes(sp.specPointId)),
    );
    sp.workedSolutionsComplete =
      covering.length > 0 && covering.every(hasWorkedSolutions);
  }

  const GOLD_MIN_QUESTIONS = 4;
  const GOLD_REQUIRED: DepthCategory[] = ["recall", "application", "transfer"];
  let goldStatements = 0;
  const gaps: SubjectDepth["gaps"] = [];
  for (const sp of specPoints) {
    const cats = (Object.keys(sp.categories) as DepthCategory[]).filter((c) => (sp.categories[c] ?? 0) > 0);
    const missing = GOLD_REQUIRED.filter((c) => !cats.includes(c));
    const enough = sp.distinctQuestions >= GOLD_MIN_QUESTIONS;
    if (enough && missing.length === 0 && sp.workedSolutionsComplete) goldStatements++;
    gaps.push({
      specPointId: sp.specPointId,
      topicId: sp.topicId,
      missing: enough ? missing : [...new Set([...missing, "coverage" as DepthCategory])] as DepthCategory[],
    });
  }
  gaps.sort((a, b) => b.missing.length - a.missing.length);

  const totalQuestions = specPoints.reduce((acc, sp) => acc + sp.distinctQuestions, 0);
  const deep = deepStatementCoverage(input);
  return {
    subjectId,
    specPoints,
    statementsTotal: specPoints.length,
    goldStatements,
    goldShare: specPoints.length ? Math.round((goldStatements / specPoints.length) * 1000) / 1000 : 0,
    questionsPerStatement: specPoints.length ? Math.round((totalQuestions / specPoints.length) * 100) / 100 : 0,
    gaps,
    deepStatements: deep.filter((d) => d.meetsBar).length,
    deepShare: specPoints.length ? Math.round((deep.filter((d) => d.meetsBar).length / specPoints.length) * 1000) / 1000 : 0,
  };
}

/**
 * Full flagship quality bar per statement — the auditable depth metric.
 *
 * A statement meets the bar only with: retrieval cards, misconception
 * coverage, application, harder/synoptic application, unfamiliar transfer, a
 * worked solution and mark scheme for every covering question, examiner
 * guidance on the topic, complete provenance, and verified status.
 * The share meeting every rung is the headline to raise toward 95%; gold
 * (recall+application+transfer) remains the stepping stone.
 */
export function deepStatementCoverage(input: DepthInput): DeepStatement[] {
  const subjectId = input.topics[0]?.id.split(".").slice(0, -1).join(".") ?? "";
  const questionsBySubject = input.questions.filter((q) => q.subjectId === subjectId);
  const topicsById = new Map(input.topics.map((t) => [t.id, t] as const));
  // Reuse the per-statement aggregation for categories/distinct/worked.
  const depth = buildSubjectDepthWithoutDeep(input);
  const out: DeepStatement[] = [];
  for (const sp of depth) {
    const topic = topicsById.get(sp.topicId);
    const covering = questionsBySubject.filter((q) =>
      q.parts.some((part) => (part.specPointIds ?? []).includes(sp.specPointId)),
    );
    const hasRetrieval = sp.retrievalCards > 0;
    const hasMisconception = (sp.categories.misconception ?? 0) > 0;
    const hasApplication = (sp.categories.application ?? 0) > 0;
    const hasHarderApplication = (sp.categories.synoptic ?? 0) > 0;
    const hasTransfer = (sp.categories.transfer ?? 0) > 0;
    const hasWorkedSolution = sp.workedSolutionsComplete && covering.length > 0;
    const hasMarkScheme =
      covering.length > 0 && covering.every((q) => q.parts.length > 0 && q.parts.every((p) => p.markScheme.length > 0));
    const hasExaminerGuidance = (topic?.keyPoints?.length ?? 0) > 0 && (topic?.commonErrors?.length ?? 0) > 0;
    const specPoint = topic?.specPoints?.find((s) => s.id === sp.specPointId);
    const provenanceComplete = Boolean(
      (specPoint?.source ?? topic?.source) &&
        (specPoint?.verification ?? topic?.verification) &&
        (specPoint?.reviewer ?? topic?.reviewer) &&
        (specPoint?.lastChecked ?? topic?.lastChecked) &&
        (specPoint?.specVersion ?? topic?.specVersion),
    );
    const verified = (specPoint?.verification ?? topic?.verification) === "verified";
    const missing: string[] = [];
    if (!hasRetrieval) missing.push("retrieval");
    if (!hasMisconception) missing.push("misconception");
    if (!hasApplication) missing.push("application");
    if (!hasHarderApplication) missing.push("harder-application");
    if (!hasTransfer) missing.push("transfer");
    if (!hasWorkedSolution) missing.push("worked-solution");
    if (!hasMarkScheme) missing.push("mark-scheme");
    if (!hasExaminerGuidance) missing.push("examiner-guidance");
    if (!provenanceComplete) missing.push("provenance");
    if (!verified) missing.push("verification");
    out.push({
      specPointId: sp.specPointId,
      topicId: sp.topicId,
      hasRetrieval,
      hasMisconception,
      hasApplication,
      hasHarderApplication,
      hasTransfer,
      hasWorkedSolution,
      hasMarkScheme,
      hasExaminerGuidance,
      provenanceComplete,
      verified,
      meetsBar: missing.length === 0,
      missing,
    });
  }
  return out;
}

/** buildSubjectDepth without the deep pass (breaks the recursion). */
function buildSubjectDepthWithoutDeep(input: DepthInput): SpecPointDepth[] {
  const subjectId = input.topics[0]?.id.split(".").slice(0, -1).join(".") ?? "";
  const bySpecPoint = new Map<Id, { categories: Map<DepthCategory, number>; questionIds: Set<Id> }>();
  for (const question of input.questions) {
    if (question.subjectId !== subjectId) continue;
    const category = classifyDepth(question);
    for (const part of question.parts) {
      for (const spId of part.specPointIds ?? []) {
        const entry = bySpecPoint.get(spId) ?? { categories: new Map(), questionIds: new Set() };
        entry.categories.set(category, (entry.categories.get(category) ?? 0) + 1);
        entry.questionIds.add(question.id);
        bySpecPoint.set(spId, entry);
      }
    }
  }
  const specPoints: SpecPointDepth[] = [];
  for (const topic of input.topics) {
    const retrievalCards = input.cardCountByTopic.get(topic.id) ?? 0;
    const examinerNotes = (topic.commonErrors?.length ?? 0) > 0 || (topic.keyPoints?.length ?? 0) > 0;
    for (const sp of topic.specPoints ?? []) {
      const entry = bySpecPoint.get(sp.id);
      const categories: Partial<Record<DepthCategory, number>> = {};
      let distinct = 0;
      if (entry) {
        for (const [category, count] of entry.categories) categories[category] = count;
        distinct = entry.questionIds.size;
      }
      specPoints.push({
        specPointId: sp.id,
        topicId: topic.id,
        categories,
        distinctQuestions: distinct,
        retrievalCards,
        workedSolutionsComplete: false,
        examinerNotes,
        verification: sp.verification ?? topic.verification ?? "unverified",
      } as SpecPointDepth);
    }
  }
  const questionsBySubject = input.questions.filter((q) => q.subjectId === subjectId);
  for (const sp of specPoints) {
    const covering = questionsBySubject.filter((q) =>
      q.parts.some((part) => (part.specPointIds ?? []).includes(sp.specPointId)),
    );
    sp.workedSolutionsComplete = covering.length > 0 && covering.every(hasWorkedSolutionsLocal);
  }
  return specPoints;
}

function hasWorkedSolutionsLocal(question: Question): boolean {
  return question.parts.length > 0 && question.parts.every((p) => (p.modelAnswer ?? "").trim().length > 0);
}
