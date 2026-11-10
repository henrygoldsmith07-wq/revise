import { describe, expect, it } from "vitest";
import { readFullMarks } from "@/domain/full-marks-reading";
import type { Question } from "@/domain/types";

// A full-mark answer says what the student did (unaided on a new question,
// on a familiar one, or with help) separately from what Revise can claim.
// It never calls an answer on an unreviewed question proof or evidence.

const q = (id: string, familyId?: string): Question => ({
  id, subjectId: "s", topicIds: ["t"], kind: "short", stem: `Stem ${id}`, totalMarks: 2, calculatorAllowed: true, difficulty: 2, origin: "seed", createdAt: "2026-01-01T00:00:00.000Z",
  parts: [{ id: `${id}.a`, label: "", prompt: "Explain.", marks: 2, markScheme: ["a", "b"], modelAnswer: "a b" }],
  ...(familyId ? { learning: { familyId } } : {}),
} as unknown as Question);

const questions = new Map([q("q1", "fam-1"), q("q2", "fam-1"), q("q3", "fam-2")].map((x) => [x.id, x] as const));
const attempt = { id: "now", questionId: "q1", createdAt: "2026-11-10T10:00:00.000Z" };
const read = (over: Partial<Parameters<typeof readFullMarks>[0]> = {}) =>
  readFullMarks({ attempt, question: questions.get("q1")!, earlier: [], questionFor: (id) => questions.get(id), reviewed: false, ...over });

describe("readFullMarks", () => {
  it("unaided on a question never answered before is said plainly", () => {
    const reading = read();
    expect(reading.kind).toBe("unaided-new");
    expect(reading.headline).toMatch(/on your own/);
    expect(reading.headline).toMatch(/had not seen/);
  });

  it("the same question, or a near copy from its family, is familiar", () => {
    expect(read({ earlier: [{ id: "old", questionId: "q1", createdAt: "2026-11-01T10:00:00.000Z" }] }).kind).toBe("unaided-repeat");
    const copy = read({ earlier: [{ id: "old", questionId: "q2", createdAt: "2026-11-01T10:00:00.000Z" }] });
    expect(copy.kind).toBe("unaided-repeat");
    expect(copy.headline).toMatch(/very like/);
    // A different family, and the attempt itself, do not make it familiar.
    expect(read({ earlier: [{ id: "old", questionId: "q3", createdAt: "2026-11-01T10:00:00.000Z" }, { ...attempt }] }).kind).toBe("unaided-new");
  });

  it("any help makes it supported, whatever else is true", () => {
    for (const support of [{ hintTier: "cue" as const }, { repairTeachingSeen: true }, { copiedAnswer: true }]) {
      expect(read({ attempt: { ...attempt, ...support } }).kind).toBe("supported");
    }
  });

  it("never calls an unreviewed answer proof or evidence", () => {
    for (const reviewed of [false, true]) {
      for (const over of [{}, { attempt: { ...attempt, hintTier: "scaffold" as const } }, { earlier: [{ id: "old", questionId: "q1", createdAt: "2026-11-01T10:00:00.000Z" }] }]) {
        const reading = read({ ...over, reviewed });
        const text = `${reading.headline} ${reading.detail} ${reading.claim}`;
        expect(text).not.toMatch(/counts as (your own )?evidence|is proven|you have proved|mastered/i);
        if (!reviewed) expect(reading.claim).toMatch(/practice, not proof/);
        else expect(reading.claim).toMatch(/becomes proof once/);
      }
    }
  });
});
