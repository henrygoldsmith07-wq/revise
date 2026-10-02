import { describe, expect, it } from "vitest";
import { reviewQueue } from "@/domain/coverage-queue";
import type { Question, Topic } from "@/domain/types";

const topics: Topic[] = [{ id: "t", subjectId: "s", unitId: "u", title: "T", order: 1, intrinsicDifficulty: 2, summary: "", keyPoints: [], commonErrors: [], specPoints: [
  { id: "sp1", ref: "1", text: "", aos: ["AO1"] }, { id: "sp2", ref: "2", text: "", aos: ["AO1"] }] }];
const q = (id: string, specs: string[], demand = "recall"): Question => ({
  id, subjectId: "s", topicIds: ["t"], kind: "short", stem: id, totalMarks: 2, calculatorAllowed: true, difficulty: 2, origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
  learning: { demand, familyId: id } as Question["learning"], parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 2, markScheme: ["a"], modelAnswer: "m", specPointIds: specs }],
}) as Question;

describe("review queue", () => {
  it("puts the review that unlocks the most untouched statements first, and explains it", () => {
    const rows = reviewQueue({ subjectId: "s", topics, questions: [q("one", ["sp1"]), q("both", ["sp1", "sp2"])], trustedQuestion: () => false });
    expect(rows[0]!.questionId).toBe("both");
    expect(rows[0]!.gain).toMatch(/first trusted question for 2 statements/);
  });
  it("never queues already-trusted questions", () => {
    const rows = reviewQueue({ subjectId: "s", topics, questions: [q("a", ["sp1"]), q("b", ["sp2"])], trustedQuestion: (x) => x.id === "a" });
    expect(rows.map((r) => r.questionId)).toEqual(["b"]);
  });
  it("diminishes after simulated approvals, so depth beats a second recall item", () => {
    const rows = reviewQueue({ subjectId: "s", topics, questions: [q("r1", ["sp1"]), q("r2", ["sp1"]), q("tr", ["sp1"], "transfer")], trustedQuestion: () => false });
    expect(rows.map((r) => r.questionId).indexOf("tr")).toBeLessThan(rows.map((r) => r.questionId).indexOf("r2"));
  });
});
