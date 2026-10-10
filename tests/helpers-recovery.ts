import { physicsContentFingerprint } from "@/domain/content-trust";
import type { Attempt, Mistake, Question } from "@/domain/types";

export function question(id: string, topicId: string, overrides: Partial<Question> = {}): Question {
  return {
    id, subjectId: "maths", topicIds: [topicId], kind: "structured", stem: `Stem ${id}`,
    parts: [{ id: `${id}:a`, label: "", prompt: "Answer.", marks: 3, markScheme: ["a", "b", "c"], modelAnswer: "model" }],
    totalMarks: 3, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-01-01T09:00:00.000Z", ...overrides,
  };
}

export function mistake(id: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id, userId: "u1", subjectId: "maths", topicId: "algebra", questionId: "q-a1", attemptId: `att-${id}`, marksLost: 3,
    description: "Lost marks", category: "method", resolved: false, createdAt: "2026-09-20T09:00:00.000Z", ...overrides,
  };
}

export function attempt(id: string, questionId: string, awarded: number, max: number, createdAt: string, overrides: Partial<Attempt> = {}): Attempt {
  return {
    id, userId: "u1", questionId, subjectId: "maths", topicIds: ["algebra"], answers: {}, marked: [], awarded, max, feedback: "",
    markedBy: "rubric", elapsedMs: 60_000, mode: "practice", createdAt, ...overrides,
  };
}

export const bank: Question[] = ["q-a1", "q-a2", "q-a3", "q-a4", "q-a5"].map((id) => question(id, "algebra"))
  .concat(["q-g1", "q-g2", "q-g3"].map((id) => question(id, "geometry")));

// --- Flagship fixtures -------------------------------------------------------
// "Proven" is a learner-facing claim reserved for reviewed flagship content
// (learnerEvidenceTrusted). Reference-tier subjects such as the default
// "maths" above can never prove a mark, so tests about the proof lifecycle use
// these: the same bank and defaults, on a WJEC flagship, with every question
// carrying a full (fixture-only) human review attestation, and with the source
// attempt each review-gated mistake must link to.

export const FLAGSHIP_FIXTURE_SUBJECT = "wjec-alevel-maths";

export function reviewed(q: Question): Question {
  const base: Question = { ...q, verification: undefined, humanVerification: undefined };
  return {
    ...base, verification: "verified",
    humanVerification: {
      status: "approved", reviewerId: "test-reviewer", reviewerRole: "teacher", reviewerQualification: "Test fixture only",
      reviewedAt: "2026-09-01T09:00:00.000Z", contentFingerprint: physicsContentFingerprint(base),
      checks: { question: true, marking: true, workedSolution: true, capabilityMapping: true, specificationMapping: true, examRealism: true },
    },
  };
}

export function flagshipQuestion(id: string, topicId: string, overrides: Partial<Question> = {}): Question {
  return reviewed(question(id, topicId, { subjectId: FLAGSHIP_FIXTURE_SUBJECT, ...overrides }));
}
export function flagshipMistake(id: string, overrides: Partial<Mistake> = {}): Mistake {
  return mistake(id, { subjectId: FLAGSHIP_FIXTURE_SUBJECT, ...overrides });
}
export function flagshipAttempt(id: string, questionId: string, awarded: number, max: number, createdAt: string, overrides: Partial<Attempt> = {}): Attempt {
  return attempt(id, questionId, awarded, max, createdAt, { subjectId: FLAGSHIP_FIXTURE_SUBJECT, ...overrides });
}
/** The marked attempt that produced a mistake: review-gated mistakes must link to it. */
export function sourceAttempt(m: Mistake): Attempt {
  return flagshipAttempt(m.attemptId!, m.questionId!, 0, 3, m.createdAt, { subjectId: m.subjectId, topicIds: [m.topicId] });
}
export const flagshipBank: Question[] = bank.map((q) => reviewed({ ...q, subjectId: FLAGSHIP_FIXTURE_SUBJECT }));
