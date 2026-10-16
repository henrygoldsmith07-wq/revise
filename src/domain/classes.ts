import type { MisconceptionTag } from "./types-taxonomy";

/** Live class records are remote collaboration data, never the demo cohort. */
export interface Classroom {
  id: string;
  name: string;
  joinCode: string;
  teacherId: string;
}

export interface ClassMembership {
  classId: string;
  studentId: string;
  /** A chosen pseudonym; never a request for a legal name. */
  alias: string;
  ageBand: "13-17" | "18+";
  status: "pending" | "active";
  consentedAt: string;
  /** Present after the teacher records school/guardian authorization. */
  authorizedAt?: string | null;
  className?: string;
}

export interface ClassAssignment {
  id: string;
  classId: string;
  title: string;
  kind: "check" | "topic";
  questionIds: string[];
  topicId: string | null;
  dueDate: string;
}

/** An explicit learner-supplied snapshot, not a verified examination outcome. */
export interface ClassEvidence {
  attemptId: string;
  studentId: string;
  questionId: string;
  topicId: string;
  awarded: number;
  max: number;
  misconception?: string;
  attemptedAt: string;
}

export const CLASS_MISCONCEPTIONS: Readonly<Record<MisconceptionTag, string>> = {
  units: "Units",
  "significant-figures": "Significant figures",
  rearrangement: "Rearrangement",
  "substitution-slips": "Substitution slips",
  "graph-reading": "Graph reading",
  "method-skipped": "Method skipped",
  "misread-command": "Misread command",
  terminology: "Terminology",
  conceptual: "Conceptual understanding",
  other: "Other",
};

export interface ClassHeatmapRow {
  tag: string;
  label: string;
  occurrences: number;
  studentCount: number;
  marksLost: number;
  questionIds: string[];
}

/** Counts only real shared snapshots, deduplicating repeated attempt ids per learner. */
export function buildClassHeatmap(evidence: readonly ClassEvidence[]): ClassHeatmapRow[] {
  const seen = new Set<string>();
  const buckets = new Map<string, { row: ClassHeatmapRow; students: Set<string>; questions: Set<string> }>();
  for (const item of evidence) {
    const key = `${item.studentId}\u0000${item.attemptId}`;
    if (seen.has(key) || !Number.isFinite(item.max) || !Number.isFinite(item.awarded)
      || item.max <= 0 || item.awarded < 0 || item.awarded > item.max) continue;
    seen.add(key);
    const tag = item.misconception;
    if (!tag || !Object.hasOwn(CLASS_MISCONCEPTIONS, tag)) continue;
    let bucket = buckets.get(tag);
    if (!bucket) {
      bucket = { row: { tag, label: CLASS_MISCONCEPTIONS[tag as MisconceptionTag], occurrences: 0, studentCount: 0, marksLost: 0, questionIds: [] }, students: new Set(), questions: new Set() };
      buckets.set(tag, bucket);
    }
    bucket.row.occurrences += 1;
    bucket.row.marksLost += item.max - item.awarded;
    bucket.students.add(item.studentId);
    bucket.questions.add(item.questionId);
  }
  return [...buckets.values()].map(({ row, students, questions }) => ({
    ...row, studentCount: students.size, questionIds: [...questions].sort(),
  })).sort((a, b) => b.marksLost - a.marksLost || b.occurrences - a.occurrences || a.tag.localeCompare(b.tag));
}

/** Links to the existing review workflow; this does not record or imply an approval. */
export function classReviewHref(questionId: string): string {
  return `/reviewer/review/${encodeURIComponent(questionId)}`;
}
