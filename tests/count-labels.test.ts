import { describe, expect, it } from "vitest";
import { countLabel, marksLabel } from "@/domain/plural";
import { buildMarksIntelligence } from "@/domain/readiness-intelligence";
import type { Attempt, Mistake, Question } from "@/domain/types";

// Thirty-first pass. The 360px walkthrough showed a fresh student "1 marks"
// on a question, "1 open marks; application is weaker than recall." on
// readiness, and "Only 0 timed answers so far".

describe("count labels", () => {
  it("says 1 mark, 0 marks, 2 marks", () => {
    expect(marksLabel(1)).toBe("1 mark");
    expect(marksLabel(0)).toBe("0 marks");
    expect(marksLabel(2)).toBe("2 marks");
    expect(marksLabel(1, "open")).toBe("1 open mark");
    expect(marksLabel(3, "open")).toBe("3 open marks");
    expect(countLabel(1, "timed answer")).toBe("1 timed answer");
    expect(countLabel(2, "timed answer")).toBe("2 timed answers");
  });
});

const NOW = new Date("2026-10-18T12:00:00Z");

const question: Question = {
  id: "q1", subjectId: "physics", topicIds: ["shm"], kind: "structured", stem: "Stem",
  parts: [{ id: "q1:a", label: "", prompt: "Answer.", marks: 1, markScheme: ["a"], modelAnswer: "model" }],
  totalMarks: 1, calculatorAllowed: true, difficulty: 3, origin: "seed", createdAt: "2026-01-01T09:00:00Z",
};

const attempt: Attempt = {
  id: "a1", userId: "u1", questionId: "q1", subjectId: "physics", topicIds: ["shm"], answers: {}, marked: [],
  awarded: 0, max: 1, feedback: "", markedBy: "rubric", elapsedMs: 60_000, mode: "practice", createdAt: "2026-10-17T10:00:00Z",
};

const mistake: Mistake = {
  id: "m1", userId: "u1", subjectId: "physics", topicId: "shm", questionId: "q1", attemptId: "a1",
  marksLost: 1, description: "Lost a mark", category: "method", resolved: false, createdAt: "2026-10-17T10:00:00Z",
};

describe("readiness copy with one open mark and no timed answers", () => {
  const intel = buildMarksIntelligence({
    mistakes: [mistake], attempts: [attempt], questions: [question], subjectIds: ["physics"],
    timedAttempts: 0, now: NOW,
  });
  const text = JSON.stringify(intel);

  it("never says '1 open marks' or 'Only 0 timed answers'", () => {
    expect(intel.evidence).not.toBe("none");
    expect(text).not.toMatch(/\b1 open marks\b/);
    expect(text).not.toContain("Only 0 timed answers");
    expect(intel.categories.find((c) => c.key === "insufficient-practice")?.detail)
      .toBe("No timed answers yet — pace under pressure is unproven.");
  });

  it("an opportunity worth one mark says '1 open mark'", () => {
    const reasons = intel.opportunities.map((o) => o.reason);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((r) => r.startsWith("1 open mark;"))).toBe(true);
  });
});
