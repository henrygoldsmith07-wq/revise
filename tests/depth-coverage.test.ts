import { describe, expect, it } from "vitest";
import { allTopics } from "@/domain/curriculum";
import { seedCardsForTopic, seedQuestions } from "@/content";
import { buildSubjectDepth, deepStatementCoverage, FLAGSHIP_SUBJECTS } from "@/domain/flagship";
import type { Question } from "@/domain/types";

function cardCounts(topicIds: string[]) {
  const map = new Map<string, number>();
  for (const id of topicIds) {
    const topic = allTopics().find((t) => t.id === id);
    if (topic) map.set(id, seedCardsForTopic(topic, "depth-test").length);
  }
  return map;
}

describe("flagship depth coverage (auditable quality bar)", () => {
  it("meets the bar only when every rung is present", () => {
    const topicId = "wjec-test-subject.topic-a";
    const base = {
      id: topicId,
      subjectId: "wjec-test-subject",
      verification: "verified" as const,
      source: "authored" as const,
      reviewer: "examiner",
      lastChecked: "2026-09-01",
      specVersion: "2024-1.0",
      keyPoints: ["kp"],
      commonErrors: ["ce"],
      specPoints: [
        {
          id: `${topicId}.sp-01`,
          ref: "T1(a)",
          text: "claim",
          aos: ["AO2"] as const,
          source: "authored" as const,
          verification: "verified" as const,
          reviewer: "examiner",
          lastChecked: "2026-09-01",
          specVersion: "2024-1.0",
        },
      ],
    } as never;
    const part = (over: Partial<Question["parts"][number]> & { id: string }) =>
      ({
        label: "",
        prompt: "p",
        marks: 2,
        markScheme: ["point"],
        modelAnswer: "worked",
        aos: ["AO2"],
        specPointIds: [`${topicId}.sp-01`],
        learningClaims: ["point"],
        ...over,
      }) as Question["parts"][number];
    const mk = (id: string, demand: Question["learning"] extends never ? never : string, marks = 2): Question =>
      ({
        id,
        subjectId: "wjec-test-subject",
        topicIds: [topicId],
        kind: "structured",
        stem: "s",
        parts: [part({ id: `${id}:0` })],
        totalMarks: marks,
        calculatorAllowed: false,
        difficulty: 3,
        origin: "seed",
        source: "authored",
        verification: "verified",
        reviewer: "examiner",
        lastChecked: "2026-09-01",
        specVersion: "2024-1.0",
        learning: { familyId: `${id}-f`, contextId: `${id}-c`, demand: demand as never, expectedMinutes: 3 },
      }) as unknown as Question;
    const questions = [
      mk("recall-1", "recall", 1),
      mk("app-1", "application"),
      mk("transfer-1", "transfer"),
      mk("misc-1", "misconception"),
      { ...mk("syn-1", "synoptic", 6), totalMarks: 6 } as Question,
    ];
    const rows = deepStatementCoverage({ topics: [base], questions, cardCountByTopic: new Map([[topicId, 3]]) });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.meetsBar).toBe(true);
    expect(rows[0]?.missing).toEqual([]);
    // Removing transfer breaks the bar honestly.
    const withoutTransfer = deepStatementCoverage({
      topics: [base],
      questions: questions.filter((q) => q.id !== "transfer-1"),
      cardCountByTopic: new Map([[topicId, 3]]),
    });
    expect(withoutTransfer[0]?.meetsBar).toBe(false);
    expect(withoutTransfer[0]?.missing).toContain("transfer");
  });

  it("reports an honest deep share for every flagship (0–1, never invented)", () => {
    for (const f of FLAGSHIP_SUBJECTS) {
      const topics = allTopics().filter((t) => t.id.startsWith(`${f.subjectId}.`));
      const depth = buildSubjectDepth({ topics, questions: seedQuestions, cardCountByTopic: cardCounts(topics.map((t) => t.id)) });
      expect(depth.statementsTotal).toBeGreaterThan(0);
      expect(depth.deepShare).toBeDefined();
      expect(depth.deepShare!).toBeGreaterThanOrEqual(0);
      expect(depth.deepShare!).toBeLessThanOrEqual(1);
      // Deep is stricter than gold.
      expect(depth.deepShare!).toBeLessThanOrEqual(depth.goldShare + 0.001);
    }
  });
});
