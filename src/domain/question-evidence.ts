import type {
  Attempt,
  ContentSource,
  Id,
  IsoDate,
  Question,
  QuestionPart,
  Subject,
  Topic,
  VerificationStatus,
} from "./types";

/**
 * The question evidence database is a live index, not a second copy of the
 * question store. It joins persisted questions and attempts to the authored
 * curriculum so every question can answer: what does this test, where did it
 * come from, how was it checked, and what has the student observed so far?
 */

export type EvidenceCoverage = "complete" | "partial" | "unmapped";
export type QuestionEvidenceFilter = "all" | "needs-review" | "verified" | "mapped" | "unmapped" | "attempted";
export type QuestionEvidenceSort = "attention" | "recent" | "marks" | "question";

export type QuestionEvidenceFlag =
  | "unmapped"
  | "partial-mapping"
  | "unknown-spec-point"
  | "unverified"
  | "not-checked"
  | "stale"
  | "incomplete-mark-scheme"
  | "missing-learning-claims";

export interface QuestionEvidenceSpecPoint {
  id: Id;
  ref: string;
  text: string;
  aos: string[];
  verification: VerificationStatus;
  source?: ContentSource;
  specVersion?: string;
  lastChecked?: IsoDate | null;
}

export interface QuestionEvidencePart {
  id: Id;
  label: string;
  prompt: string;
  marks: number;
  markScheme: string[];
  learningClaims: string[];
  modelAnswer: string;
  specPointIds: Id[];
}

export interface QuestionAttemptEvidence {
  count: number;
  awarded: number;
  max: number;
  percentage: number | null;
  lastAttemptAt: string | null;
  latestFeedback: string | null;
  latestMarkedBy: Attempt["markedBy"] | null;
}

export interface QuestionEvidenceRecord {
  question: Question;
  subject: Subject | null;
  topics: Topic[];
  specPoints: QuestionEvidenceSpecPoint[];
  parts: QuestionEvidencePart[];
  coverage: EvidenceCoverage;
  verification: VerificationStatus;
  source: ContentSource | null;
  flags: QuestionEvidenceFlag[];
  attempts: QuestionAttemptEvidence;
  lastChecked: IsoDate | null;
  searchText: string;
}

export interface QuestionEvidenceSummary {
  total: number;
  complete: number;
  partial: number;
  unmapped: number;
  verified: number;
  needsReview: number;
  attempted: number;
  specPointsLinked: number;
  markSchemePoints: number;
}

export interface QuestionEvidenceDatabase {
  records: QuestionEvidenceRecord[];
  summary: QuestionEvidenceSummary;
}

export interface QuestionEvidenceQuery {
  query?: string;
  subjectId?: Id;
  filter?: QuestionEvidenceFilter;
  sort?: QuestionEvidenceSort;
  limit?: number;
}

export interface QuestionEvidenceInput {
  questions: readonly Question[];
  attempts: readonly Attempt[];
  subjects: readonly Subject[];
  topics: readonly Topic[];
  today?: IsoDate;
}

const STALE_DAYS = 365;

export function buildQuestionEvidenceDatabase(input: QuestionEvidenceInput): QuestionEvidenceDatabase {
  const subjectsById = new Map(input.subjects.map((subject) => [subject.id, subject]));
  const topicsById = new Map(input.topics.map((topic) => [topic.id, topic]));
  const attemptsByQuestion = groupAttempts(input.attempts);
  const records = input.questions.map((question) =>
    buildRecord(question, subjectsById, topicsById, attemptsByQuestion.get(question.id) ?? [], input.today),
  );

  return { records, summary: summariseQuestionEvidence(records) };
}

export function queryQuestionEvidence(
  database: QuestionEvidenceDatabase,
  options: QuestionEvidenceQuery = {},
): QuestionEvidenceRecord[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const filtered = database.records.filter((record) => {
    if (options.subjectId && record.question.subjectId !== options.subjectId) return false;
    if (!matchesFilter(record, options.filter ?? "all")) return false;
    return !query || query.split(/\s+/).every((term) => record.searchText.includes(term));
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query) {
      const scoreDelta = searchScore(b, query) - searchScore(a, query);
      if (scoreDelta !== 0) return scoreDelta;
    }
    const sort = options.sort ?? "attention";
    if (sort === "recent") return compareNullableDate(b.attempts.lastAttemptAt, a.attempts.lastAttemptAt) || compareQuestion(a, b);
    if (sort === "marks") return b.question.totalMarks - a.question.totalMarks || compareQuestion(a, b);
    if (sort === "question") return compareQuestion(a, b);
    return b.flags.length - a.flags.length || compareNullableDate(a.lastChecked, b.lastChecked) || compareQuestion(a, b);
  });

  return options.limit === undefined ? sorted : sorted.slice(0, Math.max(0, options.limit));
}

export function summariseQuestionEvidence(records: readonly QuestionEvidenceRecord[]): QuestionEvidenceSummary {
  return {
    total: records.length,
    complete: records.filter((record) => record.coverage === "complete").length,
    partial: records.filter((record) => record.coverage === "partial").length,
    unmapped: records.filter((record) => record.coverage === "unmapped").length,
    verified: records.filter((record) => record.verification === "verified").length,
    needsReview: records.filter((record) => record.flags.length > 0).length,
    attempted: records.filter((record) => record.attempts.count > 0).length,
    specPointsLinked: new Set(records.flatMap((record) => record.specPoints.map((point) => point.id))).size,
    markSchemePoints: records.reduce((total, record) => total + record.parts.reduce((sum, part) => sum + part.markScheme.length, 0), 0),
  };
}

function buildRecord(
  question: Question,
  subjectsById: ReadonlyMap<Id, Subject>,
  topicsById: ReadonlyMap<Id, Topic>,
  attempts: readonly Attempt[],
  today?: IsoDate,
): QuestionEvidenceRecord {
  const topics = question.topicIds.map((id) => topicsById.get(id)).filter((topic): topic is Topic => Boolean(topic));
  const requestedSpecPointIds = unique([
    ...(question.specPointIds ?? []),
    ...question.parts.flatMap((part) => part.specPointIds ?? []),
  ]);
  const specPointById = new Map<string, QuestionEvidenceSpecPoint>();
  for (const topic of topics) {
    for (const point of topic.specPoints ?? []) {
      specPointById.set(point.id, {
        id: point.id,
        ref: point.ref,
        text: point.text,
        aos: [...point.aos],
        verification: point.verification ?? topic.verification ?? "unverified",
        source: point.source ?? topic.source,
        specVersion: point.specVersion ?? topic.specVersion,
        lastChecked: point.lastChecked ?? topic.lastChecked ?? null,
      });
    }
  }

  const specPoints = requestedSpecPointIds
    .map((id) => specPointById.get(id))
    .filter((point): point is QuestionEvidenceSpecPoint => Boolean(point));
  const unknownSpecPoints = requestedSpecPointIds.filter((id) => !specPointById.has(id));
  const coverage: EvidenceCoverage =
    requestedSpecPointIds.length === 0 || specPoints.length === 0
      ? "unmapped"
      : specPoints.length < requestedSpecPointIds.length
        ? "partial"
        : "complete";
  const parts = question.parts.map(questionEvidencePart);
  const flags = flagsFor(question, parts, coverage, unknownSpecPoints, today);
  const attemptEvidence = summariseAttempts(attempts);
  const lastChecked = question.lastChecked ?? latestDate(specPoints.map((point) => point.lastChecked ?? null));

  return {
    question,
    subject: subjectsById.get(question.subjectId) ?? null,
    topics,
    specPoints,
    parts,
    coverage,
    verification: question.verification ?? "unverified",
    source: question.source ?? null,
    flags,
    attempts: attemptEvidence,
    lastChecked,
    searchText: searchableText(question, subjectsById.get(question.subjectId), topics, specPoints, parts),
  };
}

function questionEvidencePart(part: QuestionPart): QuestionEvidencePart {
  return {
    id: part.id,
    label: part.label,
    prompt: part.prompt,
    marks: part.marks,
    markScheme: [...part.markScheme],
    learningClaims: [...(part.learningClaims ?? [])],
    modelAnswer: part.modelAnswer,
    specPointIds: [...(part.specPointIds ?? [])],
  };
}

function flagsFor(
  question: Question,
  parts: readonly QuestionEvidencePart[],
  coverage: EvidenceCoverage,
  unknownSpecPoints: readonly Id[],
  today?: IsoDate,
): QuestionEvidenceFlag[] {
  const flags: QuestionEvidenceFlag[] = [];
  if (coverage === "unmapped") flags.push("unmapped");
  if (coverage === "partial") flags.push("partial-mapping");
  if (unknownSpecPoints.length) flags.push("unknown-spec-point");
  if (question.verification !== "verified") flags.push("unverified");
  if (!question.lastChecked) flags.push("not-checked");
  else if (today && daysBetween(question.lastChecked, today) > STALE_DAYS) flags.push("stale");
  if (parts.some((part) => part.markScheme.length < part.marks)) flags.push("incomplete-mark-scheme");
  if (parts.some((part) => part.specPointIds.length > 0 && part.learningClaims.length < part.markScheme.length)) {
    flags.push("missing-learning-claims");
  }
  return flags;
}

function summariseAttempts(attempts: readonly Attempt[]): QuestionAttemptEvidence {
  const awarded = attempts.reduce((total, attempt) => total + attempt.awarded, 0);
  const max = attempts.reduce((total, attempt) => total + attempt.max, 0);
  const latest = [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return {
    count: attempts.length,
    awarded,
    max,
    percentage: max > 0 ? awarded / max : null,
    lastAttemptAt: latest?.createdAt ?? null,
    latestFeedback: latest?.feedback ?? null,
    latestMarkedBy: latest?.markedBy ?? null,
  };
}

function searchableText(
  question: Question,
  subject: Subject | undefined,
  topics: readonly Topic[],
  specPoints: readonly QuestionEvidenceSpecPoint[],
  parts: readonly QuestionEvidencePart[],
): string {
  return [
    question.stem,
    question.origin,
    question.source,
    question.verification,
    question.specVersion,
    subject?.name,
    ...topics.flatMap((topic) => [topic.title, topic.specRef]),
    ...specPoints.flatMap((point) => [point.id, point.ref, point.text, ...point.aos]),
    ...parts.flatMap((part) => [part.label, part.prompt, ...part.markScheme, ...part.learningClaims]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function matchesFilter(record: QuestionEvidenceRecord, filter: QuestionEvidenceFilter): boolean {
  if (filter === "needs-review") return record.flags.length > 0;
  if (filter === "verified") return record.verification === "verified";
  if (filter === "mapped") return record.coverage !== "unmapped";
  if (filter === "unmapped") return record.coverage === "unmapped";
  if (filter === "attempted") return record.attempts.count > 0;
  return true;
}

function groupAttempts(attempts: readonly Attempt[]): Map<Id, Attempt[]> {
  const grouped = new Map<Id, Attempt[]>();
  for (const attempt of attempts) {
    const list = grouped.get(attempt.questionId);
    if (list) list.push(attempt);
    else grouped.set(attempt.questionId, [attempt]);
  }
  return grouped;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function latestDate(values: readonly (string | null)[]): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function searchScore(record: QuestionEvidenceRecord, query: string): number {
  return query.split(/\s+/).reduce((score, term) => score + (record.question.stem.toLowerCase().includes(term) ? 3 : 1), 0);
}

function compareNullableDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

function compareQuestion(a: QuestionEvidenceRecord, b: QuestionEvidenceRecord): number {
  return `${a.subject?.name ?? a.question.subjectId}:${a.question.stem}`.localeCompare(
    `${b.subject?.name ?? b.question.subjectId}:${b.question.stem}`,
  );
}
