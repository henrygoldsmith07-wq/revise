// ---------------------------------------------------------------------------
// Paper readiness — evidence per exam paper, not per topic.
//
// Students sit papers. This joins the spec-evidence map, open mistakes and
// depth-classified attempts to each paper's exam date and weighting. Every
// figure is a count or ratio of recorded learner evidence; where a paper's
// topics cannot be identified, or evidence is too thin, the value is null and
// labelled unknown rather than guessed.
// ---------------------------------------------------------------------------

import { questionDepthBySpecPoint, type DepthCategory } from "./flagship";
import { trustedAssessmentAttempt, independentAttempt } from "./learning-evidence";
import { buildSpecificationMap, type SpecPointEvidence } from "./specification-evidence";
import type { Attempt, ExamDate, Id, Mistake, Question, Subject, Topic, Unit } from "./types";

const DAY_MS = 86_400_000;
export const MIN_STRENGTH_ATTEMPTS = 3;
const TRANSFER_PASS = 0.6;

export type PaperMapping = "single-paper" | "unit-title" | "explicit" | "unknown";
export type PaperEvidenceLabel = "none" | "thin" | "building" | "solid";

export interface PaperStrength {
  attempts: number;
  /** Null until MIN_STRENGTH_ATTEMPTS independent trusted answers exist. */
  accuracy: number | null;
}

export interface PaperReadiness {
  paperId: Id;
  name: string;
  subjectId: Id;
  weight: number;
  examDate: string | null;
  /** Negative when the exam has passed; null with no date. */
  daysUntil: number | null;
  mapping: PaperMapping;
  topicIds: Id[];
  statements: number;
  secure: number;
  weak: number;
  missing: number;
  /** Null when the paper's topics are unknown or it has no spec statements. */
  secureShare: number | null;
  untouched: number;
  marksAtRisk: number;
  unresolvedMistakes: number;
  recurringMistakes: number;
  recall: PaperStrength;
  application: PaperStrength;
  transfer: PaperStrength;
  /** Statements with trusted, independent success on a transfer-depth question. */
  transferProven: number;
  /** Statements with transfer-depth questions available but no proof yet. */
  transferUnproven: number;
  paperAttempts: number;
  evidence: PaperEvidenceLabel;
  strongestTopicId: Id | null;
  gapTopicId: Id | null;
  nextProof: { kind: "first-evidence" | "repair" | "transfer" | "timed-paper" | "maintain" | "unknown"; topicId: Id | null; text: string };
  /** Higher = act sooner. Null when there is nothing to rank. */
  urgency: number | null;
}

export interface PaperReadinessInput {
  subject: Subject;
  topics: readonly Topic[];
  units?: readonly Unit[];
  questions: readonly Question[];
  attempts: readonly Attempt[];
  mistakes: readonly Mistake[];
  examDates?: readonly ExamDate[];
  /** Explicit paper → topic ids; wins over inferred mapping. */
  topicPaperMap?: Readonly<Record<Id, readonly Id[]>>;
  now?: Date;
}

/** Topics a paper covers, only where the curriculum data actually says so. */
export function resolvePaperTopics(
  subject: Subject,
  topics: readonly Topic[],
  units: readonly Unit[] = [],
  explicit?: Readonly<Record<Id, readonly Id[]>>,
): Map<Id, { topicIds: Id[]; mapping: PaperMapping }> {
  const out = new Map<Id, { topicIds: Id[]; mapping: PaperMapping }>();
  const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
  const unitTitle = new Map(units.map((unit) => [unit.id, unit.title] as const));
  for (const paper of subject.papers) {
    const given = explicit?.[paper.id];
    if (given) {
      out.set(paper.id, { topicIds: [...given], mapping: "explicit" });
      continue;
    }
    if (subject.papers.length === 1) {
      out.set(paper.id, { topicIds: subjectTopics.map((topic) => topic.id), mapping: "single-paper" });
      continue;
    }
    // Only "Unit N" statements printed in the unit title are trusted as a link.
    const suffix = /\.u(\d+)$/.exec(paper.id)?.[1];
    const ids = suffix
      ? subjectTopics.filter((topic) => new RegExp(`\\bUnit ${suffix}\\b`).test(unitTitle.get(topic.unitId) ?? "")).map((topic) => topic.id)
      : [];
    out.set(paper.id, { topicIds: ids, mapping: ids.length ? "unit-title" : "unknown" });
  }
  return out;
}

function strength(rows: Array<{ awarded: number; max: number }>): PaperStrength {
  const max = rows.reduce((sum, row) => sum + row.max, 0);
  const awarded = rows.reduce((sum, row) => sum + row.awarded, 0);
  return {
    attempts: rows.length,
    accuracy: rows.length >= MIN_STRENGTH_ATTEMPTS && max > 0 ? Math.round((awarded / max) * 100) / 100 : null,
  };
}

function daysBetween(date: string, now: Date): number {
  const target = Date.parse(`${date}T00:00:00`);
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00`);
  return Math.round((target - today) / DAY_MS);
}

export function buildPaperReadiness(input: PaperReadinessInput): PaperReadiness[] {
  const now = input.now ?? new Date();
  const { subject } = input;
  const questions = input.questions.filter((question) => question.subjectId === subject.id);
  const questionsById = new Map(questions.map((question) => [question.id, question] as const));
  const attempts = input.attempts.filter((attempt) => attempt.subjectId === subject.id);
  const specMap = buildSpecificationMap({
    subjectId: subject.id,
    attempts: attempts as Attempt[],
    questions: questions as Question[],
    topics: input.topics as Topic[],
    units: input.units as Unit[] | undefined,
    now,
  });
  const pointsByTopic = new Map<Id, SpecPointEvidence[]>();
  for (const unit of specMap.units) for (const row of unit.topics) pointsByTopic.set(row.topic.id, row.points);

  const depth = new Map(questions.map((question) => [question.id, questionDepthBySpecPoint(question)] as const));
  const mapping = resolvePaperTopics(subject, input.topics, input.units ? [...input.units] : [], input.topicPaperMap);

  return subject.papers.map((paper) => {
    const resolved = mapping.get(paper.id) ?? { topicIds: [], mapping: "unknown" as const };
    const topicSet = new Set(resolved.topicIds);
    const known = resolved.topicIds.length > 0;

    const upcoming = (input.examDates ?? [])
      .filter((exam) => exam.subjectId === subject.id && exam.paperSpecId === paper.id)
      .map((exam) => ({ date: exam.date, days: daysBetween(exam.date, now) }))
      .sort((a, b) => (a.days < 0 ? 1 : 0) - (b.days < 0 ? 1 : 0) || a.days - b.days)[0];

    const points = resolved.topicIds.flatMap((id) => pointsByTopic.get(id) ?? []);
    const secure = points.filter((point) => point.status === "secure").length;
    const missing = points.filter((point) => point.status === "no-evidence").length;
    const weak = points.length - secure - missing;

    const open = input.mistakes.filter((mistake) => !mistake.resolved && mistake.marksLost > 0 && topicSet.has(mistake.topicId));
    const groups = new Map<string, Set<Id>>();
    for (const mistake of open) {
      const key = `${mistake.topicId}|${mistake.misconceptionEntryId ?? mistake.misconception ?? mistake.category}`;
      const set = groups.get(key) ?? new Set<Id>();
      set.add(mistake.questionId ?? mistake.id);
      groups.set(key, set);
    }
    const recurring = [...groups.values()].filter((set) => set.size >= 2).length;

    const pointIds = new Set(points.map((point) => point.specPointId));
    const byCategory: Record<"recall" | "application" | "transfer", Array<{ awarded: number; max: number }>> = { recall: [], application: [], transfer: [] };
    const provenPoints = new Set<Id>();
    for (const attempt of attempts) {
      if (!independentAttempt(attempt)) continue;
      const question = questionsById.get(attempt.questionId);
      if (!question || !trustedAssessmentAttempt(attempt, question, attempts, questions)) continue;
      const byPoint = depth.get(question.id);
      if (!byPoint) continue;
      const categories = new Set<DepthCategory>();
      for (const [pointId, cats] of byPoint) {
        if (!pointIds.has(pointId)) continue;
        for (const cat of cats) categories.add(cat);
        if (cats.has("transfer") && attempt.awarded / attempt.max >= TRANSFER_PASS) provenPoints.add(pointId);
      }
      for (const cat of ["recall", "application", "transfer"] as const) {
        if (categories.has(cat)) byCategory[cat].push({ awarded: attempt.awarded, max: attempt.max });
      }
    }
    const transferAvailable = new Set<Id>();
    for (const question of questions) {
      for (const [pointId, cats] of depth.get(question.id) ?? []) if (pointIds.has(pointId) && cats.has("transfer")) transferAvailable.add(pointId);
    }
    const transferUnproven = [...transferAvailable].filter((id) => !provenPoints.has(id)).length;

    const paperAttempts = attempts.filter((attempt) => attempt.paperSpecId === paper.id && trustworthyPaper(attempt)).length;
    const attemptsInPaper = attempts.filter((attempt) => attempt.topicIds.some((id) => topicSet.has(id))).length;
    const evidence: PaperEvidenceLabel = !known || attemptsInPaper === 0 ? "none"
      : attemptsInPaper < 8 ? "thin" : secure / Math.max(1, points.length) >= 0.5 ? "solid" : "building";

    const topicRows = resolved.topicIds.map((id) => {
      const rows = pointsByTopic.get(id) ?? [];
      const topicOpen = open.filter((mistake) => mistake.topicId === id);
      return {
        id,
        secure: rows.filter((row) => row.status === "secure").length,
        total: rows.length,
        lacking: rows.filter((row) => row.status !== "secure").length,
        marks: topicOpen.reduce((sum, mistake) => sum + mistake.marksLost, 0),
      };
    }).filter((row) => row.total > 0);
    const strongest = topicRows.filter((row) => row.secure > 0).sort((a, b) => b.secure / b.total - a.secure / a.total || b.secure - a.secure || a.id.localeCompare(b.id))[0];
    const gap = topicRows.filter((row) => row.lacking > 0 || row.marks > 0)
      .sort((a, b) => b.marks - a.marks || b.lacking - a.lacking || a.id.localeCompare(b.id))[0];

    const marksAtRisk = Math.round(open.reduce((sum, mistake) => sum + mistake.marksLost, 0) * 10) / 10;
    const nextProof = pickNextProof({ known, points: points.length, missing, marksAtRisk, transferUnproven, paperAttempts, gapTopicId: gap?.id ?? null, days: upcoming?.days ?? null });

    const days = upcoming?.days ?? null;
    const urgency = known && points.length && (days === null || days >= 0)
      ? Math.round(paper.weight * (1 - secure / points.length) * (days === null ? 1 : 30 / Math.max(3, days)) * 1000) / 1000
      : null;

    return {
      paperId: paper.id,
      name: paper.name,
      subjectId: subject.id,
      weight: paper.weight,
      examDate: upcoming?.date ?? null,
      daysUntil: days,
      mapping: resolved.mapping,
      topicIds: resolved.topicIds,
      statements: points.length,
      secure,
      weak,
      missing,
      secureShare: known && points.length ? Math.round((secure / points.length) * 100) / 100 : null,
      untouched: missing,
      marksAtRisk,
      unresolvedMistakes: open.length,
      recurringMistakes: recurring,
      recall: strength(byCategory.recall),
      application: strength(byCategory.application),
      transfer: strength(byCategory.transfer),
      transferProven: provenPoints.size,
      transferUnproven,
      paperAttempts,
      evidence,
      strongestTopicId: strongest?.id ?? null,
      gapTopicId: gap?.id ?? null,
      nextProof,
      urgency,
    };
  });
}

function trustworthyPaper(attempt: Attempt): boolean {
  return attempt.mode === "paper" && attempt.max > 0;
}

function pickNextProof(input: {
  known: boolean; points: number; missing: number; marksAtRisk: number; transferUnproven: number;
  paperAttempts: number; gapTopicId: Id | null; days: number | null;
}): PaperReadiness["nextProof"] {
  if (!input.known || !input.points) return { kind: "unknown", topicId: null, text: "Which topics this paper covers is not recorded, so no paper-level proof can be chosen." };
  if (input.marksAtRisk > 0) return { kind: "repair", topicId: input.gapTopicId, text: "Clear the open mistakes with a different question." };
  if (input.missing > 0) return { kind: "first-evidence", topicId: input.gapTopicId, text: "Get first independent evidence on statements you have not touched." };
  if (input.transferUnproven > 0) return { kind: "transfer", topicId: input.gapTopicId, text: "Prove it on an unfamiliar-context question." };
  if (input.paperAttempts === 0 && input.days !== null && input.days >= 0 && input.days <= 28) return { kind: "timed-paper", topicId: null, text: "No timed paper evidence yet: sit a timed section." };
  return { kind: "maintain", topicId: null, text: "Evidence is broad; keep it fresh with spaced retrieval." };
}

/** Papers ordered by what to work on first; unknown/passed papers last. */
export function rankPapers(rows: readonly PaperReadiness[]): PaperReadiness[] {
  return [...rows].sort((a, b) => (b.urgency ?? -1) - (a.urgency ?? -1) || a.paperId.localeCompare(b.paperId));
}
