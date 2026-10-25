import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { y12PhysicsCasesPass76 } from "./fixtures/marking-y12-physics-set4";

// Pass 76. Critical angle, binding energy, beta-minus conservation and molecular
// kinetic energy: a correct own-words answer and a plausible wrong one each
// (author judgement, not moderated marks).
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCasesPass76.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
describe("pass 76 Year 12 Physics own-words answers", () => {
  it("no wrong answer earns more than the examiner", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("every correct own-words answer reaches full marks", () => {
    expect(rows.filter((r) => r.kind === "correct" && r.awarded !== r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("a squared-temperature claim loses the proportionality mark and a positron answer earns nothing", () => {
    const f = (suffix: string, kind: "correct" | "wrong") => rows.find((r) => r.id.endsWith(suffix) && r.kind === kind)!;
    expect(f("kinetic-energy", "wrong").awarded).toBe(2);
    expect(f("particle-conservation", "wrong").awarded).toBe(0);
    expect(f("particle-conservation", "correct").awarded).toBe(3);
  });
});
