import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { pointCoverage } from "@/domain/marking-language";
import { y12PhysicsCases } from "./fixtures/marking-y12-physics-set";

// Pass 62. Seven Year 12 Physics questions, each with a correct own-words answer
// and a plausible wrong one (author judgement, not moderated marks).
// Before: wrong answers earned 4 marks an examiner gives 0 for; correct answers
// scored 10/15 (four under-credited). After: no wrong answer earns a mark and
// correct answers score 11/15. Tightening is welcome; loosening is a regression.
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCases.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
const sum = (list: typeof rows) => list.reduce((n, r) => n + r.awarded, 0);

describe("Year 12 Physics answers in a student's own words", () => {
  it("no wrong answer earns a mark (was 4 over-credited)", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("correct answers are never over-credited and score at least 12/15", () => {
    const correct = rows.filter((r) => r.kind === "correct");
    expect(correct.filter((r) => r.awarded > r.examiner)).toEqual([]);
    expect(sum(correct)).toBeGreaterThanOrEqual(25);
  });
  it("air resistance counts as drag; 'the same size as' as equals", () => {
    expect(pointCoverage("At terminal speed drag equals weight", "air resistance is the same size as the weight")).toBeGreaterThanOrEqual(0.5);
    expect(pointCoverage("drag increases", "air resistance decreases")).toBeLessThan(0.7);
  });
  it("a guarded answer explains why the mark was removed", () => {
    const q = byId.get("cnt:question:physics-depth-nuclear-sp-03-activity-definition-0")!;
    const ok = markQuestion(q, { [q.parts[0]!.id]: "Activity is the number of nuclei in the sample that decay every second. 1 Bq is one decay per second." });
    expect(ok.awarded).toBe(2);
  });
});

describe("pass 65 wording equivalents", () => {
  it("smallest energy / free an electron / angle turned through read as the scheme's words", () => {
    expect(pointCoverage("The work function φ is the minimum energy needed to release an electron from the metal's surface", "It is the smallest amount of energy needed to free an electron from the metal surface")).toBeGreaterThanOrEqual(0.6);
    expect(pointCoverage("Angular velocity is the rate of change of angular displacement", "It is how fast the angle turned through changes with time")).toBeGreaterThanOrEqual(0.6);
    expect(pointCoverage("minimum energy needed to release an electron", "the largest energy an electron can have")).toBeLessThan(0.7);
  });
});
