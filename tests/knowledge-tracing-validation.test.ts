import { describe, expect, it } from "vitest";
import { buildKTSnapshots, evaluateKTFuture, buildKnowledgeTracingValidationReport } from "@/domain/knowledge-tracing-validation";
import type { Attempt, Card, Topic } from "@/domain/types";
import { createCard } from "@/domain/scheduling";

function topic(id: string): Topic {
  return { id, subjectId: "subj", unitId: "unit", title: id, order: 0, intrinsicDifficulty: 3, summary: "s", keyPoints: ["k"], commonErrors: [] };
}
function attempt(topicId: string, awarded: number, max: number, at: string): Attempt {
  return { id: `a-${at}-${topicId}-${awarded}`, userId: "u", questionId: "q", subjectId: "subj", topicIds: [topicId], answers: {}, marked: [], awarded, max, feedback: "", markedBy: "rubric", elapsedMs: 1000, mode: "practice", createdAt: at };
}
function card(topicId: string, id: string, at: string): Card {
  return { ...createCard({ id, userId: "u", subjectId: "subj", topicId, front: "f", back: "b" }, new Date(at)), stability: 5, reps: 2, lastReviewedAt: at };
}

describe("knowledge-tracing validation", () => {
  it("weak predicted skills produce future errors, strong skills transfer", () => {
    const topics = [topic("weak"), topic("strong"), topic("mid"), topic("weak2"), topic("strong2"), topic("mid2"), topic("weak3"), topic("strong3")];
    const attemptsByTopic = new Map<string, Attempt[]>();
    const cardsByTopic = new Map<string, Card[]>();
    for (const t of topics) {
      const isWeak = t.id.startsWith("weak");
      const isStrong = t.id.startsWith("strong");
      const before = isWeak ? [attempt(t.id, 1, 10, "2025-05-01T00:00:00.000Z"), attempt(t.id, 2, 10, "2025-05-02T00:00:00.000Z"), attempt(t.id, 1, 10, "2025-05-03T00:00:00.000Z")] : isStrong ? [attempt(t.id, 9, 10, "2025-05-01T00:00:00.000Z"), attempt(t.id, 8, 10, "2025-05-02T00:00:00.000Z"), attempt(t.id, 9, 10, "2025-05-03T00:00:00.000Z")] : [attempt(t.id, 5, 10, "2025-05-01T00:00:00.000Z")];
      const after = isWeak ? [attempt(t.id, 2, 10, "2025-06-01T00:00:00.000Z"), attempt(t.id, 1, 10, "2025-06-02T00:00:00.000Z")] : isStrong ? [attempt(t.id, 9, 10, "2025-06-01T00:00:00.000Z"), attempt(t.id, 8, 10, "2025-06-02T00:00:00.000Z")] : [attempt(t.id, 5, 10, "2025-06-01T00:00:00.000Z")];
      attemptsByTopic.set(t.id, [...before, ...after]);
      cardsByTopic.set(t.id, []);
    }
    const snaps = buildKTSnapshots({ topics, attemptsByTopic, cardsByTopic, cutoff: "2025-05-15T00:00:00.000Z" });
    const outcomes = evaluateKTFuture({ snapshots: snaps, attemptsByTopic });
    const report = buildKnowledgeTracingValidationReport({ snapshots: snaps, outcomes });
    expect(report.insufficientData).toBe(false);
    expect(report.weakSkillPower.weakProducesErrorRate).toBeGreaterThan(0.5);
    expect(report.weakSkillPower.strongTransferRate).toBeGreaterThan(0.5);
    expect(report.overallAccuracy).not.toBeNull();
  });

  it("prerequisite weaknesses explain downstream difficulty", () => {
    const topics = [topic("prereq"), topic("downstream")];
    const attemptsByTopic = new Map<string, Attempt[]>();
    const cardsByTopic = new Map<string, Card[]>();
    // Both weak early, downstream stays weak
    attemptsByTopic.set("prereq", [attempt("prereq", 1, 10, "2025-05-01T00:00:00.000Z"), attempt("prereq", 2, 10, "2025-05-02T00:00:00.000Z"), attempt("prereq", 1, 10, "2025-06-01T00:00:00.000Z")]);
    attemptsByTopic.set("downstream", [attempt("downstream", 1, 10, "2025-05-01T00:00:00.000Z"), attempt("downstream", 2, 10, "2025-05-02T00:00:00.000Z"), attempt("downstream", 1, 10, "2025-06-01T00:00:00.000Z")]);
    cardsByTopic.set("prereq", []);
    cardsByTopic.set("downstream", []);
    const snaps = buildKTSnapshots({ topics, attemptsByTopic, cardsByTopic, cutoff: "2025-05-15T00:00:00.000Z" });
    const outcomes = evaluateKTFuture({ snapshots: snaps, attemptsByTopic });
    const report = buildKnowledgeTracingValidationReport({
      snapshots: snaps,
      outcomes,
      prerequisiteEdges: [{ topicId: "downstream", prerequisiteId: "prereq" }],
    });
    expect(report.prerequisiteExplanation.blockedWeakCount).toBeGreaterThanOrEqual(1);
  });

  it("returns insufficient when too few pairs", () => {
    const topics = [topic("t1")];
    const attemptsByTopic = new Map([["t1", [attempt("t1", 5, 10, "2025-06-01T00:00:00.000Z")]]]);
    const cardsByTopic = new Map();
    const snaps = buildKTSnapshots({ topics, attemptsByTopic, cardsByTopic, cutoff: "2025-05-15T00:00:00.000Z" });
    const outcomes = evaluateKTFuture({ snapshots: snaps, attemptsByTopic });
    const report = buildKnowledgeTracingValidationReport({ snapshots: snaps, outcomes });
    expect(report.insufficientData).toBe(true);
  });
});
