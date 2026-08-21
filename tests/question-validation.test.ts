import { describe, expect, it } from "vitest";
import {
  auditQuestionValidation,
  createQuestionValidation,
  isQuestionValidated,
  reviewQuestionValidation,
  retireQuestionValidation,
  submitQuestionForValidation,
  validateQuestion,
  withQuestionValidation,
} from "@/domain/question-validation";
import { regressionReport } from "@/domain/content-review";
import type { Question, Topic } from "@/domain/types";

const NOW = new Date("2026-08-18T10:00:00.000Z");
const TOPIC: Topic = {
  id: "subject.topic",
  subjectId: "subject",
  unitId: "subject.unit",
  title: "A topic",
  order: 1,
  intrinsicDifficulty: 2,
  summary: "A topic summary.",
  keyPoints: ["A key point"],
  commonErrors: ["A common error"],
  specVersion: "2024-1.0",
  specPoints: [
    {
      id: "subject.topic.sp-01",
      ref: "1.1",
      text: "Explain the core idea.",
      aos: ["AO1"],
    },
  ],
};

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-validation-1",
    subjectId: "subject",
    topicIds: [TOPIC.id],
    kind: "structured",
    stem: "Explain the core idea and give one relevant example.",
    parts: [
      {
        id: "q-validation-1-a",
        label: "(a)",
        prompt: "Explain the core idea.",
        marks: 2,
        markScheme: ["States the core idea", "Uses the correct relationship"],
        modelAnswer: "The model answer explains the core idea and its relationship.",
        aos: ["AO1"],
        specPointIds: ["subject.topic.sp-01"],
        learningClaims: ["explain the core idea", "use the correct relationship"],
      },
    ],
    totalMarks: 2,
    calculatorAllowed: false,
    difficulty: 2,
    origin: "seed",
    source: "authored",
    verification: "checked",
    reviewer: "author",
    lastChecked: "2026-08-17",
    specVersion: "2024-1.0",
    aos: ["AO1"],
    specPointIds: ["subject.topic.sp-01"],
    createdAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("question validation report", () => {
  it("reports structural, mapping, and provenance gaps before review", () => {
    const report = validateQuestion(
      question({
        stem: " ",
        parts: [],
        totalMarks: 3,
        topicIds: ["subject.unknown"],
        verification: "unverified",
        reviewer: null,
        lastChecked: null,
        specVersion: undefined,
      }),
      [TOPIC],
      { now: NOW },
    );

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing-stem",
        "missing-parts",
        "invalid-total-marks",
        "unknown-topic",
        "missing-spec-version",
        "unverified-provenance",
        "missing-reviewer",
        "missing-last-checked",
      ]),
    );
  });
});

describe("question validation lifecycle", () => {
  it("moves a question from draft through review to validated", () => {
    const draft = withQuestionValidation(
      question(),
      createQuestionValidation(question(), { now: NOW, version: "1" }),
    );

    expect(draft.validation?.stage).toBe("draft");
    expect(draft.validation?.report.ok).toBe(true);

    const inReview = submitQuestionForValidation(draft, [TOPIC], "author", { now: NOW });
    expect(inReview.validation?.stage).toBe("in_review");
    expect(inReview.validation?.submittedAt).toBe(NOW.toISOString());

    const validated = reviewQuestionValidation(inReview, [TOPIC], "validate", "reviewer", { now: NOW });
    expect(validated.validation?.stage).toBe("validated");
    expect(validated.validation?.reviewerId).toBe("reviewer");
    expect(validated.validation?.history.map((entry) => `${entry.from}->${entry.to}`)).toEqual([
      "draft->in_review",
      "in_review->validated",
    ]);
    expect(isQuestionValidated(validated)).toBe(true);
  });

  it("blocks submission of an invalid question and supports requested changes", () => {
    const draft = withQuestionValidation(
      question(),
      createQuestionValidation(question(), { now: NOW }),
    );
    const invalid = { ...draft, stem: " " };

    expect(() => submitQuestionForValidation(invalid, [TOPIC], "author", { now: NOW })).toThrow(/validation/i);

    const inReview = submitQuestionForValidation(draft, [TOPIC], "author", { now: NOW });
    const needsChanges = reviewQuestionValidation(inReview, [TOPIC], "request_changes", "reviewer", {
      note: "Tighten the wording.",
      now: NOW,
    });
    expect(needsChanges.validation?.stage).toBe("needs_changes");
    expect(needsChanges.validation?.history.at(-1)?.note).toBe("Tighten the wording.");

    const resubmitted = submitQuestionForValidation(needsChanges, [TOPIC], "author", { now: NOW });
    expect(resubmitted.validation?.stage).toBe("in_review");
  });

  it("demotes validated content when a later audit finds specification drift", () => {
    const draft = withQuestionValidation(
      question(),
      createQuestionValidation(question(), { now: NOW }),
    );
    const inReview = submitQuestionForValidation(draft, [TOPIC], "author", { now: NOW });
    const validated = reviewQuestionValidation(inReview, [TOPIC], "validate", "reviewer", { now: NOW });
    const drifted = { ...validated, topicIds: ["subject.unknown"] };

    const audited = auditQuestionValidation(drifted, [TOPIC], { actorId: "system", now: NOW });
    expect(audited.validation?.stage).toBe("needs_changes");
    expect(audited.validation?.report.issues.some((issue) => issue.code === "unknown-topic")).toBe(true);
    expect(audited.validation?.history.at(-1)?.from).toBe("validated");
    expect(audited.validation?.history.at(-1)?.to).toBe("needs_changes");
    expect(isQuestionValidated(audited)).toBe(false);
  });

  it("retires validated content and prevents it re-entering review", () => {
    const draft = withQuestionValidation(
      question(),
      createQuestionValidation(question(), { now: NOW }),
    );
    const inReview = submitQuestionForValidation(draft, [TOPIC], "author", { now: NOW });
    const validated = reviewQuestionValidation(inReview, [TOPIC], "validate", "reviewer", { now: NOW });
    const retired = retireQuestionValidation(validated, "reviewer", { now: NOW });

    expect(retired.validation?.stage).toBe("retired");
    expect(retired.validation?.history.at(-1)?.from).toBe("validated");
    expect(() => submitQuestionForValidation(retired, [TOPIC], "author", { now: NOW })).toThrow(/Cannot submit/);
  });

  it("surfaces unfinished validation in the existing regression report", () => {
    const draft = withQuestionValidation(
      question(),
      createQuestionValidation(question(), { now: NOW }),
    );
    const report = regressionReport({ topics: [TOPIC], questions: [draft], today: "2026-08-18" });

    expect(report.flags).toContainEqual(expect.objectContaining({ kind: "question-validation", id: draft.id }));
  });
});
