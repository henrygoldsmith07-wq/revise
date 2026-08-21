import type { AoCode, ContentSource, Id, LicensedSource, Question, QuestionKind, QuestionPart, VerificationStatus } from "@/domain/types";

// Compact authoring format for the seed question bank. Ids are deterministic
// (`seed-q:<slug>`) so re-seeding never duplicates a question or orphans the
// attempts already recorded against it.

export interface PartSpec {
  label?: string;
  prompt: string;
  marks: number;
  /** One awardable mark-scheme point per entry, in examiner shorthand. */
  scheme: string[];
  answer: string;
  aos?: AoCode[];
  specPointIds?: string[];
  learningClaims?: string[];
}

export interface QuestionSpec {
  slug: string;
  subjectId: Id;
  topics: string[];
  kind?: QuestionKind;
  stem: string;
  options?: string[];
  correctIndex?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  calculator?: boolean;
  parts: PartSpec[];
  source?: ContentSource;
  licensedSource?: LicensedSource | null;
  verification?: VerificationStatus;
  lastChecked?: string | null;
  reviewer?: string | null;
  specVersion?: string;
  aos?: AoCode[];
  specPointIds?: string[];
}

const SEED_CREATED_AT = "2025-01-01T00:00:00.000Z";

export function defineQuestion(spec: QuestionSpec): Question {
  const id = `seed-q:${spec.slug}`;
  const parts: QuestionPart[] = spec.parts.map((part, i) => ({
    id: `${id}:${i}`,
    label: part.label ?? (spec.parts.length > 1 ? `(${"abcdefgh"[i]})` : ""),
    prompt: part.prompt,
    marks: part.marks,
    markScheme: part.scheme,
    modelAnswer: part.answer,
    aos: part.aos,
    specPointIds: (part as { specPointIds?: string[] }).specPointIds,
    learningClaims: (part as { learningClaims?: string[] }).learningClaims,
  }));

  const aos =
    spec.aos ?? [...new Set(parts.flatMap((p) => p.aos ?? []))] as AoCode[];

  // union of part ids when not given explicitly; deduped
  const specPointIds = (spec as { specPointIds?: string[] }).specPointIds ?? [...new Set(parts.flatMap((p) => p.specPointIds ?? []))];
  return {
    id,
    subjectId: spec.subjectId,
    topicIds: spec.topics.map((t) => `${spec.subjectId}.${t}`),
    kind: spec.kind ?? (spec.options ? "mcq" : parts.length > 1 ? "structured" : "short"),
    stem: spec.stem,
    options: spec.options,
    correctIndex: spec.correctIndex,
    parts,
    totalMarks: parts.reduce((a, p) => a + p.marks, 0),
    calculatorAllowed: spec.calculator ?? true,
    difficulty: spec.difficulty ?? 3,
    origin: "seed",
    source: spec.source ?? "authored",
    licensedSource: spec.licensedSource ?? null,
    verification: spec.verification ?? "unverified",
    reviewer: (spec as { reviewer?: string | null }).reviewer ?? null,
    lastChecked: spec.lastChecked ?? null,
    specVersion: spec.specVersion,
    aos: aos.length ? aos : undefined,
    specPointIds: specPointIds.length ? specPointIds : undefined,
    createdAt: SEED_CREATED_AT,
  };
}

export function defineQuestions(specs: QuestionSpec[]): Question[] {
  return specs.map(defineQuestion);
}
