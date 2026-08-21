import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  DELAYED_FAR_TRANSFER_DELAY_DAYS,
  FAR_TRANSFER_PASS_THRESHOLD,
  FAR_TRANSFER_SOURCE_THRESHOLD,
  completeDelayedFarTransfer,
  delayedFarTransferReport,
  delayedFarTransferRetests,
  scheduleDelayedFarTransfer,
  scoreFarTransferRetest,
} from "@/domain/delayed-far-transfer";
import type { Attempt, Question } from "@/domain/types";

const NOW = "2026-08-01T09:00:00.000Z";

function question(
  id: string,
  stem: string,
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    subjectId: "physics",
    topicIds: ["physics.fields"],
    kind: "structured",
    stem,
    parts: [
      {
        id: `${id}:p1`,
        label: "",
        prompt: "Apply the relationship.",
        marks: 2,
        markScheme: ["Uses the relationship", "Gives a valid result"],
        modelAnswer: "A valid result.",
        specPointIds: ["physics.fields.sp-01"],
        learningClaims: ["apply the inverse-square relationship"],
      },
    ],
    totalMarks: 2,
    calculatorAllowed: true,
    difficulty: 3,
    origin: "seed",
    specPointIds: ["physics.fields.sp-01"],
    createdAt: "2026-07-01T09:00:00.000Z",
    ...overrides,
  };
}

function attempt(
  id: string,
  questionId: string,
  awarded: number,
  max = 2,
  overrides: Partial<Attempt> = {},
): Attempt {
  return {
    id,
    userId: "local",
    questionId,
    subjectId: "physics",
    topicIds: ["physics.fields"],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "Marked.",
    markedBy: "rubric",
    elapsedMs: 20_000,
    mode: "practice",
    createdAt: NOW,
    ...overrides,
  };
}

describe("delayed far-transfer retesting", () => {
  it("schedules a successful answer against a novel question with the same learning anchor", () => {
    const source = question("q-source", "A satellite orbits a planet. Calculate the force.");
    const sameStem = question("q-copy", source.stem);
    const far = question("q-far", "A probe travels past a moon. Determine the gravitational field strength.", {
      kind: "calculation",
    });

    const retest = scheduleDelayedFarTransfer({
      attempt: attempt("a-source", source.id, 2),
      question: source,
      questions: [source, sameStem, far],
      attemptedQuestionIds: [source.id],
    });

    expect(retest).toMatchObject({
      retestId: "far-transfer:a-source",
      role: "source",
      sourceAttemptId: "a-source",
      sourceQuestionId: source.id,
      candidateQuestionId: far.id,
      scheduledFor: "2026-08-08",
      delayDays: DELAYED_FAR_TRANSFER_DELAY_DAYS,
    });
    expect(retest?.candidateQuestionId).not.toBe(sameStem.id);
  });

  it("requires a high-confidence source mark and a candidate that has not already been attempted", () => {
    const source = question("q-source", "Calculate the force in context A.");
    const far = question("q-far", "Calculate the field strength in context B.");
    const alternate = question("q-alt", "Explain the field in context C.", { kind: "short" });
    const questions = [source, far, alternate];

    expect(
      scheduleDelayedFarTransfer({
        attempt: attempt("a-low", source.id, 1),
        question: source,
        questions,
        attemptedQuestionIds: [source.id],
      }),
    ).toBeUndefined();

    expect(
      scheduleDelayedFarTransfer({
        attempt: attempt("a-good", source.id, 2, 2, {
          markEscalation: {
            status: "pending",
            reason: "low-confidence",
            priority: "standard",
            target: "human-review",
            confidence: 0.4,
            threshold: 0.6,
            requestedAt: NOW,
          },
        }),
        question: source,
        questions,
        attemptedQuestionIds: [source.id],
      }),
    ).toBeUndefined();

    const retest = scheduleDelayedFarTransfer({
      attempt: attempt("a-good", source.id, 2),
      question: source,
      questions,
      attemptedQuestionIds: [source.id, far.id],
    });
    expect(retest?.candidateQuestionId).toBe(alternate.id);
  });

  it("moves from scheduled to due to completed without creating a duplicate", () => {
    const source = question("q-source", "A satellite orbits a planet. Calculate the force.");
    const far = question("q-far", "A probe passes a moon. Determine the gravitational field strength.");
    const sourceAttempt = attempt("a-source", source.id, 2);
    const link = scheduleDelayedFarTransfer({
      attempt: sourceAttempt,
      question: source,
      questions: [source, far],
      attemptedQuestionIds: [source.id],
    });
    expect(link).toBeTruthy();

    const upcoming = delayedFarTransferRetests({
      attempts: [{ ...sourceAttempt, farTransfer: link }],
      questions: [source, far],
      today: "2026-08-07",
    });
    expect(upcoming[0]).toMatchObject({ status: "scheduled", candidateQuestionId: far.id });

    const due = delayedFarTransferRetests({
      attempts: [{ ...sourceAttempt, farTransfer: link }],
      questions: [source, far],
      today: "2026-08-08",
    });
    expect(due[0]).toMatchObject({ status: "due", retestId: link?.retestId });

    const retestAttempt = attempt("a-retest", far.id, 1, 2, { createdAt: "2026-08-08T09:00:00.000Z" });
    const completed = completeDelayedFarTransfer(due[0], retestAttempt);
    const history = delayedFarTransferRetests({
      attempts: [
        { ...sourceAttempt, farTransfer: link },
        { ...retestAttempt, farTransfer: completed },
      ],
      questions: [source, far],
      today: "2026-08-09",
    });

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: "completed", outcome: { percentage: 0.5, passed: false } });
    expect(delayedFarTransferReport(history)).toMatchObject({ scheduled: 1, completed: 1, passed: 0, passRate: 0 });
  });

  it("scores transfer independently from the original answer", () => {
    const strong = attempt("a-strong", "q-far", 2, 2, { createdAt: "2026-08-08T09:00:00.000Z" });
    const partial = attempt("a-partial", "q-far", 3, 5, { createdAt: "2026-08-08T09:00:00.000Z" });
    const weak = attempt("a-weak", "q-far", 0, 2, { createdAt: "2026-08-08T09:00:00.000Z" });

    expect(FAR_TRANSFER_SOURCE_THRESHOLD).toBe(0.8);
    expect(scoreFarTransferRetest(strong)).toMatchObject({ percentage: 1, passed: true, band: "secure" });
    expect(scoreFarTransferRetest(partial)).toMatchObject({
      percentage: FAR_TRANSFER_PASS_THRESHOLD,
      passed: true,
      band: "partial",
    });
    expect(scoreFarTransferRetest(weak)).toMatchObject({ percentage: 0, passed: false, band: "not-secure" });
  });

  it("publishes the due queue in Progress and opens it from Practice", () => {
    const progress = readFileSync(join(process.cwd(), "src/app/progress/page.tsx"), "utf8");
    const practice = readFileSync(join(process.cwd(), "src/app/practice/page.tsx"), "utf8");
    const runner = readFileSync(join(process.cwd(), "src/components/QuestionRunner.tsx"), "utf8");

    expect(progress).toContain("delayedFarTransferRetests");
    expect(progress).toContain("Delayed far-transfer");
    expect(practice).toContain("retest");
    expect(runner).toContain("farTransfer");
  });
});
