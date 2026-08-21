import { describe, expect, it } from "vitest";
import {
  assignmentProgress,
  buildInterventionEffectiveness,
  buildMisconceptionDashboard,
  buildSchoolReport,
  buildWeaknessClusters,
  demoTeacherStudents,
  schoolReportCsv,
  type TeacherAssignment,
  type TeacherEvidence,
  type TeacherIntervention,
} from "@/domain/teacher";
import type { Question, Topic } from "@/domain/types";

const topic: Topic = {
  id: "t1",
  subjectId: "s1",
  unitId: "u1",
  title: "Kinematics",
  order: 1,
  intrinsicDifficulty: 2,
  summary: "Motion and graphs",
  keyPoints: ["Gradient"],
  commonErrors: ["Units"],
};

const question: Question = {
  id: "q1",
  subjectId: "s1",
  topicIds: [topic.id],
  kind: "short",
  stem: "Calculate the acceleration.",
  parts: [{ id: "q1-p1", label: "a", prompt: "Calculate", marks: 4, markScheme: ["method"], modelAnswer: "2" }],
  totalMarks: 4,
  calculatorAllowed: true,
  difficulty: 2,
  origin: "seed",
  createdAt: "2026-08-18T12:00:00.000Z",
};

const students = demoTeacherStudents(["s1"]);

function evidence(overrides: Partial<TeacherEvidence> = {}): TeacherEvidence {
  return {
    studentId: students[0].id,
    questionId: question.id,
    topicId: topic.id,
    awarded: 1,
    max: 4,
    misconception: "method-skipped",
    attemptedAt: "2026-08-18T12:00:00.000Z",
    ...overrides,
  };
}

describe("teacher P2 aggregates", () => {
  it("clusters class weakness by accuracy, marks lost and at-risk learners", () => {
    const clusters = buildWeaknessClusters({
      topics: [topic],
      evidence: [evidence(), evidence({ studentId: students[1].id, awarded: 3, misconception: undefined })],
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].title).toBe("Kinematics");
    expect(clusters[0].studentIds).toHaveLength(2);
    expect(clusters[0].atRiskStudentIds).toEqual([students[0].id]);
    expect(clusters[0].marksLost).toBe(4);
  });

  it("summarises misconceptions across learners and topics", () => {
    const rows = buildMisconceptionDashboard([evidence(), evidence({ studentId: students[1].id, questionId: "q2" })]);
    expect(rows[0]).toMatchObject({ tag: "method-skipped", occurrences: 2, marksLost: 6 });
    expect(rows[0].studentIds).toHaveLength(2);
  });

  it("calculates assignment completion from unique student-question pairs", () => {
    const assignment: TeacherAssignment = {
      id: "a1",
      title: "Targeted set",
      questionIds: [question.id],
      studentIds: students.slice(0, 2).map((student) => student.id),
      dueDate: "2026-08-20",
      status: "active",
      createdAt: "2026-08-18T12:00:00.000Z",
      createdBy: "teacher",
    };
    const progress = assignmentProgress(assignment, [evidence()]);
    expect(progress.completed).toBe(1);
    expect(progress.expected).toBe(2);
    expect(progress.completionRate).toBe(0.5);
    expect(progress.accuracy).toBe(0.25);
  });

  it("keeps intervention outcomes measurable and exportable", () => {
    const interventions: TeacherIntervention[] = [{
      id: "i1",
      label: "Command-word clinic",
      studentIds: [students[0].id],
      topicIds: [topic.id],
      baselineScore: 0.4,
      outcomeScore: 0.7,
      status: "completed",
      startedAt: "2026-08-01",
      completedAt: "2026-08-18",
    }];
    const report = buildSchoolReport({
      students,
      assignments: [],
      evidence: [evidence()],
      clusters: buildWeaknessClusters({ topics: [topic], evidence: [evidence()] }),
      interventions,
      markReviews: [],
      moderationEntries: [],
      now: new Date("2026-08-18T12:00:00.000Z"),
    });
    expect(buildInterventionEffectiveness(interventions)[0].gain).toBe(0.3);
    expect(report.effectiveInterventionCount).toBe(1);
    expect(schoolReportCsv(report)).toContain("Effective interventions");
  });
});
