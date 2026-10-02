import { describe, expect, it } from "vitest";
import { diagnosticItems, probeFromAttempt } from "@/domain/diagnostic-items";
import type { Attempt, Question } from "@/domain/types";

const q = (id: string, o: Partial<Question> = {}): Question => ({
  id, subjectId: "s", topicIds: ["t"], kind: "short", stem: id, totalMarks: 2, calculatorAllowed: true, difficulty: 2, origin: "seed",
  createdAt: "2026-01-01T00:00:00.000Z", parts: [{ id: `${id}:a`, label: "", prompt: "p", marks: 2, markScheme: ["a"], modelAnswer: "m" }], ...o,
}) as Question;
const att = (o: Partial<Attempt>): Attempt => ({ id: "a", userId: "u", questionId: "x", subjectId: "s", topicIds: ["t"], answers: {}, marked: [], awarded: 2, max: 2, feedback: "", markedBy: "rubric", elapsedMs: 45_000, mode: "practice", createdAt: "2026-09-01T00:00:00Z", ...o });

describe("diagnostic items", () => {
  it("keeps only the requested subject and maps depth", () => {
    const items = diagnosticItems("s", [q("r"), q("other", { subjectId: "x" }), q("t", { learning: { demand: "transfer", familyId: "f", contextId: "c", expectedMinutes: 4 } as Question["learning"] })]);
    expect(items.map((i) => [i.id, i.depth])).toEqual([["r", "recall"], ["t", "hard-application"]]);
    expect(items[1]!.expectedSeconds).toBe(240);
  });
  it("derives probes from marks, time and support", () => {
    const item = diagnosticItems("s", [q("r")])[0]!;
    expect(probeFromAttempt(att({ awarded: 2 }), item, true)).toMatchObject({ correct: true, confident: true, seconds: 45, hinted: false });
    expect(probeFromAttempt(att({ awarded: 1 }), item, false).correct).toBe(false);
    expect(probeFromAttempt(att({ hintTier: "cue" }), item, true).hinted).toBe(true);
    expect(probeFromAttempt(att({ copiedAnswer: true }), item, true).hinted).toBe(true);
  });
});
