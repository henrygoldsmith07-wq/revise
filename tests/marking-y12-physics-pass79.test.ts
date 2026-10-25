import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { y12PhysicsCasesPass79 } from "./fixtures/marking-y12-physics-set7";

// Pass 79. de Broglie, ideal gas, induced emf, orbital speed, projectile, specific heat, standing wave
// (author judgement, not moderated marks).
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCasesPass79.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
describe("pass 79 Year 12 Physics own-words answers", () => {
  it("no wrong answer earns more than the examiner", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => [r.awarded, r.answer])).toEqual([]);
  });
  it("every correct own-words answer reaches full marks", () => {
    expect(rows.filter((r) => r.kind === "correct" && r.awarded !== r.examiner).map((r) => [r.awarded, r.answer])).toEqual([]);
  });
});
