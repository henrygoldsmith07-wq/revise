import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { y12PhysicsCasesPass78 } from "./fixtures/marking-y12-physics-set6";

// Pass 78. Efficiency, Young modulus, internal resistance and photoelectric work function.
// (author judgement, not moderated marks).
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCasesPass78.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
describe("pass 78 Year 12 Physics own-words answers", () => {
  it("no wrong answer earns more than the examiner", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("every correct own-words answer reaches full marks", () => {
    expect(rows.filter((r) => r.kind === "correct" && r.awarded !== r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("hf = phi + KEmax in symbols earns the photoelectric balance mark, and a flipped sign does not", () => {
    const q = byId.get(y12PhysicsCasesPass78.find((c) => c.id.endsWith("work-function"))!.id)!;
    const mark = (a: string) => markQuestion(q, { [q.parts[0]!.id]: a }).marked[0]!;
    expect(mark("E = hf = 5.304e-19 J. hf = phi + KEmax so phi = 5.304e-19 - 1.2e-19 = 4.104e-19 J.").missedPoints).toEqual([]);
    expect(mark("hf = 5.3e-19 J. hf = phi - KEmax so phi = 6.5e-19 J.").awarded).toBeLessThan(3);
  });
});
