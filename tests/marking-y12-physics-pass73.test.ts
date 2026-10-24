import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { y12PhysicsCasesPass73 } from "./fixtures/marking-y12-physics-set2";

// Pass 73. Six more questions, a correct own-words answer and a plausible wrong
// one each (author judgement, not moderated marks). Before: two wrong answers
// (resonance damping, thermistor) kept 1 mark an examiner would not give, and four
// correct answers lost a mark on wording (two are now 3/3; thermistor and planetary stay 2/3). Loosening is a regression.
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCasesPass73.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
const find = (suffix: string, kind: "correct" | "wrong") => rows.find((r) => r.id.endsWith(suffix) && r.kind === kind)!;

describe("pass 73 Year 12 Physics own-words answers", () => {
  it("no wrong answer earns more than the examiner (was 2 over-credited)", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("no correct answer is over-credited", () => {
    expect(rows.filter((r) => r.kind === "correct" && r.awarded > r.examiner)).toEqual([]);
  });
  it("heavy damping giving a bigger, sharper peak and a rising thermistor output earn nothing", () => {
    expect(find("resonance-damping", "wrong").awarded).toBe(0);
    expect(find("sensor-circuit-note", "wrong").awarded).toBe(0);
    expect(find("planetary-mission-report", "wrong").awarded).toBe(0);
  });
  it("own-words damping, shielding and vacuum answers reach full marks (were 2/3)", () => {
    expect(find("resonance-damping", "correct").awarded).toBe(3);
    expect(find("thermal-storage-log", "correct").awarded).toBe(3);
  });
  it("correct answers score at least 16 of 18 (was 14)", () => {
    expect(rows.filter((r) => r.kind === "correct").reduce((n, r) => n + r.awarded, 0)).toBeGreaterThanOrEqual(16);
  });
});
