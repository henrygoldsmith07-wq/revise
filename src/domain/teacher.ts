import type { Id, IsoDate, IsoInstant, MisconceptionTag, Question, Topic } from "./types";
import { createDraft, submitForReview } from "./moderation";
import type { ModerationEntry } from "./moderation";

// ---------------------------------------------------------------------------
// Teacher P2 — local-first class workflow primitives.
//
// These structures deliberately stop at the boundary of the current app: the
// student product has no school roster or SIS connector yet. The demo cohort
// makes the workflows usable offline while keeping the sample nature explicit
// in the UI. Replacing the seed students/evidence with a roster adapter does
// not change any of the aggregation or moderation logic below.
// ---------------------------------------------------------------------------

export interface TeacherStudent {
  id: Id;
  name: string;
  group: string;
  yearGroup: string;
  subjectIds: Id[];
  active: boolean;
}

export type TeacherAssignmentStatus = "draft" | "active" | "closed";

export interface TeacherAssignment {
  id: Id;
  title: string;
  questionIds: Id[];
  studentIds: Id[];
  dueDate: IsoDate;
  status: TeacherAssignmentStatus;
  createdAt: IsoInstant;
  createdBy: Id;
}

export type TeacherInterventionStatus = "planned" | "active" | "completed";

export interface TeacherIntervention {
  id: Id;
  label: string;
  studentIds: Id[];
  topicIds: Id[];
  baselineScore: number | null;
  outcomeScore: number | null;
  status: TeacherInterventionStatus;
  startedAt: IsoDate;
  completedAt?: IsoDate;
  notes?: string;
}

export type TeacherMarkReviewStatus = "needs-review" | "moderated" | "disputed";

export interface TeacherMarkReview {
  id: Id;
  studentId: Id;
  studentName: string;
  questionId: Id;
  questionLabel: string;
  aiAwarded: number;
  teacherAwarded: number | null;
  max: number;
  reason: string;
  status: TeacherMarkReviewStatus;
}

export interface TeacherAuthoredQuestion {
  id: Id;
  moderationEntryId: Id;
  subjectId: Id;
  topicId: Id;
  stem: string;
  marks: number;
  createdAt: IsoInstant;
}

export interface TeacherEvidence {
  studentId: Id;
  questionId: Id;
  topicId: Id;
  awarded: number;
  max: number;
  misconception?: MisconceptionTag;
  attemptedAt: IsoInstant;
}

export interface MisconceptionSummary {
  tag: MisconceptionTag;
  label: string;
  studentIds: Id[];
  occurrences: number;
  marksLost: number;
  topicIds: Id[];
}

export interface WeaknessCluster {
  topicId: Id;
  subjectId: Id;
  title: string;
  studentIds: Id[];
  atRiskStudentIds: Id[];
  attempts: number;
  accuracy: number;
  marksLost: number;
  commonMisconceptions: Array<{ tag: MisconceptionTag; count: number }>;
  priority: number;
}

export interface AssignmentProgress {
  assignmentId: Id;
  completed: number;
  expected: number;
  completionRate: number;
  accuracy: number | null;
}

export interface InterventionEffectiveness {
  interventionId: Id;
  label: string;
  studentCount: number;
  baselineScore: number | null;
  outcomeScore: number | null;
  gain: number | null;
  status: TeacherInterventionStatus;
}

export interface SchoolReport {
  generatedAt: IsoInstant;
  studentCount: number;
  assignmentCount: number;
  assignmentCompletionRate: number;
  averageAccuracy: number | null;
  pendingReviewCount: number;
  moderatedMarkCount: number;
  interventionCount: number;
  completedInterventionCount: number;
  effectiveInterventionCount: number;
  topClusters: Array<{ title: string; studentCount: number; accuracy: number; marksLost: number }>;
}

export interface TeacherWorkspace {
  assignments: TeacherAssignment[];
  interventions: TeacherIntervention[];
  moderationEntries: ModerationEntry[];
  markReviews: TeacherMarkReview[];
  authoredQuestions: TeacherAuthoredQuestion[];
}

const DEMO_STUDENT_SEEDS = [
  ["demo-student-a", "Student A", "12A"],
  ["demo-student-b", "Student B", "12A"],
  ["demo-student-c", "Student C", "12A"],
  ["demo-student-d", "Student D", "12B"],
  ["demo-student-e", "Student E", "12B"],
  ["demo-student-f", "Student F", "12B"],
] as const;

const DEMO_MISCONCEPTIONS: MisconceptionTag[] = [
  "method-skipped",
  "misread-command",
  "substitution-slips",
  "conceptual",
  "terminology",
];

export function demoTeacherStudents(subjectIds: Id[]): TeacherStudent[] {
  return DEMO_STUDENT_SEEDS.map(([id, name, group]) => ({
    id,
    name,
    group,
    yearGroup: "Year 12",
    subjectIds: [...subjectIds],
    active: true,
  }));
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function labelForMisconception(tag: MisconceptionTag): string {
  return tag
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function questionLabel(question: Question): string {
  const compact = question.stem.replace(/\s+/g, " ").trim();
  return compact.length > 92 ? `${compact.slice(0, 89)}…` : compact;
}

/** Deterministic sample evidence so the teacher workflows are inspectable offline. */
export function demoTeacherEvidence(
  questions: Question[],
  topics: Topic[],
  students: TeacherStudent[],
  now = new Date(),
): TeacherEvidence[] {
  const usableQuestions = questions.filter((question) => question.topicIds.length > 0).slice(0, 12);
  const fallbackTopics = topics.slice(0, 12);

  return students.flatMap((student, studentIndex) =>
    usableQuestions.flatMap((question, questionIndex) => {
      // Keep the sample cohort sparse enough to make completion and assignment
      // states visible, without implying every student attempted every item.
      if ((studentIndex + questionIndex) % 4 === 0) return [];
      const topicId = question.topicIds[0] ?? fallbackTopics[(studentIndex + questionIndex) % Math.max(1, fallbackTopics.length)]?.id;
      if (!topicId) return [];
      const max = Math.max(1, question.totalMarks);
      const ratio = [0.42, 0.58, 0.72, 0.86][(studentIndex * 2 + questionIndex) % 4];
      const awarded = Math.min(max, Math.max(0, Math.round(max * ratio)));
      const misconception = ratio < 0.7 ? DEMO_MISCONCEPTIONS[(studentIndex + questionIndex) % DEMO_MISCONCEPTIONS.length] : undefined;
      const attemptedAt = new Date(now.getTime() - (studentIndex + questionIndex + 1) * 86_400_000).toISOString();
      return [{ studentId: student.id, questionId: question.id, topicId, awarded, max, misconception, attemptedAt }];
    }),
  );
}

export function buildWeaknessClusters(input: { evidence: TeacherEvidence[]; topics: Topic[] }): WeaknessCluster[] {
  const topicsById = new Map(input.topics.map((topic) => [topic.id, topic]));
  const buckets = new Map<Id, {
    studentIds: Set<Id>;
    atRiskStudentIds: Set<Id>;
    attempts: number;
    awarded: number;
    available: number;
    marksLost: number;
    misconceptions: Map<MisconceptionTag, number>;
  }>();

  for (const evidence of input.evidence) {
    const bucket = buckets.get(evidence.topicId) ?? {
      studentIds: new Set<Id>(),
      atRiskStudentIds: new Set<Id>(),
      attempts: 0,
      awarded: 0,
      available: 0,
      marksLost: 0,
      misconceptions: new Map<MisconceptionTag, number>(),
    };
    bucket.studentIds.add(evidence.studentId);
    bucket.attempts += 1;
    bucket.awarded += evidence.awarded;
    bucket.available += evidence.max;
    bucket.marksLost += Math.max(0, evidence.max - evidence.awarded);
    if (evidence.awarded / Math.max(1, evidence.max) < 0.6) bucket.atRiskStudentIds.add(evidence.studentId);
    if (evidence.misconception) bucket.misconceptions.set(evidence.misconception, (bucket.misconceptions.get(evidence.misconception) ?? 0) + 1);
    buckets.set(evidence.topicId, bucket);
  }

  return [...buckets.entries()]
    .map(([topicId, bucket]) => {
      const topic = topicsById.get(topicId);
      if (!topic) return null;
      const accuracy = bucket.awarded / Math.max(1, bucket.available);
      const commonMisconceptions = [...bucket.misconceptions.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag, count]) => ({ tag, count }));
      return {
        topicId,
        subjectId: topic.subjectId,
        title: topic.title,
        studentIds: [...bucket.studentIds],
        atRiskStudentIds: [...bucket.atRiskStudentIds],
        attempts: bucket.attempts,
        accuracy: round(accuracy),
        marksLost: bucket.marksLost,
        commonMisconceptions,
        priority: round(bucket.marksLost + bucket.atRiskStudentIds.size * 2),
      } satisfies WeaknessCluster;
    })
    .filter((cluster): cluster is WeaknessCluster => Boolean(cluster))
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

export function buildMisconceptionDashboard(evidence: TeacherEvidence[]): MisconceptionSummary[] {
  const buckets = new Map<MisconceptionTag, { studentIds: Set<Id>; occurrences: number; marksLost: number; topicIds: Set<Id> }>();
  for (const item of evidence) {
    if (!item.misconception) continue;
    const bucket = buckets.get(item.misconception) ?? { studentIds: new Set<Id>(), occurrences: 0, marksLost: 0, topicIds: new Set<Id>() };
    bucket.studentIds.add(item.studentId);
    bucket.occurrences += 1;
    bucket.marksLost += Math.max(0, item.max - item.awarded);
    bucket.topicIds.add(item.topicId);
    buckets.set(item.misconception, bucket);
  }
  return [...buckets.entries()]
    .map(([tag, bucket]) => ({
      tag,
      label: labelForMisconception(tag),
      studentIds: [...bucket.studentIds],
      occurrences: bucket.occurrences,
      marksLost: bucket.marksLost,
      topicIds: [...bucket.topicIds],
    }))
    .sort((a, b) => b.marksLost - a.marksLost || b.occurrences - a.occurrences);
}

export function assignmentProgress(assignment: TeacherAssignment, evidence: TeacherEvidence[]): AssignmentProgress {
  const expectedPairs = new Set(assignment.studentIds.flatMap((studentId) => assignment.questionIds.map((questionId) => `${studentId}:${questionId}`)));
  const completedPairs = new Set(
    evidence
      .filter((item) => assignment.studentIds.includes(item.studentId) && assignment.questionIds.includes(item.questionId))
      .map((item) => `${item.studentId}:${item.questionId}`),
  );
  const marks = evidence.filter((item) => assignment.studentIds.includes(item.studentId) && assignment.questionIds.includes(item.questionId));
  const available = marks.reduce((total, item) => total + item.max, 0);
  const awarded = marks.reduce((total, item) => total + item.awarded, 0);
  return {
    assignmentId: assignment.id,
    completed: completedPairs.size,
    expected: expectedPairs.size,
    completionRate: completedPairs.size / Math.max(1, expectedPairs.size),
    accuracy: marks.length ? round(awarded / Math.max(1, available)) : null,
  };
}

export function buildInterventionEffectiveness(interventions: TeacherIntervention[]): InterventionEffectiveness[] {
  return interventions.map((intervention) => ({
    interventionId: intervention.id,
    label: intervention.label,
    studentCount: intervention.studentIds.length,
    baselineScore: intervention.baselineScore,
    outcomeScore: intervention.outcomeScore,
    gain: intervention.baselineScore !== null && intervention.outcomeScore !== null
      ? round(intervention.outcomeScore - intervention.baselineScore)
      : null,
    status: intervention.status,
  }));
}

export function buildSchoolReport(input: {
  students: TeacherStudent[];
  assignments: TeacherAssignment[];
  evidence: TeacherEvidence[];
  clusters: WeaknessCluster[];
  interventions: TeacherIntervention[];
  markReviews: TeacherMarkReview[];
  moderationEntries: ModerationEntry[];
  now?: Date;
}): SchoolReport {
  const assignmentRows = input.assignments.map((assignment) => assignmentProgress(assignment, input.evidence));
  const available = input.evidence.reduce((total, item) => total + item.max, 0);
  const awarded = input.evidence.reduce((total, item) => total + item.awarded, 0);
  const completedInterventions = input.interventions.filter((intervention) => intervention.status === "completed");
  const effectiveInterventions = completedInterventions.filter((intervention) =>
    intervention.baselineScore !== null && intervention.outcomeScore !== null && intervention.outcomeScore > intervention.baselineScore,
  );
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    studentCount: input.students.filter((student) => student.active).length,
    assignmentCount: input.assignments.length,
    assignmentCompletionRate: assignmentRows.length
      ? round(assignmentRows.reduce((total, row) => total + row.completionRate, 0) / assignmentRows.length)
      : 0,
    averageAccuracy: input.evidence.length ? round(awarded / Math.max(1, available)) : null,
    pendingReviewCount: input.moderationEntries.filter((entry) => entry.status === "pending_review").length,
    moderatedMarkCount: input.markReviews.filter((review) => review.status === "moderated").length,
    interventionCount: input.interventions.length,
    completedInterventionCount: completedInterventions.length,
    effectiveInterventionCount: effectiveInterventions.length,
    topClusters: input.clusters.slice(0, 5).map((cluster) => ({
      title: cluster.title,
      studentCount: cluster.studentIds.length,
      accuracy: cluster.accuracy,
      marksLost: cluster.marksLost,
    })),
  };
}

export function schoolReportCsv(report: SchoolReport): string {
  const rows = [
    ["Metric", "Value"],
    ["Active students", String(report.studentCount)],
    ["Assignments", String(report.assignmentCount)],
    ["Assignment completion", `${Math.round(report.assignmentCompletionRate * 100)}%`],
    ["Average accuracy", report.averageAccuracy === null ? "No evidence" : `${Math.round(report.averageAccuracy * 100)}%`],
    ["Pending content reviews", String(report.pendingReviewCount)],
    ["Moderated marks", String(report.moderatedMarkCount)],
    ["Interventions", String(report.interventionCount)],
    ["Completed interventions", String(report.completedInterventionCount)],
    ["Effective interventions", String(report.effectiveInterventionCount)],
    ...report.topClusters.map((cluster) => [`Weakness: ${cluster.title}`, `${Math.round(cluster.accuracy * 100)}% accuracy; ${cluster.studentCount} students; ${cluster.marksLost} marks lost`]),
  ];
  return rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

export function demoTeacherMarkReviews(questions: Question[], students: TeacherStudent[]): TeacherMarkReview[] {
  return questions.slice(0, 5).map((question, index) => {
    const student = students[index % Math.max(1, students.length)] ?? students[0];
    const max = Math.max(1, question.totalMarks);
    const aiAwarded = Math.min(max, Math.max(0, Math.round(max * [0.45, 0.6, 0.75][index % 3])));
    return {
      id: `demo-mark-${index + 1}`,
      studentId: student?.id ?? "demo-student-a",
      studentName: student?.name ?? "Student A",
      questionId: question.id,
      questionLabel: questionLabel(question),
      aiAwarded,
      teacherAwarded: null,
      max,
      reason: index % 2 === 0 ? "AI confidence is below the moderation threshold." : "A mark-scheme point needs a teacher decision.",
      status: "needs-review",
    };
  });
}

export function demoModerationEntries(questions: Question[], topics: Topic[], now = new Date()): ModerationEntry[] {
  return questions.slice(0, 4).map((question, index) => {
    const topic = topics.find((candidate) => question.topicIds.includes(candidate.id));
    const draft = createDraft({
      id: `demo-moderation-${index + 1}`,
      contentKind: "question",
      contentId: question.id,
      subjectId: question.subjectId,
      topicId: topic?.id ?? question.topicIds[0],
      authorId: index === 0 ? "teacher-author" : "pulse-authoring",
      provenance: {
        source: index === 1 ? "generated" : "authored",
        verification: index === 2 ? "unverified" : "checked",
        specVersion: topic?.specVersion,
        specPointIds: question.specPointIds ?? topic?.specPoints?.slice(0, 2).map((point) => point.id),
      },
      now: new Date(now.getTime() - (index + 1) * 86_400_000),
      idFactory: () => `demo-moderation-${index + 1}`,
    });
    return index === 3
      ? draft
      : submitForReview(draft, draft.authorId, new Date(now.getTime() - index * 3_600_000));
  });
}

export function demoTeacherWorkspace(input: { questions: Question[]; topics: Topic[]; subjectIds: Id[]; now?: Date }): TeacherWorkspace {
  const students = demoTeacherStudents(input.subjectIds);
  const firstQuestions = input.questions.slice(0, 3);
  const firstTopic = input.topics[0];
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  return {
    assignments: firstQuestions.length
      ? [
          {
            id: "demo-assignment-1",
            title: "Targeted misconceptions check",
            questionIds: firstQuestions.map((question) => question.id),
            studentIds: students.slice(0, 4).map((student) => student.id),
            dueDate: today,
            status: "active",
            createdAt: (input.now ?? new Date()).toISOString(),
            createdBy: "teacher-demo",
          },
        ]
      : [],
    interventions: firstTopic
      ? [
          {
            id: "demo-intervention-1",
            label: `Small group: ${firstTopic.title}`,
            studentIds: students.slice(0, 3).map((student) => student.id),
            topicIds: [firstTopic.id],
            baselineScore: 0.48,
            outcomeScore: null,
            status: "active",
            startedAt: today,
            notes: "Sample intervention — replace with a real class record.",
          },
        ]
      : [],
    moderationEntries: demoModerationEntries(input.questions, input.topics, input.now),
    markReviews: demoTeacherMarkReviews(input.questions, students),
    authoredQuestions: [],
  };
}
