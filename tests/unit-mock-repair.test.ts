import { describe, expect, it } from "vitest";
import { getSubject, topicsFor } from "@/domain/curriculum";
import { seedQuestions } from "@/content";
import { buildUnitMock, repairShortfall, unitMockBlueprints, type UnitMockPick } from "@/domain/unit-mock";
import type { Question } from "@/domain/types";

const NOW = new Date("2026-10-30T12:00:00Z");

function q(id: string, marks: number, topicId = "t1"): Question {
  return { id, subjectId: "s", topicIds: [topicId], totalMarks: marks } as unknown as Question;
}
function pick(id: string, marks: number, topicId = "t1"): UnitMockPick {
  return { questionId: id, marks, topicIds: [topicId], exposure: "fresh" };
}

describe("repairShortfall", () => {
  const base = { target: new Map([["t1", 10]]), allocated: new Map([["t1", 8]]), rank: () => 0 };

  it("returns null when no swap can close the gap", () => {
    expect(repairShortfall({ ...base, picks: [pick("a", 4), pick("b", 4)], pool: [q("x", 4)], shortBy: 1 })).toBeNull();
  });

  it("prefers adding one question over a swap when one fits exactly", () => {
    const result = repairShortfall({ ...base, picks: [pick("a", 4)], pool: [q("x", 1), q("y", 5)], shortBy: 1 });
    expect(result?.removed).toEqual([]);
    expect(result?.added.map((x) => x.id)).toEqual(["x"]);
  });

  it("swaps a 4-mark pick for a 5-mark question to gain one mark", () => {
    const result = repairShortfall({ ...base, picks: [pick("a", 4), pick("b", 3)], pool: [q("y", 5)], shortBy: 1 });
    expect(result?.removed.map((x) => x.questionId)).toEqual(["a"]);
    expect(result?.added.map((x) => x.id)).toEqual(["y"]);
  });

  it("can drop one pick and add two to close the gap", () => {
    const result = repairShortfall({ ...base, picks: [pick("a", 4)], pool: [q("p", 2), q("r", 3)], shortBy: 1 });
    expect(result?.removed.map((x) => x.questionId)).toEqual(["a"]);
    expect(result?.added.map((x) => x.id).sort()).toEqual(["p", "r"]);
  });
});

describe("AS unit mocks reach the real mark total", () => {
  for (const id of ["wjec-alevel-physics", "wjec-alevel-chemistry", "wjec-alevel-biology", "wjec-alevel-maths"]) {
    it(`${id} Unit 1 and Unit 2 papers are complete with no repeated question`, () => {
      const subject = getSubject(id)!;
      const topics = topicsFor(id);
      const questions = seedQuestions.filter((question) => question.subjectId === id);
      const blueprints = unitMockBlueprints({ subject, topics, yearGroup: "year-12" });
      expect(blueprints.map((b) => b.unit)).toEqual([1, 2]);
      for (const blueprint of blueprints) {
        const mock = buildUnitMock({ blueprint, questions, topics, attempts: [], now: NOW });
        expect(mock.totalMarks).toBe(blueprint.marks);
        expect(mock.complete).toBe(true);
        expect(new Set(mock.questionIds).size).toBe(mock.questionIds.length);
        expect(mock.picks.reduce((sum, p) => sum + p.marks, 0)).toBe(blueprint.marks);
        expect(mock.notes.some((note) => note.includes("ran out of fitting questions"))).toBe(false);
      }
    });
  }

  it("is deterministic for the same seed", () => {
    const subject = getSubject("wjec-alevel-chemistry")!;
    const topics = topicsFor(subject.id);
    const questions = seedQuestions.filter((question) => question.subjectId === subject.id);
    const blueprint = unitMockBlueprints({ subject, topics, yearGroup: "year-12" })[0];
    const a = buildUnitMock({ blueprint, questions, topics, attempts: [], now: NOW, seed: 3 });
    const b = buildUnitMock({ blueprint, questions, topics, attempts: [], now: NOW, seed: 3 });
    expect(a.questionIds).toEqual(b.questionIds);
  });
});
