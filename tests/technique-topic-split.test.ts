import { describe, expect, it } from "vitest";
import { knowledgeVsAnswering, knowledgeVsAnsweringByTopic } from "../src/domain/exam-technique";
import type { Mistake } from "../src/domain/types";

const SUBJECT = "aqa-alevel-biology";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}${seq}`;
}

function mistake(topicId: string, overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: nextId("m"),
    userId: "local",
    subjectId: SUBJECT,
    topicId,
    description: "miss",
    category: "interpretation", // legacy → 25% knowledge / 75% answering, quarter weight
    resolved: false,
    marksLost: 4,
    createdAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("knowledgeVsAnsweringByTopic", () => {
  it("aggregates each topic's own losses into separate reports", () => {
    const mistakes = [
      mistake("t-a"), mistake("t-a"), mistake("t-a"), mistake("t-a"), // 4 × interpretation
      mistake("t-b", { category: "recall" }), mistake("t-b", { category: "recall" }), mistake("t-b", { category: "recall" }),
      mistake("t-b", { category: "recall" }), // 4 × knowledge gap
      mistake("t-c", { category: "arithmetic" }), // 1 loss only
    ];
    const rows = knowledgeVsAnsweringByTopic({ subjectId: SUBJECT, mistakes });
    expect(rows.map((r) => r.topicId).sort()).toEqual(["t-a", "t-b", "t-c"]);
    const a = rows.find((r) => r.topicId === "t-a")!.report;
    const b = rows.find((r) => r.topicId === "t-b")!.report;
    const c = rows.find((r) => r.topicId === "t-c")!.report;
    // Same math as the subject view: interpretation → 75% answering; recall → 100% knowledge.
    expect(a.answeringShare).toBeCloseTo(0.75, 2);
    expect(a.knowledgeShare).toBeCloseTo(0.25, 2);
    expect(b.knowledgeShare).toBe(1);
    expect(a.topicId).toBe("t-a");
    expect(a.subjectId).toBe(SUBJECT);
    expect(c.mistakes).toBe(1);
  });

  it("sorts worst-first by weighted marks lost", () => {
    const mistakes = [
      mistake("light", { marksLost: 1 }),
      mistake("heavy", { marksLost: 9 }),
    ];
    const rows = knowledgeVsAnsweringByTopic({ subjectId: SUBJECT, mistakes });
    expect(rows[0]?.topicId).toBe("heavy");
  });

  it("never mixes another subject's losses into the topic view", () => {
    const mistakes = [
      mistake("t-a"),
      mistake("t-a", { subjectId: "aqa-alevel-chemistry" }),
    ];
    const rows = knowledgeVsAnsweringByTopic({ subjectId: SUBJECT, mistakes });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.report.mistakes).toBe(1);
  });

  it("returns empty (not an error) when the subject has no losses", () => {
    expect(knowledgeVsAnsweringByTopic({ subjectId: SUBJECT, mistakes: [] })).toEqual([]);
  });

  it("matches a topic-scoped direct call", () => {
    const mistakes = [mistake("t-a"), mistake("t-a"), mistake("t-b")];
    const aggregated = knowledgeVsAnsweringByTopic({ subjectId: SUBJECT, mistakes }).find(
      (r) => r.topicId === "t-a",
    )!.report;
    const direct = knowledgeVsAnswering({ subjectId: SUBJECT, topicId: "t-a", mistakes });
    expect(aggregated).toEqual(direct);
  });
});
