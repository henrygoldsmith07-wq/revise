import { describe, expect, it } from "vitest";
import { traceQuestion, traceTopic, traceTopics } from "@/domain/knowledge-tracing";
import type { Attempt, Card, Question, Topic } from "@/domain/types";

const topic = (id: string, subjectId = "science"): Topic => ({
  id, subjectId, unitId: "unit", title: id, order: 0, intrinsicDifficulty: 3,
  summary: "summary", keyPoints: ["point"], commonErrors: [],
});
const attempt = (id: string, topicId: string, awarded: number, overrides: Partial<Attempt> = {}): Attempt => ({
  id, userId: "u", questionId: "q", subjectId: "science", topicIds: [topicId],
  answers: {}, marked: [], awarded, max: 10, feedback: "", markedBy: "rubric",
  elapsedMs: 60_000, mode: "practice", createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});
const question: Question = {
  id: "q", subjectId: "science", topicIds: ["a"], kind: "short", stem: "Question",
  parts: [], totalMarks: 10, calculatorAllowed: false, difficulty: 3,
  origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
};

describe("knowledge tracing with sparse evidence", () => {
  it("uses partial credit smoothly around the former 60 percent cliff", () => {
    const a = traceTopic({ topic: topic("a"), attempts: [attempt("low", "a", 5.9)], cards: [] });
    const b = traceTopic({ topic: topic("a"), attempts: [attempt("high", "a", 6.1)], cards: [] });
    expect(b.pKnown).toBeGreaterThan(a.pKnown);
    expect(b.pKnown - a.pKnown).toBeLessThan(0.05);
  });

  it("shrinks a new topic toward independent evidence in the same subject", () => {
    const topics = [topic("a"), topic("b"), topic("else", "other")];
    const history = new Map([
      ["a", Array.from({ length: 8 }, (_, i) => attempt("good-" + i, "a", 10))],
      ["b", [] as Attempt[]], ["else", [] as Attempt[]],
    ]);
    const rows = traceTopics({ topics, attemptsByTopic: history, cardsByTopic: new Map<string, Card[]>() });
    expect(rows.find((row) => row.topicId === "b")!.pKnown).toBeGreaterThan(0.35);
    expect(rows.find((row) => row.topicId === "else")!.pKnown).toBe(0.35);
  });

  it("discounts hinted success and excludes it from item calibration", () => {
    const independent = attempt("solo", "a", 10);
    const assisted = attempt("hint", "a", 10, { hintTier: "scaffold" });
    const soloTrace = traceTopic({ topic: topic("a"), attempts: [independent], cards: [] });
    const hintTrace = traceTopic({ topic: topic("a"), attempts: [assisted], cards: [] });
    expect(soloTrace.pKnown).toBeGreaterThan(hintTrace.pKnown);
    expect(traceQuestion({ question, attempts: [assisted] }).attempts).toBe(0);
  });

  it("keeps an untrusted self-mark out of both learner and item estimates", () => {
    const self = attempt("self", "a", 10, { markedBy: "self" });
    expect(traceTopic({ topic: topic("a"), attempts: [self], cards: [] }).attempts).toBe(0);
    expect(traceQuestion({ question, attempts: [self] }).attempts).toBe(0);
  });

  it("lets item evidence enter gradually without calling five mixed attempts reliable", () => {
    const one = traceQuestion({ question, attempts: [attempt("one", "a", 0)] });
    const four = traceQuestion({ question,
      attempts: Array.from({ length: 4 }, (_, i) => attempt("miss-" + i, "a", 0)) });
    const mixed = traceQuestion({ question,
      attempts: Array.from({ length: 5 }, (_, i) => attempt("mix-" + i, "a", i % 2 ? 10 : 0)) });
    expect(one.empiricalDifficulty).toBe(3);
    expect(four.empiricalDifficulty).toBeGreaterThan(one.empiricalDifficulty);
    expect(mixed.reliable).toBe(false);
  });
});