import { describe, expect, it } from "vitest";
import { seedQuestions } from "@/content";
import { markQuestion } from "@/domain/marking";
import { y12PhysicsCasesPass74 } from "./fixtures/marking-y12-physics-set3";

// Pass 74. Four more questions, a correct own-words answer and a plausible wrong one
// each (author judgement, not moderated marks). Before: the wrong filament-lamp
// answer scored 3/3, the wrong polarisation answer kept a mark, and three correct
// answers lost marks on wording (polarisation 1/3, sonar 1/3, terminal speed 2/3).
const byId = new Map(seedQuestions.map((q) => [q.id, q]));
const rows = y12PhysicsCasesPass74.map((c) => {
  const q = byId.get(c.id);
  if (!q) throw new Error(`missing question ${c.id}`);
  return { ...c, awarded: markQuestion(q, { [q.parts[0]!.id]: c.answer }).awarded };
});
const find = (suffix: string, kind: "correct" | "wrong") => rows.find((r) => r.id.endsWith(suffix) && r.kind === kind)!;

describe("pass 74 Year 12 Physics own-words answers", () => {
  it("no wrong answer earns more than the examiner", () => {
    expect(rows.filter((r) => r.kind === "wrong" && r.awarded > r.examiner).map((r) => r.answer)).toEqual([]);
  });
  it("no correct answer is over-credited", () => {
    expect(rows.filter((r) => r.kind === "correct" && r.awarded > r.examiner)).toEqual([]);
  });
  it("a falling filament-lamp resistance and a longitudinal-light claim earn nothing", () => {
    expect(find("filament-lamp", "wrong").awarded).toBe(0);
    expect(find("polarisation", "wrong").awarded).toBe(0);
  });
  it("own-words polarisation, sonar and terminal-speed answers reach full marks", () => {
    expect(find("polarisation", "correct").awarded).toBe(3);
    expect(find("sonar-log", "correct").awarded).toBe(3);
    expect(find("terminal-speed", "correct").awarded).toBe(3);
  });
  it("the sonar formula slip earns no more than 1", () => {
    expect(find("sonar-log", "wrong").awarded).toBeLessThanOrEqual(1);
  });
});
