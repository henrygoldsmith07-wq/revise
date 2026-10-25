import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { y12PhysicsCasesPass77 } from "./fixtures/marking-y12-physics-set5";

// Pass 77. SHM condition, half-life, explosion momentum and field potential.
// (author judgement, not moderated marks).
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCasesPass77.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
describe("pass 77 Year 12 Physics own-words answers", () => {
  it("no wrong answer earns more than the examiner", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("every correct own-words answer reaches full marks", () => {
    expect(rows.filter((r) => r.kind === "correct" && r.awarded !== r.examiner).map((r) => r.answer)).toEqual([]);
  });
});
