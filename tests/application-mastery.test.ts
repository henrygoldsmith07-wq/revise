import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { computeApplicationMastery } from "@/domain/application-mastery";
import type { Attempt, Question, Topic } from "@/domain/types";

const NOW = "2026-08-18T09:00:00.000Z";

function topic(id: string): Topic {
  return {
    id,
    subjectId: "physics",
    unitId: "unit-1",
    title: id,
    order: 0,
    intrinsicDifficulty: 3,
    summary: "summary",
    keyPoints: ["point"],
    commonErrors: ["error"],
  };
}

function question(id: string, topicIds: string[], difficulty: Question["difficulty"] = 3): Question {
  return {
    id,
    subjectId: "physics",
    topicIds,
    kind: "short",
    stem: "Question",
    parts: [],
    totalMarks: 10,
    calculatorAllowed: true,
    difficulty,
    origin: "seed",
    createdAt: NOW,
  };
}

function attempt(id: string, questionId: string, topicIds: string[], awarded: number, mode: Attempt["mode"] = "practice", overrides: Partial<Attempt> = {}): Attempt {
  return {
    id,
    userId: "u",
    questionId,
    subjectId: "physics",
    topicIds,
    answers: {},
    marked: [],
    awarded,
    max: 10,
    feedback: "feedback",
    markedBy: "rubric",
    elapsedMs: 1000,
    mode,
    createdAt: NOW,
    ...overrides,
  };
}

describe("application mastery", () => {
  it("measures marked question performance without letting recall or provisional marks inflate it", () => {
    const rows = computeApplicationMastery({
      topics: [topic("a"), topic("b")],
      questions: [question("q1", ["a"], 4), question("q2", ["a"]), question("q3", ["b"])],
      attempts: [
        attempt("a1", "q1", ["a"], 8),
        attempt("a2", "q2", ["a"], 10, "recall"),
        attempt("a3", "q3", ["b"], 10, "practice", {
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
      ],
    });

    expect(rows.find((row) => row.topicId === "a")).toMatchObject({
      mastery: 0.8,
      accuracy: 0.8,
      marksAwarded: 8,
      marksAvailable: 10,
      attempts: 1,
      averageDifficulty: 4,
      evidence: "emerging",
    });
    expect(rows.find((row) => row.topicId === "b")).toMatchObject({
      mastery: 0,
      attempts: 0,
      evidence: "unmeasured",
    });
  });

  it("allocates multi-topic marks and marks reliable recent performance", () => {
    const attempts = Array.from({ length: 10 }, (_, index) =>
      attempt(`a-${index}`, `q-${index}`, ["a", "b"], index < 5 ? 6 : 10),
    );
    const rows = computeApplicationMastery({
      topics: [topic("a"), topic("b")],
      questions: attempts.map((item) => question(item.questionId, item.topicIds)),
      attempts,
    });

    expect(rows[0]).toMatchObject({
      mastery: 0.8,
      accuracy: 0.8,
      marksAwarded: 40,
      marksAvailable: 50,
      attempts: 10,
      questionsAttempted: 10,
      recentAccuracy: 1,
      evidence: "reliable",
    });
    expect(rows[1].marksAwarded).toBe(40);
    expect(rows[1].marksAvailable).toBe(50);
  });

  it("wires the Progress view to application evidence", () => {
    const progress = readFileSync(join(process.cwd(), "src/app/progress/page.tsx"), "utf8");
    const panels = readFileSync(join(process.cwd(), "src/components/AssessmentPanels.tsx"), "utf8");
    const store = readFileSync(join(process.cwd(), "src/state/store.tsx"), "utf8");

    expect(progress).toContain("ApplicationMasteryCard");
    expect(panels).toContain("Application mastery");
    expect(panels).toContain("applicationMastery");
    expect(store).toContain("computeApplicationMastery");
  });
});
