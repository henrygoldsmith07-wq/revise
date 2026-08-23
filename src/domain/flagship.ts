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
  const slug = question.id.toLowerCase();
  if (/unfamiliar/.test(slug)) return "transfer";
  if (/misconception/.test(slug)) return "misconception";
  if (/synoptic|extended-response|evidence-expansion|case-study/.test(slug)) return "synoptic";
  if (question.totalMarks >= 6) return "synoptic";
  const aoWeights = { AO1: 0, AO2: 0, AO3: 0 } as Record<string, number>;
  for (const part of question.parts) {
    for (const ao of part.aos ?? []) aoWeights[ao] = (aoWeights[ao] ?? 0) + 1;
  }
  if (aoWeights.AO3 > 0 && aoWeights.AO3 >= (aoWeights.AO2 ?? 0)) return "transfer";
  if (question.totalMarks >= 3 || aoWeights.AO2 > 0) return "application";
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
  return {
    subjectId,
    specPoints,
    statementsTotal: specPoints.length,
    goldStatements,
    goldShare: specPoints.length ? Math.round((goldStatements / specPoints.length) * 1000) / 1000 : 0,
    questionsPerStatement: specPoints.length ? Math.round((totalQuestions / specPoints.length) * 100) / 100 : 0,
    gaps,
  };
}
