import { describe, expect, it } from "vitest";
import {
  buildQuestionEvidenceDatabase,
  queryQuestionEvidence,
} from "@/domain/question-evidence";
import type { Attempt, Question, Subject, Topic } from "@/domain/types";

const subject: Subject = {
  id: "subject-physics",
  qualificationId: "wjec-alevel",
  name: "Physics",
  papers: [],
  gradeBoundaries: [],
};

const topic: Topic = {
  id: "subject-physics.quantum",
  subjectId: subject.id,
  unitId: "subject-physics.unit-1",
  title: "Quantum physics",
  order: 1,
  intrinsicDifficulty: 3,
  summary: "Photons transfer energy in discrete amounts.",
  keyPoints: ["Photon energy is hf."],
  commonErrors: ["Mixing joules and electronvolts."],
  specPoints: [
    {
      id: "subject-physics.quantum.sp-01",
      ref: "1.1(a)",
      text: "Use photon energy to explain the photoelectric effect.",
      aos: ["AO2"],
      source: "authored",
      verification: "verified",
      lastChecked: "2026-08-01",
      specVersion: "2024-1.0",
    },
  ],
};

const completeQuestion: Question = {
  id: "question-complete",
  subjectId: subject.id,
  topicIds: [topic.id],
  kind: "structured",
  stem: "Explain how photon energy affects photoelectrons.",
  parts: [
    {
      id: "question-complete:0",
      label: "(a)",
      prompt: "State the equation for photon energy.",
      marks: 2,
      markScheme: ["States E = hf", "Defines h or f correctly"],
      learningClaims: ["relate photon energy to frequency", "use the photon-energy equation"],
      modelAnswer: "Photon energy is E = hf.",
      specPointIds: ["subject-physics.quantum.sp-01"],
    },
  ],
  totalMarks: 2,
  calculatorAllowed: true,
  difficulty: 3,
  origin: "seed",
  source: "authored",
  verification: "verified",
  reviewer: "reviewer",
  lastChecked: "2026-08-01",
  specVersion: "2024-1.0",
  specPointIds: ["subject-physics.quantum.sp-01"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const attempted: Attempt = {
  id: "attempt-1",
  userId: "local",
  questionId: completeQuestion.id,
  subjectId: subject.id,
  topicIds: [topic.id],
  answers: { [completeQuestion.parts[0]!.id]: "E = hf" },
  marked: [],
  awarded: 1,
  max: 2,
  feedback: "Define the constant as well.",
  markedBy: "rubric",
  elapsedMs: 10_000,
  mode: "practice",
  createdAt: "2026-08-10T10:00:00.000Z",
};

const incompleteQuestion: Question = {
  ...completeQuestion,
  id: "question-incomplete",
  stem: "Describe a result without a specification mapping.",
  specPointIds: undefined,
  verification: "unverified",
  lastChecked: null,
  parts: [
    {
      ...completeQuestion.parts[0]!,
      id: "question-incomplete:0",
      specPointIds: [],
      learningClaims: [],
      markScheme: [],
    },
  ],
};

describe("Question Evidence Database", () => {
  it("joins question provenance, specification points and attempts into one record", () => {
    const database = buildQuestionEvidenceDatabase({
      questions: [completeQuestion],
      attempts: [attempted],
      subjects: [subject],
      topics: [topic],
      today: "2026-08-18",
    });

    expect(database.summary).toMatchObject({
      total: 1,
      complete: 1,
      verified: 1,
      needsReview: 0,
      attempted: 1,
      specPointsLinked: 1,
      markSchemePoints: 2,
    });
    expect(database.records[0]).toMatchObject({
      coverage: "complete",
      specPoints: [{ ref: "1.1(a)", text: expect.stringContaining("photon") }],
      attempts: { count: 1, awarded: 1, max: 2, percentage: 0.5, latestMarkedBy: "rubric" },
      flags: [],
    });
  });

  it("flags unmapped and stale questions instead of treating missing evidence as approval", () => {
    const database = buildQuestionEvidenceDatabase({
      questions: [incompleteQuestion],
      attempts: [],
      subjects: [subject],
      topics: [topic],
      today: "2026-08-18",
    });

    expect(database.summary).toMatchObject({ total: 1, unmapped: 1, needsReview: 1, attempted: 0 });
    expect(database.records[0]!.flags).toEqual(
      expect.arrayContaining(["unmapped", "unverified", "not-checked", "incomplete-mark-scheme"]),
    );
  });

  it("searches evidence text and applies review and attempt filters", () => {
    const database = buildQuestionEvidenceDatabase({
      questions: [completeQuestion, incompleteQuestion],
      attempts: [attempted],
      subjects: [subject],
      topics: [topic],
      today: "2026-08-18",
    });

    expect(queryQuestionEvidence(database, { query: "1.1(a)" }).map((record) => record.question.id)).toEqual([
      completeQuestion.id,
    ]);
    expect(queryQuestionEvidence(database, { filter: "needs-review" }).map((record) => record.question.id)).toEqual([
      incompleteQuestion.id,
    ]);
    expect(queryQuestionEvidence(database, { filter: "attempted" }).map((record) => record.question.id)).toEqual([
      completeQuestion.id,
    ]);
  });
});
