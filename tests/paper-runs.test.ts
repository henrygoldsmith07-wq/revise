import { describe, expect, it } from "vitest";
import { paperRunScores } from "../src/domain/exam-outlook";
import { buildSubjectGraph, type GraphInput, type SubjectGraph } from "../src/domain/knowledge-graph";
import type { Attempt } from "../src/domain/types";

let seq = 0;
function paperAttempt(overrides: Partial<Attempt> = {}): Attempt {
  seq += 1;
  return {
    id: `a-${seq}`,
    userId: "local",
    questionId: `q-${seq}`,
    subjectId: "bio",
    topicIds: ["t1"],
    answers: {},
    marked: [],
    awarded: 6,
    max: 10,
    feedback: "",
    markedBy: "rubric",
    elapsedMs: 60_000,
    mode: "paper",
    paperRunId: "run-1",
    createdAt: "2026-06-01T09:00:00Z",
    ...overrides,
  };
}

describe("paperRunScores", () => {
  it("collapses one sitting's attempts into a single score", () => {
    const runs = paperRunScores([
      paperAttempt({ awarded: 4, max: 10, paperRunId: "run-1" }),
      paperAttempt({ awarded: 6, max: 10, paperRunId: "run-1" }),
      paperAttempt({ awarded: 8, max: 10, paperRunId: "run-1" }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ runKey: "run-1", awarded: 18, max: 30, percent: 60, questionCount: 3 });
  });

  it("keeps separate runs separate and orders newest first", () => {
    const runs = paperRunScores([
      paperAttempt({ paperRunId: "run-old", createdAt: "2026-01-01T09:00:00Z" }),
      paperAttempt({ paperRunId: "run-new", createdAt: "2026-06-01T09:00:00Z" }),
      paperAttempt({ paperRunId: "run-new", createdAt: "2026-06-01T09:05:00Z", awarded: 8 }),
    ]);
    expect(runs.map((r) => r.runKey)).toEqual(["run-new", "run-old"]);
    expect(runs[0]).toMatchObject({ percent: 70, questionCount: 2 });
  });

  it("falls back to per-day grouping for legacy runs without a run id", () => {
    const runs = paperRunScores([
      paperAttempt({ paperRunId: undefined, createdAt: "2026-06-01T09:00:00Z" }),
      paperAttempt({ paperRunId: undefined, createdAt: "2026-06-01T14:00:00Z" }),
      paperAttempt({ paperRunId: undefined, createdAt: "2026-06-02T09:00:00Z" }),
    ]);
    expect(runs).toHaveLength(2); // two days = two sittings
  });

  it("ignores non-paper attempts and zero-max rows", () => {
    const runs = paperRunScores([
      paperAttempt({ mode: "practice", paperRunId: undefined }),
      paperAttempt({ max: 0, awarded: 0, paperRunId: undefined }),
    ]);
    expect(runs).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Graph integration: the exam node carries real runs, not just the band.
// Reuses minimal inline fixtures (the full-graph suite covers the chain).
// ---------------------------------------------------------------------

const subject = {
  id: "bio",
  qualificationId: "q",
  name: "Biology",
  gradeBoundaries: [{ grade: "A", percent: 70 }],
  papers: [],
} as never;

function graphInput(attempts: Attempt[]): GraphInput {
  return {
    subject,
    units: [],
    topics: [],
    questions: [],
    cards: [],
    attempts,
    mistakes: [],
    mastery: [],
    predictions: [],
    examDates: [],
    targetGrades: {},
  };
}

describe("buildSubjectGraph × real paper runs", () => {
  it("syncs real sittings into the exam node with an average", () => {
    const graph: SubjectGraph = buildSubjectGraph(
      graphInput([
        paperAttempt({ paperRunId: "run-a", createdAt: "2026-06-01T09:00:00Z", awarded: 7, max: 10 }),
        paperAttempt({ paperRunId: "run-a", createdAt: "2026-06-01T09:10:00Z", awarded: 5, max: 10 }),
        paperAttempt({ paperRunId: "run-b", createdAt: "2026-06-10T09:00:00Z", awarded: 9, max: 10 }),
      ]),
    );
    expect(graph.exam.paperRuns.map((r) => r.runKey)).toEqual(["run-b", "run-a"]);
    expect(graph.exam.paperRunAverage).toBe(75); // (60 + 90) / 2
    expect(graph.exam.paperRuns[0]).toMatchObject({ percent: 90, questionCount: 1 });
  });

  it("stays null when only practice attempts exist — no invented performance", () => {
    const graph = buildSubjectGraph(graphInput([paperAttempt({ mode: "practice", paperRunId: undefined })]));
    expect(graph.exam.paperRuns).toEqual([]);
    expect(graph.exam.paperRunAverage).toBeNull();
  });

  it("never mixes another subject's runs into the node", () => {
    const graph = buildSubjectGraph(
      graphInput([paperAttempt({ subjectId: "chem", paperRunId: "run-c" })]),
    );
    expect(graph.exam.paperRuns).toEqual([]);
    expect(graph.exam.paperRunAverage).toBeNull();
  });
});
