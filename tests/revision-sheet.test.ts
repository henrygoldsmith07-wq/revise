import { describe, expect, it } from "vitest";
import { buildRevisionSheet, sheetTitleLine } from "@/domain/revision-sheet";
import type { Attempt, Mistake, Topic } from "@/domain/types";

// The misconception library is content-driven; tests assert structure and
// honesty rules rather than fixture topics, which keeps them independent of
// the authored library's growth.
const NOW = new Date("2026-10-06T09:00:00.000Z");
const SUBJECT = "sheet-subject";
const TOPIC_ID = `${SUBJECT}.algebra`;

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: TOPIC_ID,
    subjectId: SUBJECT,
    unitId: `${SUBJECT}.unit-1`,
    title: "Algebra",
    order: 1,
    intrinsicDifficulty: 2,
    summary: "Equations, expressions and graphs.",
    keyPoints: ["Rearrange an equation.", "Factorise a quadratic."],
    commonErrors: ["Forgetting to flip the inequality sign."],
    specRef: "3.2.1",
    ...overrides,
  };
}

function attempt(id: string, awarded: number, max: number, createdAt = "2026-10-01T00:00:00.000Z"): Attempt {
  return {
    id,
    userId: "local",
    questionId: `q-${id}`,
    subjectId: SUBJECT,
    topicIds: [TOPIC_ID],
    answers: {},
    marked: [],
    awarded,
    max,
    feedback: "",
    markedBy: "ai",
    elapsedMs: 30_000,
    mode: "practice",
    createdAt,
  };
}

function mistake(id: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id,
    userId: "local",
    subjectId: SUBJECT,
    topicId: TOPIC_ID,
    marksLost: 2,
    resolved: false,
    description: "Forgot to flip the sign.",
    category: "recall",
    point: "flip the inequality when dividing by a negative",
    command: "state",
    createdAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRevisionSheet", () => {
  it("condenses spec content and reports a fresh topic honestly", () => {
    const sheet = buildRevisionSheet(
      { topicId: TOPIC_ID, attempts: [], questions: [], mistakes: [], now: NOW },
      topic(),
    );

    expect(sheet.summary).toContain("Equations");
    expect(sheet.keyPoints).toHaveLength(2);
    expect(sheet.commonErrors).toHaveLength(1);
    expect(sheet.specRef).toBe("3.2.1");
    expect(sheet.evidenceNote).toContain("No measured evidence yet");
    expect(sheet.headline).toContain("fresh topic");
    expect(sheet.selfCheck[0]).toContain("Rearrange an equation");
    expect(sheet.sectionsIncluded).toContain("spec");
    expect(sheet.sectionsIncluded).toContain("self-check");
    expect(sheet.sectionsIncluded).not.toContain("my-mistakes");
  });

  it("sums trusted accuracy into the evidence line", () => {
    const attempts = [
      attempt("a1", 3, 4),
      attempt("a2", 2, 4),
    ];
    const sheet = buildRevisionSheet(
      { topicId: TOPIC_ID, attempts, questions: [], mistakes: [], now: NOW },
      topic(),
    );
    expect(sheet.evidenceNote).toContain("2 marked attempts");
    expect(sheet.evidenceNote).toContain("63% of marks secured");
    expect(sheet.headline).toContain("63%");
  });

  it("surfaces unresolved mistakes with recorded details, newest first", () => {
    const mistakes = [
      mistake("old", { createdAt: "2026-09-10T00:00:00.000Z" }),
      mistake("new", { point: "state the null hypothesis", description: "Wrote the alternative instead." }),
      mistake("resolved", { resolved: true }),
    ];
    const sheet = buildRevisionSheet(
      { topicId: TOPIC_ID, attempts: [], questions: [], mistakes, now: NOW },
      topic(),
    );

    expect(sheet.myMistakes).toHaveLength(2);
    expect(sheet.myMistakes[0]!.point).toBe("state the null hypothesis");
    expect(sheet.myMistakes[1]!.point).toBe("flip the inequality when dividing by a negative");
    expect(sheet.myMistakes.every((m) => m.point != null)).toBe(true);
    expect(sheet.headline).toContain("open mistake");
    expect(sheet.sectionsIncluded).toContain("my-mistakes");
  });

  it("falls back to the description when no mark-scheme point was recorded", () => {
    const sheet = buildRevisionSheet(
      { topicId: TOPIC_ID, attempts: [], questions: [], mistakes: [mistake("m1", { point: undefined })], now: NOW },
      topic(),
    );
    expect(sheet.myMistakes[0]!.point).toBeNull();
    expect(sheet.myMistakes[0]!.description).toContain("Forgot to flip");
  });

  it("keeps attempts on other topics out of the evidence", () => {
    const otherTopic = attempt("x1", 10, 10);
    otherTopic.topicIds = [`${SUBJECT}.geometry`];
    const sheet = buildRevisionSheet(
      { topicId: TOPIC_ID, attempts: [attempt("a1", 1, 4), otherTopic], questions: [], mistakes: [], now: NOW },
      topic(),
    );
    expect(sheet.evidenceNote).toContain("1 marked attempt");
  });

  it("prints a titled line with the subject and spec ref", () => {
    const sheet = buildRevisionSheet(
      { topicId: TOPIC_ID, attempts: [], questions: [], mistakes: [], now: NOW },
      topic(),
    );
    expect(sheetTitleLine(sheet, "Biology")).toBe("Biology — Algebra (3.2.1)");
    expect(sheetTitleLine(buildRevisionSheet({ topicId: TOPIC_ID, attempts: [], questions: [], mistakes: [], now: NOW }, topic({ specRef: undefined })), "biology")).toBe("Biology — Algebra");
  });
});
